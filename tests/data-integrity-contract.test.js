const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const app=fs.readFileSync("app.js","utf8");
const shell=fs.readFileSync("site-shell.js","utf8");
const index=fs.readFileSync("index.html","utf8");
const cloud=fs.readFileSync("cloud-sync.js","utf8");
const local=fs.readFileSync("local-media.js","utf8");
const extract=(s,from,to)=>{
  const start=s.indexOf(from),end=s.indexOf(to,start+from.length);
  assert(start>=0&&end>start,"missing body "+from);
  return s.slice(start,end);
};
const imported=vm.runInNewContext(extract(app,"function validateImportedLibrary(","function exportLibrary(")+";validateImportedLibrary",{});
const incoming={songs:[{title:"track",versions:[
 {id:"local",source:"localmedia",videoId:"",youtubeUrl:"",localFileName:"a.mp3"},
 {id:"youtube",videoId:"abcdefghijk"},
 {id:"invalid",videoId:"",youtubeUrl:""},
 ]}]};
const result=imported(incoming);
assert.deepEqual(Array.from(result.songs[0].versions,v=>v.id),["local","youtube"]);
assert.match(app,/const list=viewSongs\(\);\s*return list.length\?list:\[\.\.\.library.songs\]/);
assert.match(shell,/overlayPendingLibrary\(remote,queue\)/);
assert.match(shell,/lyrictube.youtubeSearch.key.session/);
assert.match(cloud,/inFlight=snapshot;/);
assert.match(cloud,/restoreFailedBatch\(snapshot\)/);
assert.match(index,/src="core\/cloud-sync-recovery.js\?v=20261019-4"/);
assert(!/lyrictube\.cloudSyncQueue\.v1.*removeItem/.test(shell));
assert.match(local,/function cleanupOrphans\(\)/);
console.log("Data integrity regression contracts passed");
