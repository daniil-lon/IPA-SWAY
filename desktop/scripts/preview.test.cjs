const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createPreviewServer}=require('../server.cjs');
const http=require('node:http');
test('preview rejects writes, serves HEAD and denies other hosts',async()=>{
 const server=await createPreviewServer({port:0});
 try{
  const origin='http://127.0.0.1:'+server.address().port;
  const write=await fetch(origin+'/catalog.json',{method:'POST',body:'test'});
  assert.equal(write.status,405);assert.equal(write.headers.get('Allow'),'GET, HEAD');
  const head=await fetch(origin+'/catalog.json',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
  const status=await new Promise((resolve,reject)=>{http.get(origin+'/',{headers:{Host:'evil.test'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);});
  assert.equal(status,403);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
