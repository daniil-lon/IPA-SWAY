import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {communitySignals,clearCommunityCache} from '../community-store.mjs';

const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
for(const file of ['0001_accounts.sql','0006_chart_and_crossfade.sql','0014_community_signals.sql'])sqlite.exec(await readFile('migrations/'+file,'utf8'));
sqlite.exec("INSERT INTO users(id,name) VALUES('a','A'),('b','B'); INSERT INTO likes(uid,track) VALUES('a','song'),('a','alias'),('b','alias'); INSERT INTO collection_reactions(uid,kind,ref) VALUES('a','artist-best','sway')");
const day=Math.floor(Date.now()/86400000),listen=sqlite.prepare('INSERT INTO chart_listens(day,track,uid) VALUES(?,?,?)');
for(const args of [[day,'song','a'],[day-1,'song','a'],[day,'alias','a'],[day,'alias','b'],[day-35,'older','a'],[day,'removed','b']])listen.run(...args);
const catalog=[{id:'song',artist:'Sway'},{id:'alias',canonicalId:'song',artist:'Sway'},{id:'older',artist:'Sway, Guest'},...Array.from({length:6997},(_,i)=>({id:'quiet-'+i,artist:'Silent '+i}))];
let queryCount=0,parameterBytes=0;
const prepare=(sql,args=[])=>({bind:(...values)=>{parameterBytes+=Buffer.byteLength(JSON.stringify(values));return prepare(sql,values);},all:async()=>{queryCount++;return {results:sqlite.prepare(sql).all(...args)};}});
const db={prepare};clearCommunityCache();
try{
 const data=await (await communitySignals(db,catalog)).json();
 assert.deepEqual(data.tracks.song,{plays:4,listeners:2,likes:2},'Canonical aliases share distinct fans without counting likes twice');
 assert.deepEqual(data.tracks.older,{plays:1,listeners:0,likes:0});
 assert.deepEqual(data.artists.sway,{plays:5,listeners:2},'One fan listening to several songs is one monthly artist listener');
 assert.deepEqual(data.artists.guest,{plays:1,listeners:0});
 assert.equal(data.tracks.removed,undefined);assert.equal(data.artists['silent 1'],undefined);
 assert.equal(data.collections['artist-best:sway'],1);
 assert.ok(parameterBytes<1024,'A 7,000-song catalogue must not become a large virtual D1 table in each statistics query: '+parameterBytes+' bytes');
 assert.ok(queryCount<=3,'Read activity once per table, independent of catalogue size');
 await communitySignals(db,catalog);assert.equal(queryCount,3,'Repeated reads reuse the existing cache');
 console.log('PASS: real community counts, alias deduplication and 30-day listeners with bounded database work for 7,000 tracks');
}finally{clearCommunityCache();sqlite.close();}
