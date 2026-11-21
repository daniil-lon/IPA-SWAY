import {json,readJSON} from './profile-store.mjs';

export async function readTaste(db,id){
 const row=await db.prepare('SELECT artists,genres FROM user_taste WHERE uid=?').bind(id).first();
 return row?{artists:JSON.parse(row.artists),genres:JSON.parse(row.genres)}:{artists:[],genres:[]};
}
export async function writeTaste(req,db,id){
 const body=await readJSON(req,24000);
 const valid=(list,max,length)=>Array.isArray(list)&&list.length<=max&&list.every(s=>typeof s==='string'&&s.length>0&&s.length<=length&&s.trim()===s&&!/[\u0000-\u001f]/.test(s));
 if(!valid(body?.artists,150,100)||!valid(body?.genres,5,60))return json({error:'invalid_taste'},400);
 const artists=[...new Set(body.artists)],genres=[...new Set(body.genres)];
 await db.prepare('INSERT INTO user_taste(uid,artists,genres) VALUES(?,?,?) ON CONFLICT(uid) DO UPDATE SET artists=excluded.artists,genres=excluded.genres').bind(id,JSON.stringify(artists),JSON.stringify(genres)).run();
 return json({artists,genres});
}
