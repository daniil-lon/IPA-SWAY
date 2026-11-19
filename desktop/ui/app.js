import { mountWave } from "./wave.js";
import {PlaybackQueue, shuffled, parseLyrics, activeLyricIndex, recommendTracks} from './playback-model.mjs';
import {AudioEffects, EQ_FREQUENCIES, EQ_PRESETS} from './audio-effects.mjs';
import {createLibraryViews} from './library-views.mjs';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const paths = {
  search: "M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  music: "M9 17V5l12-3v12M9 8l12-3M9 17c0 2-2 4-4 4s-3-1-3-3 2-3 4-3c1 0 3 1 3 2M21 14c0 2-2 4-4 4s-3-1-3-3 2-3 4-3c1 0 3 1 3 2",
  ticket: "M5 2h14v6a4 4 0 0 0 0 8v6h-5a3 3 0 0 0-6 0H5v-6a4 4 0 0 0 0-8V2Zm5 4h4m-4 4h4",
  podcast: "M6 3H3v14h4l4 4V7a4 4 0 0 1 4-4h6v14h-6l-4 4M15 7h3m-3 4h3",
  collection: "M4 15v4c4 4 12 4 16 0v-4M12 16S3 10 4 6c1-5 7-4 8 0 1-4 7-5 8 0 1 4-8 10-8 10Z",
  heart: "M12 21S2 15 2 8a5 5 0 0 1 10-1A5 5 0 0 1 22 8c0 7-10 13-10 13Z",
  play: "m8 4 13 8L8 20Z",
  pause: "M6 4h4v16H6ZM14 4h4v16h-4Z",
  next: "m4 4 12 8L4 20ZM19 4v16",
  previous: "m20 4-12 8 12 8ZM5 4v16",
  shuffle: "M3 6h3c6 0 6 12 12 12h3m-4-4 4 4-4 4M3 18h3c2 0 3-2 4-4m4-4c1-2 2-4 4-4h3m-4-4 4 4-4 4",
  repeat: "M5 6h14l-3-3m3 3-3 3M19 18H5l3-3m-3 3 3 3M3 14V9c0-2 1-3 2-3m16 4v5c0 2-1 3-2 3",
  dislike: "m3 3 18 18M8 5c2-3 6-2 7 1a4 4 0 0 1 7 3c0 2-2 5-4 7M6 6a4 4 0 0 0-4 3c0 5 10 12 10 12l3-3",
  lyrics: "M3 5h18M8 5v14m-4 0h8m3-9h6m-6 4h6m-6 4h6",
  queue: "M9 5h12M9 12h12M9 19h12M3 4h1v2H3ZM3 11h1v2H3ZM3 18h1v2H3Z",
  sliders: "M3 5h10m4 0h4M3 12h3m4 0h11M3 19h10m4 0h4M13 3h4v4h-4ZM6 10h4v4H6ZM13 17h4v4h-4Z",
  volume: "m3 8 5 0 5-5v18l-5-5H3V8Zm14-1a7 7 0 0 1 0 10m3-13a11 11 0 0 1 0 16",
  chevron: "m9 5 7 7-7 7",
  folder: "M2 6V4h7l3 3h10v13H2V6Z",
  history: "M3 10a9 9 0 1 1 0 5M3 4v6h6m3-4v6l4 2",
  close: "m6 6 12 12M18 6 6 18",
  plus: "M12 4v16M4 12h16",
  check: "m4 12 5 5L21 5",
  album: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  download: "M12 2v13m-5-5 5 5 5-5M3 16v6h18v-6"
};
let referenceIcons = {}, iconPaths = {};
const icon = (name) => {
  const ref = referenceIcons[name];
  return `<i aria-hidden="true"><svg viewBox="${typeof ref === "object" ? ref.viewBox : "0 0 24 24"}"${ref ? ' class="reference-icon"' : ""}>${ref ? (iconPaths[typeof ref === "object" ? ref.id : ref] ? `<g fill="none">${iconPaths[typeof ref === "object" ? ref.id : ref]}</g>` : `<use href="./reference-icons.svg#${typeof ref === "object" ? ref.id : ref}"/>`) : `<path d="${paths[name] || paths.music}"/>`}</svg></i>`;
};
function hydrateIcons(root = document) {
  $$("[data-icon]", root).forEach((el) => {
    const name = el.dataset.icon, active = el.closest(".nav-main button.active");
    el.innerHTML = icon(active && referenceIcons[`${name}-active`] ? `${name}-active` : name).replace(/^<i[^>]*>|<\/i>$/g, "");
  });
}
const content = $("#content"), audio = $("#audio"), overlay = $("#overlay");
const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(`sway.desktop.${key}`)) ?? fallback;
  } catch {
    return fallback;
  }
};
const save = (key, value) => {
  try {
    localStorage.setItem(`sway.desktop.${key}`, JSON.stringify(value));
  } catch {
    toast("Не удалось сохранить изменения на этом компьютере");
  }
};
let tracks = [], albums = [], artists = [], chart = [], byId = /* @__PURE__ */ new Map(), wave = null, searchTimer, toastTimer, currentRoute = { page: "home" }, collectionTab = "playlists", searchTab = "all", searchLandingTab = "popular", waveMode = "personal";
let liked = new Set(read("liked", [])), history = read("history", []), playlists = read("playlists", []), excluded = new Set(read("excluded", [])), queue = [], queueIndex = 0, playing = false, shuffle = read("shuffle", false), repeat = read("repeat", 0), volume = read("volume", 0.7), current = null;
let waveSeeds=read('waveSeeds',[]);
let waveFilters = read("waveFilters", { mood: "any", language: "any" }), previousVolume = volume || 0.7;
let mediaArtURL = null, mediaGeneration = 0;
const playback = new PlaybackQueue();
const effects = new AudioEffects(audio, read('equalizer',{enabled:false,preset:'flat',gains:Array(10).fill(0),preamp:0}));
let savedAlbums = new Set(read('albums',[])), savedArtists = new Set(read('artists',[])), pins = read('pins',[]);
let localTracks=[], languages={}, listening=read('listening',{}), positions=read('positions',{}), playbackStartedAt=0, countedTrack=null;
let routeBack=[],routeForward=[], routeTraversal=false, viewQuery='',viewSort='default', viewGenre='all', selectedTracks=new Set();
let lyricsState=null,lyricsRequest=0,lyricsScrollHold=0, lyricsMode=read('lyricsMode','sync'),contextMenu=null;
let queueTab='next',sleepDeadline=0,sleepEndTrack=false,persistedAt=0,menuAnchor=null,nativePreferences={closeToTray:false};
let searchHistory=read('searchHistory',[]),draggingEntry=null;
let loadGeneration=0,playedThisLoad=false,listenedSeconds=0,lastTickAt=0,lastMediaTime=0;
let playbackRate=read('playbackRate',1);
function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("visible"), 3500);
}
const fmt = (seconds) => `${Math.floor((seconds || 0) / 60)}:${String(Math.floor((seconds || 0) % 60)).padStart(2, "0")}`;
const plural = (n, a = ["трек", "трека", "треков"]) => `${n.toLocaleString("ru-RU")} ${a[n % 100 >= 11 && n % 100 <= 14 ? 2 : n % 10 === 1 ? 0 : n % 10 >= 2 && n % 10 <= 4 ? 1 : 2]}`;
const image = (src, cls = "", alt = "") => `<img class="${cls}" src="${escape(src || "/art/icon-512.png")}" alt="${escape(alt)}" loading="lazy" draggable="false">`;
const recordTracks = (ids) => ids.map((id) => byId.get(id)).filter(Boolean);
const albumTracks = (item) => recordTracks(item?.trackIds || []);
const artistTracks = (item) => recordTracks(item?.trackIds || []);
const artHeart = () => image("./reference-art/heart.602389ae.png", "heart-art", "Мне нравится");
const libraryViews=createLibraryViews({state:()=>({tracks,albums,artists,byId,liked,history,playlists,savedAlbums,savedArtists,pins,localTracks,selectedTracks,currentRoute,collectionTab}),icon,image,escape,trackRows,plural,route,dialog,closeDialog,toast,save,recordTracks,card,empty,artHeart,backButton,openMenu,closeMenu,refreshView:refreshCurrentView,shuffled,setQueue,waveBy,enqueue,updatePlayer});
function route(page, id, extra) {
  closeMenu();libraryViews.reset();
  if(!routeTraversal&&document.documentElement.dataset.ready==='true'){routeBack.push(routeSnapshot());routeBack=routeBack.slice(-80);routeForward=[];}
  currentRoute = { page, id, ...extra };
  if (wave) {
    wave.destroy();
    wave = null;
  }
  content.scrollTop = 0;
  $("#queue-panel").hidden = true;
  $$(".nav-main [data-go]").forEach((b) => b.classList.toggle("active", b.dataset.go === page || (page === "favorites" || page === "playlist" || page === "history") && b.dataset.go === "collection"));
  hydrateIcons($(".nav-main"));
  if (page === "browse") {
    renderBrowse(id);
    hydrateIcons(content);
    return;
  }
  if (page === "shelf") {
    renderShelf(id);
    hydrateIcons(content);
    return;
  }
  if (page === "home") renderHome();
  else if (page === "search") renderSearch(currentRoute.query||'');
  else if (page === "collection") renderCollection();
  else if (page === "favorites") renderPlaylist("favorites");
  else if (page === "history") renderPlaylist("history");
  else if (page === "playlist") renderPlaylist(id);
  else if (page === "album") renderAlbum(id);
  else if (page === "artist") renderArtist(id);
  else if (page === "chart") renderChart();
  else if (page === "genre") renderGenre(id);
  else if (page === "concerts") renderUnavailable("ticket", "Концерты", "Афиша концертов", "В этой локальной версии афиша ещё не подключена. А музыку любимых исполнителей уже можно слушать.");
  else if (page === "podcasts") renderSpoken();
  hydrateIcons(content);
}
function backButton() {
  return `<button class="page-back" data-action="back" aria-label="Назад">${icon("chevron")}</button>`;
}
function section(title, body, more = "") {
  return `<section class="section"><div class="section-heading"><h2>${escape(title)}</h2>${more}</div>${body}</section>`;
}
function card(item, type = "album") {
  const title = item.title || item.name;
  return `<button class="music-card ${type}" data-open="${type}" data-id="${escape(item.id || item.slug)}"><div class="card-cover">${image(item.art, "", title)}<span class="card-play">${icon("play")}</span></div><strong>${escape(title)}</strong><small>${escape(type === "artist" ? "Исполнитель" : item.artist || item.artistString || item.artists?.join(", ") || "")}</small></button>`;
}
function renderHome() {
  const chosen = ["Ноггано", "YASMI", "GONE.Fludd", "ICEGERGERT"].map((name) => artists.find((a) => a.name.toLowerCase() === name.toLowerCase())).filter(Boolean);
  while (chosen.length < 4) chosen.push(artists[chosen.length]);
  const pickAlbums = albums.filter((a) => a.art && a.trackIds?.length > 2).slice(8, 14);
  content.innerHTML = `<div class="home"><div class="home-hero"><div class="wave-canvas" aria-hidden="true"></div><button class="wave-heading" data-action="wave">${icon(playing && queue.source === "wave" ? "wave-pause" : "wave-play")}<span>Моя волна</span></button><button class="wave-settings" data-action="wave-settings">${icon("sliders")}Настроить</button></div><div class="home-tabs"><button class="home-tab ${waveMode === "personal" ? "active" : ""}" data-wave-mode="personal"><span class="mini-portraits">${chosen.slice(0, 2).map((a) => image(a.art)).join("")}</span><span><b>Для вас</b><small>${chosen.slice(0, 2).map((a) => escape(a.name)).join(", ")}</small></span></button><button class="home-tab ${waveMode === "trends" ? "active" : ""}" data-wave-mode="trends"><span class="mini-portraits">${chosen.slice(2, 4).map((a) => image(a.art)).join("")}</span><span><b>Тренды</b><small>${chosen.slice(2, 4).map((a) => escape(a.name)).join(", ")}</small></span></button></div><div class="home-quick"><button class="quick-card" data-go="favorites">${artHeart()}<span><strong>Мне нравится ${icon("chevron")}</strong><small>${plural(liked.size)}</small></span></button><button class="quick-card" data-go="history"><span class="history-art">${icon("history")}</span><span><strong>История ${icon("chevron")}</strong><small>${escape(history.length ? byId.get(history[0])?.artist : "Всё, что вы слушали")}</small></span></button></div>${section("Вам может понравиться", `<div class="cards">${pickAlbums.map((a) => card(a)).join("")}</div>`)}${section("Чарт", trackRows(recordTracks(chart.slice(0, 5).map((t) => t.trackId || t.id))), '<button data-go="chart">Смотреть всё →</button>')}${section("Ваши исполнители", `<div class="cards">${artists.slice(0, 6).map((a) => card(a, "artist")).join("")}</div>`)}${section("Недавно добавлено", `<div class="cards">${albums.filter((a) => a.year >= 2026).slice(0, 6).map((a) => card(a)).join("")}</div>`)}</div>`;
  wave = mountWave($(".wave-canvas", content));
  wave.setPlaying(playing);
}
function trackRows(list, { limit = 100, numbers = true, selection=false,editable=false } = {}) {
  return `<div class="track-list">${list.slice(0, limit).map((t, i) => `<div class="track-row ${current?.id === t.id ? "current" : ""} ${selectedTracks.has(t.id)?'selected':''}" data-track-row="${escape(t.id)}" ${editable?`draggable="true" data-playlist-index="${currentRoute.playlistOrder?.indexOf(t.id)}"`:''} tabindex="0" role="button" aria-label="Слушать ${escape(t.title)} — ${escape(t.artist)}">${selection?`<label class="track-select"><input type="checkbox" data-select-track="${escape(t.id)}" ${selectedTracks.has(t.id)?'checked':''} aria-label="Выбрать ${escape(t.title)}"><span class="track-index">${i+1}</span></label>`:numbers?`<span class="track-index">${i+1}</span>`:''}${image(t.art, "track-thumb")}<span class="row-play">${icon(current?.id === t.id && playing ? "pause" : "play")}</span><span class="track-text"><strong>${escape(t.title)}${t.isExplicit ? '<span class="explicit" title="Ненормативная лексика">E</span>' : ""}</strong><small data-artist-name="${escape(t.artists?.[0] || t.artist)}">${escape(t.artist)}</small></span><span class="track-album">${escape(t.albumTitle || "")}</span><button class="icon-button ${liked.has(t.id) ? "is-liked" : ""}" data-like="${escape(t.id)}" title="Мне нравится" aria-label="Мне нравится">${icon("heart")}</button><button class="icon-button" data-menu-track="${escape(t.id)}" aria-label="Меню трека">···</button><span class="track-duration">${fmt(t.seconds)}</span></div>`).join("")}</div>${list.length > limit ? `<div class="track-limit"><button class="secondary-button" data-action="show-more">Показать ещё (${list.length - limit})</button></div>` : ""}`;
}
function renderSearch(query = "", tab = searchTab) {
  content.innerHTML = `<div class="page search-page"><div class="search-field">${icon("search")}<input id="search-input" aria-label="Поиск музыки" placeholder="Трек, альбом, исполнитель" autocomplete="off" spellcheck="false" value="${escape(query)}"><button class="clear-search" data-action="clear-search" aria-label="Очистить поиск">×</button></div><div id="search-results"></div></div>`;
  $("#search-input").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => search(e.target.value), 130);
  });
  search(query, tab);
  $("#search-input").focus();
}
function searchLanding() {
  const categories = [["Осенняя", "autumn"], ["Настроения", "moods"], ["Занятия", "activities"], ["Жанры", "genres"], ["Эпохи", "eras"]];
  const recommended = albums.filter((a) => a.art && a.trackIds?.length > 3).slice(16, 19);
  return `<div class="pill-tabs search-browse-tabs"><button data-search-landing="popular" class="${searchLandingTab === "popular" ? "active" : ""}">Популярное</button><button data-search-landing="history" class="${searchLandingTab === "history" ? "active" : ""}">История</button></div>${searchLandingTab === "history" ? `<h2>История прослушивания</h2>${history.length ? trackRows(recordTracks(history)) : empty("history", "История пока пуста", "Слушайте музыку, и недавно включённые треки появятся здесь.")}` : `<h2 class="search-section-title">Подборки музыки ${icon("chevron")}</h2><div class="search-categories">${categories.map(([label, id], i) => `<button class="search-category" data-browse="${id}"><span class="category-stack category-${i}"><span class="category-image" style="--category-index:${i}"></span></span><strong>${label}</strong></button>`).join("")}</div><section class="artist-recommends"><h2 class="search-section-title">Артист рекомендует</h2><div class="recommend-grid">${recommended.map((a) => `<button class="recommend-card" data-open="album" data-id="${escape(a.id)}">${image(a.art)}<span><strong>${escape(a.title)}</strong><small>${escape(a.artistString || a.artists?.join(", "))}</small></span><span class="recommend-play">${icon("play")}</span></button>`).join("")}</div></section><section class="missed-section"><h2 class="search-section-title">Вы могли пропустить ${icon("chevron")}</h2><div class="cards">${albums.slice(30, 35).map((a) => card(a)).join("")}</div></section>`}`;
}
const shelfDefinitions = { autumn: { title: "Осенняя", color: "#8b5939", filter: (t) => t.moods?.some((m) => ["calm", "dark"].includes(m)) }, calm: { title: "Спокойно", color: "#376568", filter: (t) => t.moods?.includes("calm") }, bright: { title: "Бодро", color: "#8b683b", filter: (t) => t.moods?.includes("bright") }, dark: { title: "Меланхолично", color: "#584267", filter: (t) => t.moods?.includes("dark") }, focus: { title: "Сосредоточиться", color: "#384976", filter: (t) => t.moods?.includes("focus") }, work: { title: "Работать", color: "#555d83", filter: (t) => t.moods?.includes("focus") }, walk: { title: "Гулять", color: "#658353", filter: (t) => t.moods?.includes("calm") }, workout: { title: "Тренироваться", color: "#9a4a3e", filter: (t) => t.moods?.includes("bright") }, party: { title: "Танцевать", color: "#9b457c", filter: (t) => t.moods?.includes("bright") } };
function browseCategory(id) {
  if (id === "autumn") route("shelf", "autumn");
  else route("browse", id);
}
function renderBrowse(id) {
  const labels = { moods: "Настроения", activities: "Занятия", genres: "Жанры", eras: "Эпохи" };
  const colors = ["#8a593a", "#70488a", "#8e3a45", "#27616c", "#4c715a", "#857039"];
  let items = [];
  if (id === "moods") items = ["bright", "calm", "dark", "focus"].map((k) => ({ id: k, ...shelfDefinitions[k] }));
  else if (id === "activities") items = ["work", "walk", "workout", "party"].map((k) => ({ id: k, ...shelfDefinitions[k] }));
  else if (id === "genres") items = [...new Set(tracks.map((t) => t.genre).filter(Boolean))].map((g, i) => ({ id: g, title: g, color: colors[i % colors.length], type: "genre" }));
  else if (id === "eras") items = [...new Set(tracks.map((t) => Math.floor(Number(t.albumYear) / 10) * 10).filter((y) => y >= 1900))].sort((a, b) => b - a).map((y, i) => ({ id: `era-${y}`, title: `${y}-е`, color: colors[i % colors.length] }));
  content.innerHTML = `<div class="page">${backButton()}<h1>${escape(labels[id] || "Подборки")}</h1><div class="genres">${items.map((item) => `<button class="genre-card" data-open="${item.type || "shelf"}" data-id="${escape(item.id)}" style="--genre-color:${item.color}">${escape(item.title)}</button>`).join("")}</div>${items.length ? "" : empty("music", "Пока нет подборок", "Для этой категории ещё нет записей в библиотеке.")}</div>`;
}
function renderShelf(id) {
  const era = id.startsWith("era-") ? Number(id.slice(4)) : null;
  const def = era ? { title: `${era}-е`, filter: (t) => Math.floor(Number(t.albumYear) / 10) * 10 === era } : shelfDefinitions[id];
  if (!def) {
    route("search");
    return;
  }
  const list = tracks.filter(def.filter);
  currentRoute.trackIds = list.map((t) => t.id);
  content.innerHTML = `<div class="page">${backButton()}<div class="shelf-hero" style="--shelf-color:${def.color || "#55506a"}"><span>Подборка музыки</span><h1>${escape(def.title)}</h1><p>${plural(list.length)} в вашей библиотеке</p><button class="yellow-button" data-action="play-page" ${list.length ? "" : "disabled"}>${icon("play")}Слушать</button></div>${list.length ? trackRows(list) : empty("music", "Пока нет треков", "В этой подборке пока нет записей из вашей библиотеки.")}</div>`;
}
function search(query, tab = searchTab) {
  currentRoute.query=query;
  searchTab = tab;
  const q = query.trim().toLocaleLowerCase("ru-RU"), results = $("#search-results");
  if (!results) return;
  if (!q) {
    results.innerHTML = searchLandingTab==='history'?searchHistoryLanding():searchLanding();
    currentRoute.searchTracks = searchLandingTab === "history" ? [...history] : [];
    return;
  }
  const ts = tracks.filter((t) => `${t.title} ${t.artist} ${t.albumTitle || ""}`.toLocaleLowerCase("ru-RU").includes(q)), ars = artists.filter((a) => a.name.toLocaleLowerCase("ru-RU").includes(q)), als = albums.filter((a) => `${a.title} ${a.artistString}`.toLocaleLowerCase("ru-RU").includes(q)), pls=playlists.filter(p=>`${p.title} ${p.description||''}`.toLocaleLowerCase('ru-RU').includes(q));
  results.innerHTML = `<div class="pill-tabs">${[["all", "Всё"], ["tracks", "Треки"], ["artists", "Исполнители"], ["albums", "Альбомы"],["playlists","Плейлисты"]].map(([id, label]) => `<button data-search-tab="${id}" class="${id === tab ? "active" : ""}">${label}</button>`).join("")}</div>${!ts.length && !ars.length && !als.length && !pls.length ? `<div class="empty">${icon("search")}<h2>Ничего не найдено</h2><p>Попробуйте другое название или имя исполнителя.</p></div>` : ""}${(tab === "all" || tab === "artists") && ars.length ? `<h2>Исполнители</h2><div class="cards">${ars.slice(0, tab === "all" ? 5 : 60).map((a) => card(a, "artist")).join("")}</div>` : ""}${(tab === "all" || tab === "tracks") && ts.length ? `<h2>Треки</h2>${trackRows(ts, { limit: tab === "all" ? 12 : 100 })}` : ""}${(tab === "all" || tab === "albums") && als.length ? `<h2>Альбомы</h2><div class="cards">${als.slice(0, tab === "all" ? 5 : 60).map((a) => card(a)).join("")}</div>` : ""}`;
  if((tab==='all'||tab==='playlists')&&pls.length)results.insertAdjacentHTML('beforeend','<h2>Плейлисты</h2><div class="cards">'+pls.slice(0,60).map(p=>`<button class="music-card" data-open="playlist" data-id="${escape(p.id)}"><div class="card-cover">${libraryViews.cover(p)}</div><strong>${escape(p.title)}</strong><small>${plural(p.trackIds.length)}</small></button>`).join('')+'</div>');
  currentRoute.searchTracks = ts.map((t) => t.id);
}
function renderCollection(){return libraryViews.renderCollection();}
function empty(i, title, text) {
  return `<div class="empty">${icon(i)}<h2>${escape(title)}</h2><p>${escape(text)}</p><button class="yellow-button" data-go="search">Найти музыку</button></div>`;
}
function renderPlaylist(id){return libraryViews.renderPlaylist(id);}
function renderAlbum(id){return libraryViews.renderAlbum(id);}
function renderArtist(id){return libraryViews.renderArtist(id);}
function renderChart() {
  const ids = chart.map((t) => t.trackId || t.id);
  currentRoute.trackIds = ids;
  content.innerHTML = `<div class="page">${backButton()}<h1>Чарт</h1><p class="muted">Популярные треки из вашей библиотеки</p><button class="yellow-button" data-action="play-page">${icon("play")}Слушать</button><div style="height:20px"></div>${trackRows(recordTracks(ids))}</div>`;
}
function renderGenre(g) {
  const list = tracks.filter((t) => t.genre === g);
  currentRoute.trackIds = list.map((t) => t.id);
  content.innerHTML = `<div class="page">${backButton()}<h1>${escape(g)}</h1><p class="muted">${plural(list.length)}</p><button class="yellow-button" data-action="play-page">${icon("play")}Слушать</button><div style="height:20px"></div>${trackRows(list)}</div>`;
}
function renderUnavailable(i, title, heading, text) {
  content.innerHTML = `<div class="page"><h1>${title}</h1><div class="empty">${icon(i)}<h2>${heading}</h2><p>${text}</p><button class="yellow-button" data-action="${i === "podcast" ? "import" : "wave"}">${i === "podcast" ? "Открыть файл" : "Включить Мою волну"}</button></div></div>`;
}
function updatePins(){return libraryViews.renderPins();}
function setQueue(list, index = 0, source = "library") {
  const ids=list.filter(Boolean).map(t=>typeof t==='string'?t:t.id).filter(id=>byId.has(id));
  if(!ids.length){toast('В этой подборке пока нет доступных треков');return;}
  playback.set(ids,index,source);syncQueue();
  return loadTrack(queue[queueIndex], true);
}
function syncQueue(){queue=playback.ids;queue.source=playback.source;queueIndex=playback.index;persistPlayback();}
function persistPlayback(){if(current)save('playback',playback.snapshot(queue[queueIndex]===current.id?audio.currentTime:0));}
function savePlaybackPosition(){if(!current)return;persistPlayback();if(current.kind==='book'||current.kind==='podcast'){positions[current.id]=audio.ended?0:audio.currentTime;save('positions',positions);}}
function recordListening(type){if(!current||current.local&&current.kind!=='music')return;const s=listening[current.id]||{played:0,completed:0,skipped:0};s[type]=(Number(s[type])||0)+1;s.lastAt=Date.now();listening[current.id]=s;save('listening',listening);}
async function loadTrack(id, autoplay=true, restorePosition=null){
 const t=byId.get(id);if(!t)return;
 savePlaybackPosition();const generation=++loadGeneration;current=t;countedTrack=null;playedThisLoad=false;listenedSeconds=0;lastTickAt=0;lastMediaTime=0;
 audio.src=t.audio;audio.volume=volume;audio.playbackRate=playbackRate;
 const resume=restorePosition??((t.kind==='book'||t.kind==='podcast')?Number(positions[id])||0:0);
 audio.addEventListener('loadedmetadata',()=>{if(generation!==loadGeneration)return;if(Number.isFinite(audio.duration)){audio.currentTime=Math.min(Math.max(0,resume),Math.max(0,audio.duration-.25));lastMediaTime=audio.currentTime;if(t.local){t.seconds=audio.duration;window.desktop?.localDuration?.(id,audio.duration).catch(()=>{});}}persistPlayback();},{once:true});
 audio.load();save('lastTrack',id);persistPlayback();updatePlayer();updateMediaSession();
 if($('.expanded-player'))expandPlayer();if(lyricsState)showLyrics();if(autoplay)await playAudio();if(!$('#queue-panel').hidden)renderQueue();
}
async function playAudio() {
  try {
    await effects.ensure();
    await audio.play();
  } catch (error) {
    playing = false;
    updatePlayer();
    toast(`Не удалось воспроизвести «${current?.title || "трек"}». Проверьте доступность музыкальной библиотеки.`);
  }
}
function togglePlay() {
  if (!current) {
    startWave();
    return;
  }
  if (audio.paused) playAudio();
  else audio.pause();
}
function nextTrack(direction = 1, auto = false) {
  if(!queue.length){startWave();return;}
  if(auto&&sleepEndTrack){cancelSleep();audio.pause();toast('Таймер остановил воспроизведение');return;}
  if(auto&&repeat===2){audio.currentTime=0;playAudio();return;}
  if(!auto&&direction>0&&audio.currentTime<Math.min(30,(audio.duration||Infinity)*.3))recordListening('skipped');
  if(queue.source==='wave'&&direction>0&&queueIndex>=queue.length-8){
    const more=waveCandidates(waveSeeds,40).filter(t=>!queue.slice(-40).includes(t.id));playback.append(more.map(t=>t.id));syncQueue();
  }
  const next=playback.next({direction,automatic:auto,shuffle,repeat:queue.source==='wave'?1:repeat});
  if(next<0){audio.pause();updatePlayer();return;}
  syncQueue();loadTrack(queue[next]);
}
function startWave() {
  waveSeeds=[];save('waveSeeds',waveSeeds);const list=waveCandidates();if(!list.length){toast('Для выбранных настроек пока нет треков');return;}setQueue(list,0,'wave');
}
function waveCandidates(seedIds=[],limit=120){let pool=waveMode==='trends'?recordTracks(chart.map(t=>t.trackId||t.id)):tracks.filter(t=>!t.local||t.kind==='music');if(waveFilters.discovery==='favorite')pool=pool.filter(t=>liked.has(t.id));else if(waveFilters.discovery==='discover')pool=pool.filter(t=>!liked.has(t.id)&&!history.includes(t.id));return recommendTracks(pool,{liked,excluded,stats:listening,history,seedIds,mood:waveFilters.mood,language:waveFilters.language,languages,limit});}
function waveBy(ids){waveSeeds=ids.filter(id=>byId.has(id));save('waveSeeds',waveSeeds);const list=waveCandidates(waveSeeds);if(list.length)setQueue(list,0,'wave');else toast('Для этих настроек пока нет музыки');}
function updatePlayer() {
  $("#now-art").src = current?.art || "/art/icon-512.png";
  $("#now-title").textContent = current?.title || "Выберите музыку";
  $("#now-artist").textContent = current?.artist || "Sway";
  $$(".play-main").forEach((b) => {
    b.innerHTML = icon(playing ? "pause" : "play");
    b.setAttribute("aria-label", playing ? "Пауза" : "Воспроизвести");
    b.title = playing ? "Пауза" : "Воспроизвести";
  });
  $$(".like-current").forEach((b) => {
    b.classList.toggle("is-liked", liked.has(current?.id));
    b.setAttribute("aria-pressed", String(liked.has(current?.id)));
  });
  $$("[data-action=shuffle]").forEach((b) => {
    b.classList.toggle("is-active", shuffle);
    b.setAttribute("aria-pressed", String(shuffle));
  });
  $$("[data-action=repeat]").forEach((b) => {
    b.classList.toggle("is-active", repeat > 0);
    b.title = repeat === 2 ? "Повтор одного трека" : repeat === 1 ? "Повтор очереди" : "Повтор выключен";
    b.dataset.repeat = repeat;
  });
  $$(".track-row").forEach((row) => {
    const rowCurrent=row.closest("#queue-panel")?Number(row.dataset.queueIndex)===queueIndex:row.dataset.trackRow===current?.id;
    row.classList.toggle("current",rowCurrent);
    const glyph = $(".row-play", row);
    if (glyph) glyph.innerHTML = icon(row.dataset.trackRow === current?.id && playing ? "pause" : "play");
  });
  if (wave) {
    wave.setPlaying(playing);
    const h = $(".wave-heading i");
    if (h) h.outerHTML = icon(playing && queue.source === "wave" ? "wave-pause" : "wave-play");
  }
  if ("mediaSession" in navigator) navigator.mediaSession.playbackState = playing ? "playing" : "paused";
}
function toggleLike(id = current?.id) {
  if (!id) {
    toast("Сначала выберите трек");
    return;
  }
  if (liked.has(id)) liked.delete(id);
  else liked.add(id);
  save("liked", [...liked]);
  $$(`[data-like]`).forEach((b) => {
    b.classList.toggle("is-liked", liked.has(b.dataset.like));
  });
  updatePlayer();
  if (["favorites", "collection"].includes(currentRoute.page)) route(currentRoute.page, currentRoute.id);
}
async function updateMediaSession() {
  if (!("mediaSession" in navigator) || !current) return;
  const t = current, generation = ++mediaGeneration, metadata = { title: t.title, artist: t.artist, album: t.albumTitle || "" };
  navigator.mediaSession.metadata = new MediaMetadata(metadata);
  try {
    const response = await fetch(t.art || "/art/icon-512.png");
    if (!response.ok) return;
    const blob = await response.blob();
    if (generation !== mediaGeneration) return;
    if (mediaArtURL) URL.revokeObjectURL(mediaArtURL);
    mediaArtURL = URL.createObjectURL(blob);
    navigator.mediaSession.metadata = new MediaMetadata({ ...metadata, artwork: [{ src: mediaArtURL, sizes: "512x512", type: blob.type }] });
  } catch {
  }
}
function renderQueue() {
  const panel = $("#queue-panel");
  panel.hidden = false;
  const indices=queue.map((_,i)=>i).filter(i=>i>queueIndex);const past=history.filter(id=>id!==current?.id);const count=queueTab==='history'?past.length:indices.length;
  panel.innerHTML=`<div class="queue-heading"><h2>Очередь</h2><button class="icon-button" data-action="close-queue" aria-label="Закрыть очередь">${icon('close')}</button></div><div class="queue-tabs"><button data-queue-tab="next" class="${queueTab==='next'?'active':''}">Далее</button><button data-queue-tab="history" class="${queueTab==='history'?'active':''}">История</button></div><p class="queue-caption">Сейчас играет</p>${current?queueRow(queueIndex,false):'<p class="muted">Выберите музыку</p>'}<div class="queue-caption"><span>${queueTab==='history'?'Вы слушали':'Следующие треки'} · ${count}</span>${queueTab==='next'&&indices.length?'<button data-action="clear-queue">Очистить</button>':''}</div><div class="queue-list">${queueTab==='history'?recordTracks(past).map(t=>`<button class="track-row queue-row" data-queue-history-track="${escape(t.id)}">${image(t.art,'track-thumb')}<span class="track-text"><strong>${escape(t.title)}</strong><small>${escape(t.artist)}</small></span></button>`).join(''):indices.map(i=>queueRow(i,true)).join('')}</div>${!count?'<p class="queue-empty">'+(queueTab==='history'?'Здесь появятся прослушанные треки':'Очередь пока пуста')+'</p>':''}`;
}
function queueRow(index,editable){const t=byId.get(queue[index]);if(!t)return'';return `<div class="track-row queue-row ${index===queueIndex?'current':''}" data-track-row="${escape(t.id)}" data-queue-index="${index}" ${editable?'draggable="true"':''} tabindex="0" role="button" aria-label="Слушать ${escape(t.title)}">${image(t.art,'track-thumb')}<span class="track-text"><strong>${escape(t.title)}</strong><small>${escape(t.artist)}</small></span>${editable?`<span class="queue-row-actions"><button class="icon-button" data-queue-move="${index}" data-direction="-1" aria-label="Выше" title="Выше">↑</button><button class="icon-button" data-queue-move="${index}" data-direction="1" aria-label="Ниже" title="Ниже">↓</button><button class="icon-button" data-queue-remove="${index}" aria-label="Убрать из очереди" title="Убрать из очереди">${icon('close')}</button></span>`:''}</div>`;}
function editQueue(operation){operation();syncQueue();renderQueue();updatePlayer();}
function dialog(body, cls = "") {
  closeMenu();lyricsState=null;lyricsRequest++;
  overlay.hidden = false;
  overlay.innerHTML = `<div class="dialog ${cls}" role="dialog" aria-modal="true"><button class="icon-button dialog-close" data-action="close-dialog" aria-label="Закрыть">${icon("close")}</button>${body}</div>`;
  setTimeout(() => overlay.querySelector("input,select,.yellow-button,.dialog-close")?.focus(), 0);
}
function closeDialog() {
  lyricsState=null;lyricsRequest++;
  overlay.hidden = true;
  overlay.innerHTML = "";
}
function waveSettings(){
 dialog('<h2>Настроить Мою волну</h2><p>Подбор из вашей библиотеки с учётом любимой музыки и прослушиваний.</p><label>Характер музыки</label><div class="filter-options">'+[['any','Разная'],['favorite','Любимая'],['discover','Незнакомая']].map(([k,v])=>'<button data-discovery="'+k+'" class="'+((waveFilters.discovery||'any')===k?'active':'')+'">'+v+'</button>').join('')+'</div><label>Настроение</label><div class="filter-options">'+[['any','Любое'],['bright','Бодрое'],['calm','Спокойное'],['focus','Для работы'],['dark','Меланхоличное']].map(([k,v])=>'<button data-mood="'+k+'" class="'+(waveFilters.mood===k?'active':'')+'">'+v+'</button>').join('')+'</div><label>Текст песни</label><div class="filter-options">'+[['any','Любой'],['ru','Кириллица'],['en','Латиница'],['mixed','Смешанный']].map(([k,v])=>'<button data-language="'+k+'" class="'+(waveFilters.language===k?'active':'')+'">'+v+'</button>').join('')+'</div><p class="wave-language-note">Определяем алфавит по имеющимся текстам. Треки без текста в этот фильтр не попадут.</p><button class="yellow-button" data-action="apply-wave">Слушать Мою волну</button>');
}
function createPlaylist(edit=false,initialTrackId){return libraryViews.editPlaylist(edit,initialTrackId);}
function trackMenu(id = current?.id) {
  const t = byId.get(id);
  if (!t) {
    toast("Сначала выберите трек");
    return;
  }
  const anchor=menuAnchor||$('.more-track');menuAnchor=null;
  openMenu(`<div class="menu-track">${image(t.art)}<span><strong>${escape(t.title)}</strong><small>${escape(t.artist)}</small></span></div><button class="menu-item" role="menuitem" data-like="${escape(id)}">${icon('heart')}${liked.has(id)?'Убрать из любимого':'Мне нравится'}</button><button class="menu-item" role="menuitem" data-play-next="${escape(id)}">${icon('next')}Играть следующим</button><button class="menu-item" role="menuitem" data-add-queue="${escape(id)}">${icon('queue')}Добавить в очередь</button><button class="menu-item" role="menuitem" data-wave-track="${escape(id)}">${icon('wave-play')}Моя волна по треку</button><button class="menu-item" role="menuitem" data-artist-name="${escape(t.artists?.[0]||t.artist)}">${icon('music')}Перейти к исполнителю</button>${t.albumId?`<button class="menu-item" role="menuitem" data-open="album" data-id="${escape(t.albumId)}">${icon('album')}Перейти к альбому</button>`:''}<button class="menu-item" role="menuitem" data-track-lyrics="${escape(id)}">${icon('lyrics')}Текст песни</button><hr><button class="menu-item" role="menuitem" data-choose-playlist="${escape(id)}">${icon('plus')}Добавить в плейлист</button>${libraryViews.playlist(currentRoute.id)?`<button class="menu-item" role="menuitem" data-remove-playlist-track="${escape(id)}">${icon('close')}Убрать из плейлиста</button>`:''}<button class="menu-item" role="menuitem" data-exclude-track="${escape(id)}">${icon('dislike')}${excluded.has(id)?'Снова рекомендовать':'Не рекомендовать'}</button>${t.local?`<button class="menu-item" role="menuitem" data-remove-local="${escape(id)}">${icon('close')}Убрать из библиотеки</button>`:''}`,anchor);
}
function settings() {
  const eq=effects.settings,format=current?.format||(current?.audio?.match(/\.([a-z0-9]+)(?:\?|$)/i)?.[1]||'Аудио').toUpperCase();
  const bitrate=current?.bytes&&current?.seconds?Math.round(current.bytes*8/current.seconds/1000):null;
  dialog(`<h2>Настройки</h2><div class="settings-tabs"><button class="active" data-settings-tab="sound">Звук</button><button data-settings-tab="app">Приложение</button></div><section id="settings-sound"><div class="setting-row"><span>Качество звука<small>Качество исходного файла</small></span><b>${escape(format)}${bitrate?' · ≈'+bitrate+' кбит/с':''}</b></div><div class="setting-row"><span>Громкость</span><input id="settings-volume" type="range" min="0" max="1" step=".01" value="${volume}" aria-label="Громкость"></div><div class="setting-row"><span>Эквалайзер</span><label class="switch"><input id="equalizer-enabled" type="checkbox" ${eq.enabled?'checked':''} aria-label="Эквалайзер"><span></span></label></div><div class="eq-content ${eq.enabled?'':'disabled'}"><div class="eq-preset"><select id="eq-preset" aria-label="Пресет эквалайзера">${Object.entries(EQ_PRESETS).map(([id,p])=>`<option value="${id}" ${eq.preset===id?'selected':''}>${p.title}</option>`).join('')}<option value="custom" ${eq.preset==='custom'?'selected':''}>Свой</option></select><button data-action="reset-eq">Сбросить</button></div><div class="eq-bands">${EQ_FREQUENCIES.map((f,i)=>`<label class="eq-band"><output id="eq-value-${i}">${eq.gains[i]>0?'+':''}${eq.gains[i]}</output><input type="range" min="-12" max="12" step=".5" value="${eq.gains[i]}" data-eq-band="${i}" aria-label="${f} Гц"><span>${f>=1000?f/1000+'k':f}</span></label>`).join('')}</div><label class="preamp-label">Усиление <input id="eq-preamp" aria-label="Усиление эквалайзера" type="range" min="-12" max="6" step=".5" value="${eq.preamp}"><output id="preamp-value">${eq.preamp} дБ</output></label></div><div class="setting-row"><span>Повтор</span><select id="repeat-select" aria-label="Повтор">${[['0','Выключен'],['1','Вся очередь'],['2','Один трек']].map(([v,t])=>`<option value="${v}" ${repeat==v?'selected':''}>${t}</option>`).join('')}</select></div><div class="setting-row"><span>Таймер сна<small id="sleep-status">${sleepLabel()}</small></span><select id="sleep-timer" aria-label="Таймер сна"><option value="off">Выключен</option>${sleepDeadline?`<option value="active" selected disabled>${sleepLabel()}</option>`:''}${[5,15,30,45,60,90].map(m=>`<option value="${m}">${m} минут</option>`).join('')}<option value="track" ${sleepEndTrack?'selected':''}>До конца трека</option></select></div></section><section id="settings-app" hidden><div class="setting-row"><span>Закрывать в трей<small>Музыка продолжит играть после закрытия окна</small></span><input id="close-to-tray" type="checkbox" aria-label="Закрывать в трей" ${nativePreferences.closeToTray?'checked':''}></div><div class="setting-row"><span>Исключённые треки<small>${excluded.size} в вашей библиотеке</small></span><button class="secondary-button" data-action="excluded">Посмотреть</button></div><div class="keyboard-help">Пробел — пауза<br>Ctrl + → / ← — следующий / предыдущий трек<br>Ctrl + ↑ / ↓ — громкость<br>Ctrl + F — поиск<br>Alt + ← / → — история переходов<br>Escape — закрыть меню или окно</div><p>Sway для Windows · ${escape(window.desktop?.version||'1.2.0')}<br>${plural(tracks.length)} · На этом компьютере</p></section>`,'sound-settings');
  $('#settings-volume').addEventListener('input',e=>setVolume(Number(e.target.value)));
  $('#repeat-select').addEventListener('change',e=>{repeat=Number(e.target.value);save('repeat',repeat);updatePlayer();});
  $('#equalizer-enabled').addEventListener('change',async e=>{try{await effects.ensure();effects.set({...effects.settings,enabled:e.target.checked});save('equalizer',effects.settings);$('.eq-content').classList.toggle('disabled',!e.target.checked);}catch{toast('Эквалайзер недоступен на этом устройстве');e.target.checked=false;}});
  $('#eq-preset').addEventListener('change',e=>{const preset=EQ_PRESETS[e.target.value];if(!preset)return;effects.set({...effects.settings,preset:e.target.value,gains:preset.gains});save('equalizer',effects.settings);syncEqualizerControls();});
  $$('[data-eq-band]').forEach(input=>input.addEventListener('input',e=>{const gains=[...effects.settings.gains];gains[Number(e.target.dataset.eqBand)]=Number(e.target.value);effects.set({...effects.settings,gains,preset:'custom'});save('equalizer',effects.settings);syncEqualizerControls();}));
  $('#eq-preamp').addEventListener('input',e=>{effects.set({...effects.settings,preamp:Number(e.target.value)});save('equalizer',effects.settings);$('#preamp-value').textContent=effects.settings.preamp+' дБ';});
  $('#sleep-timer').addEventListener('change',e=>{cancelSleep();if(e.target.value==='track')sleepEndTrack=true;else if(e.target.value!=='off')sleepDeadline=Date.now()+Number(e.target.value)*60000;$('#sleep-status').textContent=sleepLabel();});
  $('#close-to-tray').addEventListener('change',async e=>{try{nativePreferences=await window.desktop.preferences({closeToTray:e.target.checked});}catch{e.target.checked=!e.target.checked;toast('Не удалось сохранить настройку');}});
}
function syncEqualizerControls(){const eq=effects.settings;$$('[data-eq-band]').forEach((input,i)=>{input.value=eq.gains[i];$(`#eq-value-${i}`).textContent=(eq.gains[i]>0?'+':'')+eq.gains[i];});if($('#eq-preset'))$('#eq-preset').value=eq.preset;if($('#eq-preamp'))$('#eq-preamp').value=eq.preamp;}
function cancelSleep(){sleepDeadline=0;sleepEndTrack=false;}
function sleepLabel(){return sleepEndTrack?'До конца трека':sleepDeadline?'Осталось '+Math.max(1,Math.ceil((sleepDeadline-Date.now())/60000))+' мин.':'Выключен';}
function setVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  audio.volume = volume;
  $("#volume").value = volume;
  if($('#settings-volume'))$('#settings-volume').value=volume;
  const mute=$("[data-action=mute]");if(mute){mute.innerHTML=icon(volume?"volume":"volume-off");mute.setAttribute("aria-label",volume?"Выключить звук":"Включить звук");}
  save("volume", volume);
}
function expandPlayer() {
  if (!current) {
    toast("Сначала выберите музыку");
    return;
  }
  const t = current;
  overlay.hidden = false;
  overlay.innerHTML = `<div class="expanded-player" role="dialog" aria-modal="true" style="--cover-tone:hsl(${Number(t.palette?.[0] || 30)} 22% 25%)">${image(t.art, "blur-cover")}<button class="icon-button expanded-close" data-action="close-dialog" aria-label="Свернуть плеер">${icon("close")}</button>${image(t.art, "big-cover", t.title)}<div class="expanded-meta"><h2>${escape(t.title)}</h2><p>${escape(t.artist)}</p></div><div class="expanded-timeline"><span id="expanded-time">${fmt(audio.currentTime)}</span><input id="expanded-seek" aria-label="Позиция воспроизведения" type="range" min="0" max="1000" value="0"><span id="expanded-duration">${fmt(audio.duration || t.seconds)}</span></div><div class="expanded-controls"><button class="icon-button" data-action="shuffle" aria-label="Перемешать">${icon("shuffle")}</button><button class="icon-button" data-action="previous" aria-label="Предыдущий">${icon("previous")}</button><button class="play-main" data-action="play" aria-label="Воспроизвести">${icon(playing ? "pause" : "play")}</button><button class="icon-button" data-action="next" aria-label="Следующий">${icon("next")}</button><button class="icon-button like-current" data-action="like" aria-label="Мне нравится">${icon("heart")}</button></div><div class="expanded-extras"><button data-action="repeat" aria-label="Повтор">${icon("repeat")}</button><button data-action="lyrics">${icon("lyrics")}Текст</button><button data-action="queue">${icon("queue")}Очередь</button><select id="playback-speed" class="speed-control" aria-label="Скорость воспроизведения">${[.5,.75,1,1.25,1.5,1.75,2].map(v=>`<option value="${v}" ${playbackRate===v?'selected':''}>${v}×</option>`).join('')}</select><button data-action="settings">${icon("sliders")}</button></div></div>`;
  $('#playback-speed')?.addEventListener('change',e=>{playbackRate=Number(e.target.value);audio.playbackRate=playbackRate;save('playbackRate',playbackRate);});
  $("#expanded-seek").addEventListener("input", (e) => {
    if (Number.isFinite(audio.duration)) audio.currentTime = audio.duration * e.target.value / 1e3;
  });
  updatePlayer();
}
async function showLyrics() {
  if(!current){toast('Сначала выберите трек');return;}
  const track=current;
  dialog(`<div class="lyrics-header">${image(track.art)}<div><h2>${escape(track.title)}</h2><p>${escape(track.artist)}</p></div></div><div class="lyrics-mode" hidden><button data-lyrics-mode="sync">Следовать за музыкой</button><button data-lyrics-mode="plain">Текст целиком</button></div><div id="lyrics-content" class="lyrics-lines" tabindex="0"><p class="muted">Загрузка текста…</p></div>`,'lyrics-dialog');
  const generation=++lyricsRequest;lyricsState={trackId:track.id,active:-2,timed:[],plain:''};
  try{
    const response=await fetch(`/lyrics/${encodeURIComponent(track.id)}.json`);if(!response.ok)throw new Error('missing');
    const parsed=parseLyrics(await response.json());
    if(generation!==lyricsRequest||current?.id!==track.id)return;
    if(!parsed.plain&&!parsed.timed.length)throw new Error('empty');
    lyricsState={trackId:track.id,active:-2,...parsed};renderLyrics();
  }catch{if(generation===lyricsRequest&&$('#lyrics-content'))$('#lyrics-content').textContent='Для этого трека текст пока недоступен.';}
}
function renderLyrics(){
  if(!lyricsState)return;
  const box=$('#lyrics-content');if(!box)return;
  const sync=lyricsMode==='sync'&&lyricsState.timed.length>0;
  $('.lyrics-mode').hidden=!lyricsState.timed.length;
  $$('[data-lyrics-mode]').forEach(b=>b.classList.toggle('active',b.dataset.lyricsMode===(sync?'sync':'plain')));
  box.innerHTML=sync?lyricsState.timed.map((line,i)=>`<button class="lyric-line" data-lyric-index="${i}" data-lyric-at="${line.at}" aria-label="Перейти к ${fmt(line.at)}">${escape(line.text)||'♪'}</button>`).join(''):`<p class="lyrics-plain">${escape(lyricsState.plain)}</p>`;
  lyricsState.active=-2;lyricsScrollHold=0;updateLyrics();
}
function updateLyrics(){
  if(!lyricsState||lyricsState.trackId!==current?.id||lyricsMode!=='sync')return;
  const index=activeLyricIndex(lyricsState.timed,audio.currentTime);if(index===lyricsState.active)return;
  lyricsState.active=index;
  $$('.lyric-line').forEach((line,i)=>{line.classList.toggle('active',i===index);line.classList.toggle('past',i<index);line.setAttribute('aria-current',i===index?'true':'false');});
  if(performance.now()>lyricsScrollHold&&index>=0)$(`[data-lyric-index="${index}"]`)?.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
}
async function importAudio(kind='music') {
  if (!window.desktop?.pickAudio) {
    toast("Открытие файлов доступно в настольном приложении");
    return;
  }
  try {
    const imported = await window.desktop.pickAudio(kind);
    if (!imported?.length) return;
    for (const t of imported){byId.set(t.id,t);const at=localTracks.findIndex(old=>old.id===t.id);if(at>=0)localTracks[at]=t;else localTracks.push(t);}tracks=tracks.filter(t=>!t.local);tracks.push(...localTracks.filter(t=>t.kind==='music'));
    if(kind!=='music')route('podcasts');else{collectionTab='local';route('collection');}
    toast(`Добавлено: ${imported.length}`);
  } catch {
    toast("Не удалось открыть аудиофайл");
  }
}
const actions = {
  back: () => routeBack.length?navigateHistory(-1):route('home'),
  wave: () => current && queue.source === "wave" ? togglePlay() : startWave(),
  "wave-settings": waveSettings,
  "apply-wave": () => {
    save("waveFilters", waveFilters);
    closeDialog();
    startWave();
  },
  play: togglePlay,
  next: () => nextTrack(),
  previous: () => audio.currentTime > 3 ? audio.currentTime = 0 : nextTrack(-1),
  like: () => toggleLike(),
  shuffle: () => {
    shuffle = !shuffle;
    playback.resetShuffle();
    save("shuffle", shuffle);
    updatePlayer();
  },
  repeat: () => {
    repeat = (repeat + 1) % 3;
    save("repeat", repeat);
    updatePlayer();
  },
  dislike: () => {
    if (!current) return;
    excluded.add(current.id);
    save("excluded", [...excluded]);
    toast("Больше не будем рекомендовать этот трек");
    nextTrack();
  },
  mute: () => {
    if (volume) {
      previousVolume = volume;
      setVolume(0);
    } else setVolume(previousVolume);
  },
  queue: () => {if($(".expanded-player"))closeDialog();$("#queue-panel").hidden ? renderQueue() : $("#queue-panel").hidden = true;},
  "close-queue": () => $("#queue-panel").hidden = true,
  'clear-queue':()=>{playback.ids.splice(queueIndex+1);playback.resetShuffle();syncQueue();renderQueue();},
  'reset-eq':()=>{effects.set({...effects.settings,preset:'flat',gains:[...EQ_PRESETS.flat.gains],preamp:0});save('equalizer',effects.settings);syncEqualizerControls();if($('#preamp-value'))$('#preamp-value').textContent='0 дБ';},
  excluded:showExcluded,
  settings,
  expand: expandPlayer,
  lyrics: showLyrics,
  "close-dialog": closeDialog,
  "track-menu": () => trackMenu(),
  "create-playlist": () => createPlaylist(),
  "rename-playlist": () => createPlaylist(true),
  "play-page": () => setQueue(currentRoute.trackIds || [], 0),
  "artist-wave": () => waveBy(currentRoute.trackIds||[]),
  "current-artist": () => {
    if (current) openArtist(current.artists?.[0] || current.artist);
  },
  "clear-search": () => renderSearch(""),
  profile: () => {
    dialog('<h2>Моя музыка</h2><form id="profile-form"><label for="profile-name">Как вас называть?</label><input id="profile-name" type="text" maxlength="40" value="' + escape(read("name", "Моя музыка")) + '"><button type="submit" class="yellow-button">Сохранить</button></form><p>Коллекция хранится на этом компьютере. Вход в аккаунт веб-версии пока не подключён.</p>');
    $("#profile-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("#profile-name").value.trim() || "Моя музыка";
      save("name", name);
      $("#account-name").textContent = name;
      closeDialog();
    });
  },
  import: importAudio,
  "show-more": () => {
    const node = $(".track-limit", content);
    if (!node) return;
    const ids = currentRoute.searchTracks || currentRoute.trackIds || [];
    const shown = $$(".track-row", content).length;
    node.outerHTML = trackRows(recordTracks(ids).slice(shown), { limit: 100 });
  }
};
function openArtist(name) {
  const a = artists.find((a2) => a2.name === name) || artists.find((a2) => name.includes(a2.name));
  if (a) {
    closeDialog();
    route("artist", a.slug);
  } else toast("Исполнитель не найден в библиотеке");
}
function routeSnapshot(){return {page:currentRoute.page,id:currentRoute.id,query:$('#search-input')?.value||'',scroll:content.scrollTop,collectionTab};}
function rememberSearch(){const value=String($('#search-input')?.value||currentRoute.query||'').trim();if(value&&currentRoute.page==='search'){searchHistory=[value,...searchHistory.filter(v=>v!==value)].slice(0,50);save('searchHistory',searchHistory);}}
function searchHistoryLanding(){return `<div class="pill-tabs search-browse-tabs"><button data-search-landing="popular">Популярное</button><button class="active" data-search-landing="history">История</button></div><div class="section-heading"><h2>История поиска</h2>${searchHistory.length?'<button data-clear-search-history>Очистить</button>':''}</div><div class="search-history">${searchHistory.map((value,i)=>`<div><button data-past-search="${i}">${icon('history')}<span>${escape(value)}</span></button><button data-remove-search="${i}" aria-label="Убрать из истории">${icon('close')}</button></div>`).join('')||'<p class="muted">Здесь появятся ваши поисковые запросы</p>'}</div>`;}
function navigateHistory(direction){const from=direction<0?routeBack:routeForward,to=direction<0?routeForward:routeBack,target=from.pop();if(!target)return;to.push(routeSnapshot());collectionTab=target.collectionTab||'playlists';routeTraversal=true;route(target.page,target.id,{query:target.query||''});routeTraversal=false;requestAnimationFrame(()=>content.scrollTop=target.scroll||0);}
function refreshCurrentView(){const p=currentRoute.page;if(p==='playlist'||p==='favorites'||p==='history')renderPlaylist(currentRoute.id||p);else if(p==='album')renderAlbum(currentRoute.id);else if(p==='artist')renderArtist(currentRoute.id);else if(p==='collection')renderCollection();}
function openMenu(html,anchor){
  closeMenu();const node=document.createElement('div');node.className='context-menu';node.setAttribute('role','menu');node.innerHTML=html;document.body.append(node);
  const box=anchor?.getBoundingClientRect?.(),point=box?{x:box.left,y:box.bottom+6}:anchor&&Number.isFinite(anchor.x)?anchor:{x:innerWidth-320,y:innerHeight-110};
  node.style.maxHeight=Math.max(100,innerHeight-32)+'px';const size=node.getBoundingClientRect();
  node.style.left=Math.max(8,Math.min(point.x,innerWidth-size.width-8))+'px';node.style.top=Math.max(8,point.y+size.height>innerHeight-8?(box?box.top-size.height-6:innerHeight-size.height-8):point.y)+'px';
  contextMenu={node,anchor};node.querySelector('[role=menuitem],button')?.focus({preventScroll:true});
}
function closeMenu(){if(contextMenu){const anchor=contextMenu.anchor;contextMenu.node.remove();contextMenu=null;if(anchor?.isConnected)anchor.focus?.({preventScroll:true});}}
function enqueue(ids,next=false){const valid=ids.filter(id=>byId.has(id));if(!valid.length)return;if(!queue.length)setQueue(valid,0);else{playback.append(valid,next);syncQueue();if(!$('#queue-panel').hidden)renderQueue();}toast(next?'Будет играть следующим':'Добавлено в конец очереди');}
function choosePlaylist(id){dialog(`<h2>Добавить в плейлист</h2><div class="playlist-chooser">${playlists.map(p=>`<button class="menu-item" data-add-playlist="${escape(p.id)}" data-track="${escape(id)}">${libraryViews.cover(p,'chooser-cover')}<span>${escape(p.title)}<small>${plural(p.trackIds.length)}</small></span>${p.trackIds.includes(id)?icon('check'):''}</button>`).join('')}</div><button class="secondary-button" data-new-playlist-track="${escape(id)}">${icon('plus')} Новый плейлист</button>`);}
async function showTrackLyrics(id){if(id===current?.id){showLyrics();return;}const t=byId.get(id);if(!t)return;dialog(`<h2>${escape(t.title)}</h2><p>${escape(t.artist)}</p><div class="lyrics-plain" id="track-lyrics">Загрузка текста…</div>`);const generation=lyricsRequest;try{const r=await fetch(`/lyrics/${encodeURIComponent(id)}.json`);if(!r.ok)throw new Error();const parsed=parseLyrics(await r.json());if(generation===lyricsRequest&&$('#track-lyrics'))$('#track-lyrics').textContent=parsed.plain||'Текст пока недоступен';}catch{if(generation===lyricsRequest&&$('#track-lyrics'))$('#track-lyrics').textContent='Текст пока недоступен';}}
function renderSpoken(){const list=localTracks.filter(t=>t.kind!=='music');currentRoute.trackIds=list.map(t=>t.id);content.innerHTML=`<div class="page"><h1>Книги и подкасты</h1><div class="spoken-actions"><button class="secondary-button" data-import-kind="book">Добавить аудиокнигу</button><button class="secondary-button" data-import-kind="podcast">Добавить подкаст</button></div>${list.length?`<div class="cards spoken-cards">${list.map(t=>`<button class="music-card" data-spoken-track="${escape(t.id)}"><div class="card-cover spoken-art">${icon(t.kind==='book'?'podcast':'lyrics')}</div><strong>${escape(t.title)}</strong><small>${t.kind==='book'?'Аудиокнига':'Подкаст'}${positions[t.id]?' · Продолжить с '+fmt(positions[t.id]):''}</small></button>`).join('')}</div>`:'<div class="empty"><h2>Ваши истории — в одном месте</h2><p>Добавьте файлы с компьютера. Место прослушивания сохранится после закрытия приложения.</p></div>'}</div>`;}
function showExcluded(){dialog(`<h2>Не рекомендовать</h2><div class="excluded-list">${recordTracks([...excluded]).map(t=>`<div class="excluded-track">${image(t.art)}<span><strong>${escape(t.title)}</strong><small>${escape(t.artist)}</small></span><button class="secondary-button" data-restore-track="${escape(t.id)}">Вернуть</button></div>`).join('')||'<p>Исключённых треков пока нет</p>'}</div>`);}
document.addEventListener("click", async (e) => {
  if(await libraryViews.handleClick(e))return;
  const discovery=e.target.closest('[data-discovery]');if(discovery){waveFilters.discovery=discovery.dataset.discovery;$$('[data-discovery]').forEach(b=>b.classList.toggle('active',b===discovery));return;}
  const pastSearch=e.target.closest('[data-past-search]');if(pastSearch){renderSearch(searchHistory[Number(pastSearch.dataset.pastSearch)]||'');return;}
  const removeSearch=e.target.closest('[data-remove-search]');if(removeSearch){searchHistory.splice(Number(removeSearch.dataset.removeSearch),1);save('searchHistory',searchHistory);search('');return;}
  if(e.target.closest('[data-clear-search-history]')){searchHistory=[];save('searchHistory',searchHistory);search('');return;}
  const pastTrack=e.target.closest('[data-queue-history-track]');if(pastTrack){const id=pastTrack.dataset.queueHistoryTrack,at=queue.lastIndexOf(id);if(at>=0)playback.jump(at);else{playback.append([id],true);playback.jump(queueIndex+1);}syncQueue();loadTrack(id);return;}
  const removeQueue=e.target.closest('[data-queue-remove]');if(removeQueue){editQueue(()=>playback.remove(Number(removeQueue.dataset.queueRemove)));return;}
  const moveQueue=e.target.closest('[data-queue-move]');if(moveQueue){const i=Number(moveQueue.dataset.queueMove),to=i+Number(moveQueue.dataset.direction);if(to>queueIndex&&to<queue.length)editQueue(()=>playback.move(i,to));return;}
  const queueTabs=e.target.closest('[data-queue-tab]');if(queueTabs){queueTab=queueTabs.dataset.queueTab;renderQueue();return;}
  const lyric=e.target.closest('[data-lyric-at]');if(lyric){if(Number.isFinite(audio.duration)){audio.currentTime=Math.min(audio.duration,Number(lyric.dataset.lyricAt));lyricsScrollHold=0;updateLyrics();}return;}
  const lyricMode=e.target.closest('[data-lyrics-mode]');if(lyricMode){lyricsMode=lyricMode.dataset.lyricsMode;save('lyricsMode',lyricsMode);renderLyrics();return;}
  const settingsTab=e.target.closest('[data-settings-tab]');if(settingsTab){$$('[data-settings-tab]').forEach(b=>b.classList.toggle('active',b===settingsTab));$('#settings-sound').hidden=settingsTab.dataset.settingsTab!=='sound';$('#settings-app').hidden=settingsTab.dataset.settingsTab!=='app';return;}
  const playNext=e.target.closest('[data-play-next]');if(playNext){enqueue([playNext.dataset.playNext],true);closeMenu();return;}
  const waveTrack=e.target.closest('[data-wave-track]');if(waveTrack){closeMenu();waveBy([waveTrack.dataset.waveTrack]);return;}
  const trackLyrics=e.target.closest('[data-track-lyrics]');if(trackLyrics){closeMenu();showTrackLyrics(trackLyrics.dataset.trackLyrics);return;}
  const choose=e.target.closest('[data-choose-playlist]');if(choose){choosePlaylist(choose.dataset.choosePlaylist);return;}
  const newPlaylistTrack=e.target.closest('[data-new-playlist-track]');if(newPlaylistTrack){createPlaylist(false,newPlaylistTrack.dataset.newPlaylistTrack);return;}
  const removeTrack=e.target.closest('[data-remove-playlist-track]');if(removeTrack){closeMenu();libraryViews.removeTracks([removeTrack.dataset.removePlaylistTrack]);return;}
  const exclude=e.target.closest('[data-exclude-track]');if(exclude){const id=exclude.dataset.excludeTrack;excluded.has(id)?excluded.delete(id):excluded.add(id);save('excluded',[...excluded]);closeMenu();toast(excluded.has(id)?'Больше не будем рекомендовать':'Снова будем рекомендовать');if(excluded.has(id)&&current?.id===id&&queue.source==='wave')nextTrack();return;}
  const restore=e.target.closest('[data-restore-track]');if(restore){excluded.delete(restore.dataset.restoreTrack);save('excluded',[...excluded]);showExcluded();return;}
  const kind=e.target.closest('[data-import-kind]');if(kind){importAudio(kind.dataset.importKind);return;}
  const spoken=e.target.closest('[data-spoken-track]');if(spoken){setQueue([spoken.dataset.spokenTrack]);return;}
  const removeLocal=e.target.closest('[data-remove-local]');if(removeLocal){const id=removeLocal.dataset.removeLocal;closeMenu();dialog(`<h2>Убрать из библиотеки?</h2><p>Файл останется на компьютере.</p><button class="yellow-button" id="confirm-remove-local">Убрать</button>`);$('#confirm-remove-local').onclick=async()=>{try{await window.desktop.removeLocal(id);if(current?.id===id){audio.pause();audio.removeAttribute('src');audio.load();current=null;mediaGeneration++;if('mediaSession' in navigator)navigator.mediaSession.metadata=null;playback.set([]);syncQueue();save('playback',{ids:[],index:0,position:0});save('lastTrack',null);updatePlayer();}else{for(let i=playback.ids.length-1;i>=0;i--)if(playback.ids[i]===id)playback.remove(i);syncQueue();}localTracks=localTracks.filter(t=>t.id!==id);tracks=tracks.filter(t=>t.id!==id);byId.delete(id);liked.delete(id);history=history.filter(x=>x!==id);save('liked',[...liked]);save('history',history);for(const p of playlists)p.trackIds=p.trackIds.filter(x=>x!==id);save('playlists',playlists);closeDialog();refreshCurrentView();}catch{toast('Не удалось убрать файл');}};return;}
  const w = e.target.closest("[data-window]");
  if (w) {
    window.desktop?.[w.dataset.window]?.();
    return;
  }
  const go = e.target.closest("[data-go]");
  if (go) {
    closeDialog();
    route(go.dataset.go);
    return;
  }
  const open = e.target.closest("[data-open]");
  if (open) {
    rememberSearch();
    closeDialog();
    route(open.dataset.open, open.dataset.id);
    return;
  }
  const action = e.target.closest("[data-action]");
  if (action) {
    actions[action.dataset.action]?.();
    return;
  }
  const like = e.target.closest("[data-like]");
  if (like) {
    closeMenu();
    toggleLike(like.dataset.like);
    return;
  }
  const menu = e.target.closest("[data-menu-track]");
  if (menu) {
    menuAnchor=menu;
    trackMenu(menu.dataset.menuTrack);
    return;
  }
  const artist = e.target.closest("[data-artist-name]");
  if (artist) {
    openArtist(artist.dataset.artistName);
    return;
  }
  const ap = e.target.closest("[data-add-playlist]");
  if (ap) {
    const p = playlists.find((p2) => p2.id === ap.dataset.addPlaylist);
    if (p && !p.trackIds.includes(ap.dataset.track)) {
      p.trackIds.push(ap.dataset.track);
      save("playlists", playlists);
      toast("Добавлено в плейлист «" + p.title + "»");
    } else toast("Трек уже есть в плейлисте");
    closeDialog();
    return;
  }
  const aq = e.target.closest("[data-add-queue]");
  if (aq) {
    enqueue([aq.dataset.addQueue],false);closeMenu();
    closeDialog();
    return;
  }
  const ct = e.target.closest("[data-collection-tab]");
  if (ct) {
    collectionTab = ct.dataset.collectionTab;
    libraryViews.reset();
    renderCollection();
    return;
  }
  const st = e.target.closest("[data-search-tab]");
  if (st) {
    search($("#search-input").value, st.dataset.searchTab);
    return;
  }
  const sl = e.target.closest("[data-search-landing]");
  if (sl) {
    searchLandingTab = sl.dataset.searchLanding;
    search("");
    return;
  }
  const browse = e.target.closest("[data-browse]");
  if (browse) {
    browseCategory(browse.dataset.browse);
    return;
  }
  const wm = e.target.closest("[data-wave-mode]");
  if (wm) {
    waveMode = wm.dataset.waveMode;
    $$(".home-tab").forEach((b) => b.classList.toggle("active", b === wm));
    return;
  }
  const mood = e.target.closest("[data-mood]");
  if (mood) {
    waveFilters.mood = mood.dataset.mood;
    $$("[data-mood]").forEach((b) => b.classList.toggle("active", b === mood));
    return;
  }
  const lang = e.target.closest("[data-language]");
  if (lang) {
    waveFilters.language = lang.dataset.language;
    $$("[data-language]").forEach((b) => b.classList.toggle("active", b === lang));
    return;
  }
  const row = e.target.closest("[data-track-row]");
  if (row) {
    rememberSearch();
    if (current?.id === row.dataset.trackRow && (!row.closest('#queue-panel')||Number(row.dataset.queueIndex)===queueIndex)) {
      togglePlay();
      return;
    }
    const routeIds = currentRoute.searchTracks || currentRoute.trackIds;
    const ids = !row.closest("#queue-panel") && routeIds?.includes(row.dataset.trackRow) ? routeIds : $$(".track-row", row.closest(".track-list")||row.closest("#queue-panel")||content).map((r) => r.dataset.trackRow);
    const existing = queue.indexOf(row.dataset.trackRow);
    if (row.closest("#queue-panel") && existing >= 0) {
      playback.jump(Number(row.dataset.queueIndex));syncQueue();loadTrack(queue[queueIndex]);
    } else setQueue(ids, ids.indexOf(row.dataset.trackRow));
  }
});
overlay.addEventListener("click", (e) => {
  if (e.target === overlay) closeDialog();
});
document.addEventListener('pointerdown',e=>{if(contextMenu&&!contextMenu.node.contains(e.target)&&!contextMenu.anchor?.contains?.(e.target))closeMenu();});
document.addEventListener('contextmenu',e=>{const row=e.target.closest('[data-track-row]');if(row){e.preventDefault();menuAnchor={x:e.clientX,y:e.clientY};trackMenu(row.dataset.trackRow);}});
document.addEventListener('wheel',e=>{if(e.target.closest('.lyrics-lines'))lyricsScrollHold=performance.now()+4000;},{passive:true});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'){if(contextMenu)closeMenu();else if(!overlay.hidden)closeDialog();else $('#queue-panel').hidden=true;return;}
 if(contextMenu){const items=$$('button',contextMenu.node),at=items.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?items.length-1:(at+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next]?.focus();return;}}
 if(e.key==='Tab'&&!overlay.hidden){const items=$$('button:not(:disabled),input:not(:disabled),textarea,select,[tabindex="0"]',overlay).filter(x=>!x.closest('[hidden]'));const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
 const editing=/INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
 if(e.altKey&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();navigateHistory(e.key==='ArrowLeft'?-1:1);return;}
 if(e.ctrlKey&&e.key.toLowerCase()==='f'){e.preventDefault();route('search');return;}
 if(editing)return;
 if(e.code==='Space'){e.preventDefault();if(e.target.closest('button'))e.target.click();else togglePlay();}
 else if(e.ctrlKey&&e.key==='ArrowRight'){e.preventDefault();nextTrack();}
 else if(e.ctrlKey&&e.key==='ArrowLeft'){e.preventDefault();actions.previous();}
 else if(e.ctrlKey&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();setVolume(volume+(e.key==='ArrowUp'?.05:-.05));}
 else if(e.key==='Enter')e.target.closest('[data-track-row]')?.click();
});
document.addEventListener('dragstart',e=>{
 const row=e.target.closest('[data-queue-index],[data-playlist-index],.pin-entry');if(!row)return;
 if(e.target.closest('button,input')){e.preventDefault();return;}
 draggingEntry={type:row.matches('.pin-entry')?'pin':row.hasAttribute('data-queue-index')?'queue':'playlist',index:Number(row.dataset.queueIndex??row.dataset.playlistIndex),id:row.dataset.pinId,pinType:row.dataset.pinType};row.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain','sway-entry');
});
document.addEventListener('dragover',e=>{if(!draggingEntry)return;const target=e.target.closest(draggingEntry.type==='pin'?'.pin-entry':draggingEntry.type==='queue'?'[data-queue-index]':'[data-playlist-index]');if(target){e.preventDefault();$$('.drop-target').forEach(n=>n.classList.remove('drop-target'));target.classList.add('drop-target');}});
document.addEventListener('drop',e=>{
 if(!draggingEntry)return;e.preventDefault();const d=draggingEntry;const target=e.target.closest(d.type==='pin'?'.pin-entry':d.type==='queue'?'[data-queue-index]':'[data-playlist-index]');
 if(target){if(d.type==='queue'){const to=Number(target.dataset.queueIndex);if(to>queueIndex&&d.index>queueIndex)editQueue(()=>playback.move(d.index,to));}else if(d.type==='playlist')libraryViews.moveTrack(d.index,Number(target.dataset.playlistIndex));else{const from=pins.findIndex(p=>p.type===d.pinType&&p.id===d.id),to=pins.findIndex(p=>p.type===target.dataset.pinType&&p.id===target.dataset.pinId);if(from>=0&&to>=0){pins.splice(to,0,pins.splice(from,1)[0]);save('pins',pins);updatePins();}}}
 draggingEntry=null;$$('.dragging,.drop-target').forEach(n=>n.classList.remove('dragging','drop-target'));
});
document.addEventListener('dragend',()=>{draggingEntry=null;$$('.dragging,.drop-target').forEach(n=>n.classList.remove('dragging','drop-target'));});
audio.addEventListener('play',()=>{playing=true;lastTickAt=performance.now();lastMediaTime=audio.currentTime;if(current&&!playedThisLoad){playedThisLoad=true;history=[current.id,...history.filter(id=>id!==current.id)].slice(0,500);save('history',history);recordListening('played');}updatePlayer();});
audio.addEventListener('pause',()=>{playing=false;lastTickAt=0;savePlaybackPosition();updatePlayer();});
audio.addEventListener('ended',()=>{savePlaybackPosition();nextTrack(1,true);});
audio.addEventListener("error", () => {
  if (current) toast("Аудиофайл недоступен. Проверьте подключение библиотеки.");
});
audio.addEventListener("timeupdate", () => {
  const now=performance.now();if(!audio.paused&&lastTickAt){const wall=(now-lastTickAt)/1000,media=audio.currentTime-lastMediaTime;if(media>0&&media<Math.max(2,wall*audio.playbackRate+1))listenedSeconds+=Math.min(wall,1.5);}
  lastTickAt=audio.paused?0:now;lastMediaTime=audio.currentTime;
  if(current&&countedTrack!==current.id&&listenedSeconds>=Math.min(30,(audio.duration||Infinity)*.5)){countedTrack=current.id;recordListening('completed');}
  if(now-persistedAt>5000){savePlaybackPosition();persistedAt=now;}updateLyrics();
  const progress = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.currentTime / audio.duration * 1e3 : 0;
  $("#seek").value = progress;
  $("#seek").style.setProperty("--progress", `${progress / 10}%`);
  $("#timeline-time").textContent = `${fmt(audio.currentTime)} / ${fmt(audio.duration || current?.seconds)}`;
  if ($("#expanded-seek")) {
    $("#expanded-seek").value = progress;
    $("#expanded-time").textContent = fmt(audio.currentTime);
    $("#expanded-duration").textContent = fmt(audio.duration || current?.seconds);
  }
  if ("mediaSession" in navigator && Number.isFinite(audio.duration) && audio.duration > 0) {
    try {
      navigator.mediaSession.setPositionState({ duration: audio.duration, position: Math.min(audio.currentTime, audio.duration), playbackRate: audio.playbackRate });
    } catch {
    }
  }
});
$("#seek").addEventListener("input", (e) => {
  if (Number.isFinite(audio.duration)) audio.currentTime = audio.duration * Number(e.target.value) / 1e3;
});
$("#volume").addEventListener("input", (e) => setVolume(Number(e.target.value)));
document.addEventListener("error", (e) => {
  if (e.target instanceof HTMLImageElement && !e.target.dataset.fallback) {
    e.target.dataset.fallback = "true";
    e.target.src = "/art/icon-512.png";
  }
}, true);
if ("mediaSession" in navigator) {
  for (const [action, handler] of Object.entries({ play: () => playAudio(), pause: () => audio.pause(), nexttrack: () => nextTrack(), previoustrack: () => nextTrack(-1), seekto: (d) => {
    if (Number.isFinite(d.seekTime)) audio.currentTime = d.seekTime;
  }, seekforward: (d) => {
    if (Number.isFinite(audio.duration)) audio.currentTime = Math.min(audio.duration, audio.currentTime + (d.seekOffset || 10));
  }, seekbackward: (d) => audio.currentTime = Math.max(0, audio.currentTime - (d.seekOffset || 10)) })) {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
    }
  }
}
setInterval(()=>{if(sleepDeadline&&Date.now()>=sleepDeadline){cancelSleep();audio.pause();toast('Таймер остановил воспроизведение');}if($('#sleep-status'))$('#sleep-status').textContent=sleepLabel();},1000);
window.addEventListener('beforeunload',savePlaybackPosition);
window.desktop?.onMediaAction?.(action=>actions[action]?.());
async function init(){
 hydrateIcons();$('#account-name').textContent=read('name','Моя музыка');
 try{
  const responses=await Promise.all(['/catalog.json','/albums.json','/artists.json','/chart.json'].map(async url=>{const r=await fetch(url);if(!r.ok)throw Error(url);return r.json();}));[tracks,albums,artists,chart]=responses;
  try{localTracks=await window.desktop?.localLibrary?.()||[];}catch{}
  byId=new Map([...tracks,...localTracks].map(t=>[t.id,t]));tracks.push(...localTracks.filter(t=>t.kind==='music'));
  liked=new Set([...liked].filter(id=>byId.has(id)));history=history.filter(id=>byId.has(id));
  playlists=playlists.filter(p=>p&&typeof p.id==='string'&&typeof p.title==='string'&&Array.isArray(p.trackIds)).map(p=>({...p,trackIds:p.trackIds.filter(id=>byId.has(id))}));
  pins=Array.isArray(pins)?pins.filter(p=>p&&['playlist','album','artist'].includes(p.type)&&typeof p.id==='string'):[];
  await Promise.allSettled([Promise.all(['./icon-map.json','./icon-paths.json'].map(url=>fetch(url).then(r=>r.ok?r.json():{}))).then(([map,paths])=>{referenceIcons=map;iconPaths=paths;hydrateIcons();}),fetch('./language-index.json').then(r=>r.ok?r.json():{}).then(v=>languages=v),window.desktop?.preferences?.().then(v=>nativePreferences=v)]);
  if(!['any','ru','en','mixed'].includes(waveFilters.language))waveFilters.language='any';
  playbackRate=Math.max(.5,Math.min(2,Number(playbackRate)||1));updatePins();setVolume(volume);
  const saved=read('playback',{}),ids=Array.isArray(saved.ids)?saved.ids.filter(id=>byId.has(id)):[];
  if(ids.length){const oldIndex=Math.max(0,Number(saved.index)||0),target=saved.ids[oldIndex],index=Math.max(0,saved.ids.slice(0,oldIndex).filter(id=>byId.has(id)).length);playback.set(ids,index,saved.source==='wave'?'wave':'library');syncQueue();await loadTrack(queue[queueIndex],false,Number(saved.position)||0);}
  else{const last=byId.get(read('lastTrack',null))||byId.get('маяк-x-украсть-тебя')||tracks[0];if(last){playback.set([last.id]);syncQueue();await loadTrack(last.id,false);}}
  updatePlayer();route('home');document.documentElement.dataset.ready='true';
 }catch(error){content.innerHTML='<div class="empty"><h2>Не удалось открыть библиотеку</h2><p>Проверьте доступность папки проекта и музыкальных файлов.</p><p class="inline-error">'+escape(error.message)+'</p></div>';}
}
init();
