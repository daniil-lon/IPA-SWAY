import assert from 'node:assert/strict';
import {handleTelegramWebhook} from '../admin-store.mjs';

// The bot answers listeners publicly (welcome + catalogue search) and keeps admin commands to the bound chat.
const sent=[];
globalThis.fetch=async(url,init)=>{sent.push({url:String(url),body:JSON.parse(init.body)});return new Response('{}');};
const env={TELEGRAM_BOT_TOKEN:'test-token',ADMIN_TELEGRAM_CHAT_ID:'42',PUBLIC_ORIGIN:'https://sway.test'};
const tracks=[{id:'2hug-pok',title:'Пока играет музыка',artist:'2hug'},{id:'mayot-x',title:'Вниз',artist:'MAYOT'}];
const searchTracks=async query=>tracks.filter(t=>(t.title+' '+t.artist).toLowerCase().includes(query.toLowerCase()));
const message=(text,chat=7,type='private')=>new Request('https://sway.test/api/telegram/webhook',{method:'POST',body:JSON.stringify({message:{text,chat:{id:chat,type}}})});
const last=()=>sent.at(-1).body;

await handleTelegramWebhook(message('/start'),env,7000,{searchTracks});
assert.match(last().text,/Sway — бесплатная музыка/);
assert.equal(last().reply_markup.inline_keyboard[0][0].web_app.url,'https://sway.test/?src=tg_bot');
assert.doesNotMatch(last().text,/bind|Доступ запрещен/,'listeners never see admin wording');

await handleTelegramWebhook(message('2hug'),env,7000,{searchTracks});
assert.match(last().text,/Пока играет музыка<\/a> — 2hug/);
assert.equal(last().reply_markup.inline_keyboard[0][0].url,'https://sway.test/t/2hug-pok?src=tg_bot');

await handleTelegramWebhook(message('<script>'),env,7000,{searchTracks});
assert.match(last().text,/Ничего не нашёл по запросу «&lt;script&gt;»/,'the query is escaped in HTML replies');

const before=sent.length;
await handleTelegramWebhook(message('/login'),env,7000,{searchTracks});
assert.doesNotMatch(last().text,/magic-login|Ссылка/,'a stranger cannot get an admin link');
await handleTelegramWebhook(message('hello',-100,'group'),env,7000,{searchTracks});
assert.equal(sent.length,before+1,'group chats get no reply');

console.log('PASS: public welcome and search with /t/ links, escaped replies, admin commands closed to strangers, silent in groups');
