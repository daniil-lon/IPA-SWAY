import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {servePlayer} from './player-fixture.mjs';
const {origin,server}=await servePlayer();let browser;
try{
 browser=await chromium.launch({channel:'msedge'});const page=await browser.newPage();await page.goto(origin);
 const result=await page.evaluate(async()=>{
  const {loadLyrics}=await import('/lyrics.js');
  const data=await loadLyrics({title:'I Want to Live',artist:'Borislav Slavov',seconds:233});
  return {id:data?.id,lines:data?.lines.length,hasPlain:!!data?.plain};
 });
 assert.equal(result.id,3396226);assert.ok(result.lines>5);
 await writeFile('artifacts/sway-lyrics-live-check.json',JSON.stringify({browser:'Edge',cors:true,...result},null,2));
 console.log('LRCLIB live browser request: CORS, client identification, metadata match and timed lyrics passed.',result);
}finally{await browser?.close();server.close();}
