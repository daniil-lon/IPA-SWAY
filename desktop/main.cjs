'use strict';
const { app, BrowserWindow, ipcMain, protocol, session, dialog, nativeImage, Tray, Menu } = require('electron');
const {randomUUID}=require('node:crypto');
const path = require('node:path');
const fs = require('node:fs/promises');
const { assetResponse, fileResponse, libraryRoot } = require('./local-assets.cjs');
const { LocalLibrary } = require('./local-library.cjs');

const inspectPortArgument = process.argv.find(value => /^--inspect-ui-port=\d+$/.test(value));
const requestedInspectPort = Number(inspectPortArgument?.split('=')[1] || 9238);
const inspectPort = requestedInspectPort >= 1024 && requestedInspectPort <= 65535 ? requestedInspectPort : 9238;
const inspect = process.argv.includes('--inspect-ui') || Boolean(inspectPortArgument);
const smoke = process.argv.includes('--smoke');
const mediaCheck = smoke && process.argv.includes('--media-check');
const screenshotArg = process.argv.find(value => value.startsWith('--screenshot='));
const referenceArg = process.argv.find(value => value.startsWith('--reference-size='));
const referenceMatch = referenceArg?.match(/^--reference-size=(\d{3,4})x(\d{3,4})$/);
const referenceSize = referenceMatch ? { width: Math.max(960, Math.min(3840, Number(referenceMatch[1]))), height: Math.max(680, Math.min(2160, Number(referenceMatch[2]))) } : { width: 1280, height: 800 };
const origin = 'sway://app';
if (smoke) setTimeout(() => { console.error('Native smoke exceeded 30 seconds.'); app.exit(1); }, 30000).unref();
let audioPickerOpen = false;
let mainWindow;
let tray, quitting=false;
let desktopSettings={closeToTray:false};
app.setName('Sway');
app.setAppUserModelId('ru.sway.desktop');
// A separate portable profile keeps the existing website and original player untouched.
const userDataDirectory = path.join(__dirname, smoke ? '.data-smoke' : '.data');
const localLibrary = new LocalLibrary(userDataDirectory);
require('node:fs').mkdirSync(userDataDirectory, { recursive: true });
app.setPath('userData', userDataDirectory);
if (inspect) {
  app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1');
  app.commandLine.appendSwitch('remote-debugging-port', String(inspectPort));
}
protocol.registerSchemesAsPrivileged([{ scheme: 'sway', privileges: {
  standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true
} }]);

