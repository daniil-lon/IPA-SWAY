import fs from 'node:fs';

let code = fs.readFileSync('worker.mjs', 'utf8');
const target = "if(path.startsWith('/api/admin/')){\r\n   return await adminRoute(req,path,method,url,env,tracks.length);\r\n  }";

if (!code.includes(target)) {
  // Try with \n
  const targetLF = "if(path.startsWith('/api/admin/')){\n   return await adminRoute(req,path,method,url,env,tracks.length);\n  }";
  if (!code.includes(targetLF)) {
    console.error('Target not found in worker.mjs');
    process.exit(1);
  }
}

const replacement = `if(path === '/admin' || path === '/admin/'){
   return env.ASSETS.fetch(new Request(new URL('/admin.html', url), req));
  }
  if(path.startsWith('/api/admin/')){
   return await adminRoute(req,path,method,url,env,tracks.length);
  }
  if(path === '/api/telegram/webhook'){
   return await handleTelegramWebhook(req, env, tracks.length);
  }
  if(path === '/api/promo' && method === 'GET'){
   return await handlePublicPromo(env);
  }
  if(path === '/api/editorial-playlists' && method === 'GET'){
   return await handlePublicEditorialPlaylists(env);
  }
  if(path === '/api/broadcasts/active' && method === 'GET'){
   return await handlePublicActiveBroadcasts(env);
  }`;

code = code.replace(/if\(path\.startsWith\('\/api\/admin\/'\)\)\{\s*return await adminRoute\(req,path,method,url,env,tracks\.length\);\s*\}/, replacement);
fs.writeFileSync('worker.mjs', code, 'utf8');
console.log('Worker routes updated successfully!');