function ownFrame(event) {
  return mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents &&
    event.senderFrame === mainWindow.webContents.mainFrame && event.senderFrame.url.startsWith(origin + '/');
}
function publishWindowState() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('desktop:window-state', { maximized: mainWindow.isMaximized() });
}
ipcMain.handle('desktop:window-control', (event, action) => {
  if (!ownFrame(event)) throw new Error('Invalid frame');
  if (action === 'minimize') mainWindow.minimize();
  else if (action === 'maximize') mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  else if (action === 'close') mainWindow.close();
  else if (action !== 'state') throw new Error('Unknown window control');
  return { maximized: mainWindow && !mainWindow.isDestroyed() ? mainWindow.isMaximized() : false };
});
ipcMain.handle('desktop:local-library', async event => {
  if (!ownFrame(event)) throw new Error('Invalid frame');
  return localLibrary.list();
});
ipcMain.handle('desktop:remove-local', async (event, id) => {
  if (!ownFrame(event) || typeof id !== 'string') throw new Error('Invalid request');
  await localLibrary.remove(id); return true;
});
ipcMain.handle('desktop:local-duration', async (event, {id, seconds} = {}) => {
  if (!ownFrame(event) || typeof id !== 'string') throw new Error('Invalid request');
  await localLibrary.updateDuration(id, seconds); return true;
});
ipcMain.handle('desktop:preferences', async (event, update) => {
  if(!ownFrame(event))throw new Error('Invalid frame');
  if(update&&typeof update.closeToTray==='boolean'){
    desktopSettings.closeToTray=update.closeToTray;
    await fs.writeFile(path.join(userDataDirectory,'desktop-settings.json'),JSON.stringify(desktopSettings));
  }
  return {...desktopSettings};
});
ipcMain.handle('desktop:pick-cover',async event=>{
  if(!ownFrame(event))throw new Error('Invalid frame');
  const selected=await dialog.showOpenDialog(mainWindow,{title:'Обложка плейлиста',properties:['openFile','dontAddToRecent'],filters:[{name:'Изображения',extensions:['png','jpg','jpeg','webp']}]});
  if(selected.canceled)return null;
  const file=selected.filePaths[0],stat=await fs.stat(file);
  if(stat.size>8*1024*1024)throw new Error('Изображение должно быть меньше 8 МБ');
  let art=nativeImage.createFromPath(file);if(art.isEmpty())throw new Error('Не удалось открыть изображение');
  const size=art.getSize(),scale=Math.min(1,1024/Math.max(size.width,size.height));
  art=art.resize({width:Math.max(1,Math.round(size.width*scale)),height:Math.max(1,Math.round(size.height*scale))});
  const id=randomUUID(),directory=path.join(userDataDirectory,'artwork');await fs.mkdir(directory,{recursive:true});await fs.writeFile(path.join(directory,id+'.jpg'),art.toJPEG(90));
  return `${origin}/artwork/${id}`;
});
ipcMain.handle('desktop:export-playlist',async(event,value)=>{
  if(!ownFrame(event)||!value||typeof value.title!=='string'||!Array.isArray(value.trackIds))throw new Error('Invalid playlist');
  const payload={format:'sway-playlist',version:1,title:value.title.slice(0,100),description:String(value.description||'').slice(0,1000),trackIds:value.trackIds.filter(id=>typeof id==='string'&&id.length<300).slice(0,10000)};
  const safeName=payload.title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/g,'')||'Плейлист';
  const selected=await dialog.showSaveDialog(mainWindow,{title:'Экспорт плейлиста',defaultPath:safeName+'.sway-playlist.json',filters:[{name:'Плейлист Sway',extensions:['json']}]});
  if(selected.canceled)return false;
  await fs.writeFile(selected.filePath,JSON.stringify(payload,null,2));return true;
});
ipcMain.handle('desktop:pick-audio', async (event, kind = 'music') => {
  if (!ownFrame(event) || audioPickerOpen) return [];
  if (!['music','book','podcast'].includes(kind)) throw new Error('Invalid media type');
  audioPickerOpen = true;
  try {
    const extensions = ['mp3', 'm4a', 'flac', 'wav', 'ogg', 'opus', 'aac'];
    const selected = await dialog.showOpenDialog(mainWindow, {
      title: 'Добавить музыку с компьютера', buttonLabel: 'Добавить',
      properties: ['openFile', 'multiSelections', 'dontAddToRecent'],
      filters: [{ name: 'Аудиофайлы', extensions }]
    });
    if (selected.canceled || !mainWindow || mainWindow.isDestroyed()) return [];
    return await localLibrary.add(selected.filePaths, kind);
  } finally { audioPickerOpen = false; }
});

async function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'Sway', ...referenceSize, minWidth: 960, minHeight: 680,
    frame: false, backgroundColor: '#0d0d0d', show: !smoke, focusable: !smoke, skipTaskbar: smoke,
    autoHideMenuBar: true, icon: path.join(libraryRoot(), 'art/icon-512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false,
      contextIsolation: true, sandbox: true, webSecurity: true,
      autoplayPolicy: 'user-gesture-required', spellcheck: false, backgroundThrottling: !smoke
    }
  });
  mainWindow.setMenu(null);
  mainWindow.on('close',event=>{if(desktopSettings.closeToTray&&!quitting&&!smoke){event.preventDefault();mainWindow.hide();}});
  mainWindow.on('maximize', publishWindowState);
  mainWindow.on('unmaximize', publishWindowState);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => { if (!url.startsWith(origin + '/')) event.preventDefault(); });
  mainWindow.webContents.on('render-process-gone', (_event, details) => console.error('Renderer exited:', details.reason));
  const rendererErrors = [];
  mainWindow.webContents.on('console-message', event => {
    if (event.level === 'error') {
      const detail = `${event.message} (${event.sourceId ?? ''}:${event.lineNumber ?? 0})`;
      rendererErrors.push(detail); console.error('Renderer:', detail);
    }
  });
  mainWindow.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    const detail = `${code} ${description} ${url}`;
    if (isMainFrame) rendererErrors.push(detail);
    console.error('Load failed:', detail);
  });
  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    rendererErrors.push(error.message); console.error('Preload failed:', error.message);
  });
  if (smoke && !mediaCheck) mainWindow.showInactive();
  await mainWindow.loadURL(origin + '/index.html');
  publishWindowState();
  if (smoke || screenshotArg) {
    const outputDirectory = path.join(__dirname, 'artifacts');
    await fs.mkdir(outputDirectory, { recursive: true });
    const result = await mainWindow.webContents.executeJavaScript(`(async()=>{
      const deadline=performance.now()+15000;
      while(document.documentElement.dataset.ready!=='true' && !document.querySelector('.inline-error') && performance.now()<deadline) await new Promise(r=>setTimeout(r,100));
      await Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,2000))]);
      const response=await fetch('/catalog.json');
      const tracks=await response.json();
      const local=await window.desktop.localLibrary();let imported=null;
      if(local.length){
        const first=local[0],part=await fetch(first.audio,{headers:{Range:'bytes=0-31'}});
        const bytes=(await part.arrayBuffer()).byteLength;
        const probe=new Audio();probe.preload='metadata';
        const duration=await new Promise(resolve=>{const timer=setTimeout(()=>resolve(null),5000);probe.onloadedmetadata=()=>{clearTimeout(timer);resolve(probe.duration);};probe.onerror=()=>{clearTimeout(timer);resolve(null);};probe.src=first.audio;});
        imported={id:first.id,count:local.length,status:part.status,bytes,duration,kind:first.kind};probe.removeAttribute('src');probe.load();
      }
      return {ready:document.documentElement.dataset.ready==='true',error:document.querySelector('.inline-error')?.textContent||'',title:document.title,tracks:tracks.length,bridge:!!window.desktop,origin:location.origin,width:innerWidth,height:innerHeight,imported};
    })()`);
    await new Promise(resolve => setTimeout(resolve, 1200));
    const imagePath = mediaCheck ? null : screenshotArg ? path.resolve(screenshotArg.slice('--screenshot='.length)) : path.join(outputDirectory, 'native-smoke.png');
    if(imagePath){
      await fs.mkdir(path.dirname(imagePath), { recursive: true });
      await fs.writeFile(imagePath, (await mainWindow.webContents.capturePage()).toPNG());
    }
    await fs.writeFile(path.join(outputDirectory, 'native-smoke.json'), JSON.stringify({ ...result, rendererErrors, screenshot: imagePath }, null, 2));
    console.log(JSON.stringify(result));
    if (smoke) result.ready && result.bridge ? app.quit() : app.exit(1);
  }
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); }
  });
  app.whenReady().then(async () => {
    await localLibrary.load();
    try{const value=JSON.parse(await fs.readFile(path.join(userDataDirectory,'desktop-settings.json'),'utf8'));desktopSettings.closeToTray=value.closeToTray===true;}catch{}
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    protocol.handle('sway', async request => {
      const url = new URL(request.url);
      if (url.hostname !== 'app') return new Response(null, { status: 403 });
      if(url.pathname.startsWith('/artwork/')){
        const id=url.pathname.slice('/artwork/'.length);
        if(!/^[a-f0-9-]{36}$/.test(id))return new Response(null,{status:404});
        const file=path.join(userDataDirectory,'artwork',id+'.jpg');
        try{return await fileResponse(request,{file,stat:await fs.stat(file)});}catch{return new Response(null,{status:404});}
      }
      if (url.pathname.startsWith('/imported/')) {
        const token = url.pathname.slice('/imported/'.length);
        const item = await localLibrary.resolve(token);
        return item ? fileResponse(request, item) : new Response(null, {status:404});
      }
      return assetResponse(request);
    });
    await createWindow();
    if(!smoke){
      tray=new Tray(nativeImage.createFromPath(path.join(libraryRoot(),'art/icon-512.png')).resize({width:32,height:32}));
      tray.setToolTip('Sway Музыка');
      const send=action=>{if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('desktop:media-action',action);};
      tray.setContextMenu(Menu.buildFromTemplate([{label:'Открыть Sway',click:()=>{mainWindow.show();mainWindow.focus();}},{type:'separator'},{label:'Воспроизвести / Пауза',click:()=>send('play')},{label:'Следующий трек',click:()=>send('next')},{label:'Предыдущий трек',click:()=>send('previous')},{type:'separator'},{label:'Выйти',click:()=>{quitting=true;app.quit();}}]));
      tray.on('double-click',()=>{mainWindow.show();mainWindow.focus();});
    }
  }).catch(error => { console.error(error); app.exit(1); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit',()=>{quitting=true;});
}
