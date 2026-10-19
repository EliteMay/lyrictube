const assert=require("node:assert/strict");
const {
  decodeQueue,hasQueuedChanges,overlayPendingLibrary
}=require("../core/cloud-sync-recovery.js");

const remote={version:3,settings:{theme:"dark"},songs:[
  {id:"a",title:"remote-A"},{id:"b",title:"remote-B"}
],playlists:[{id:"p",songIds:["a"]}]};
const old={upsertSongs:[{song:{id:"a",title:"offline-A"},sortOrder:0}]};
const newer={upsertSongs:[{song:{id:"a",title:"newer-A"},sortOrder:0},
  {song:{id:"c",title:"offline-C",source:"localmedia"},sortOrder:2}],
  deleteSongIds:["b"],state:{version:3,settings:{theme:"light"}}};
const v1=JSON.stringify(old);
assert.deepEqual(decodeQueue(v1),{inFlight:null,pending:old});
const restored=overlayPendingLibrary(remote,JSON.stringify({version:2,inFlight:old,pending:newer}));
assert.deepEqual(restored.songs.map(s=>s.title),["newer-A","offline-C"]);
assert.equal(restored.settings.theme,"light");
assert.equal(remote.songs[0].title,"remote-A","never mutate server snapshot");
assert.equal(hasQueuedChanges(v1),true);
assert.equal(hasQueuedChanges(JSON.stringify({version:2,inFlight:null,pending:{playHistory:[{eventId:"h"}]}})),true);
assert.equal(hasQueuedChanges(JSON.stringify({version:2,inFlight:null,pending:{}})),false);
assert.equal(overlayPendingLibrary(remote,null),remote);
assert.equal(overlayPendingLibrary(remote,JSON.stringify({version:2,inFlight:null,pending:{playHistory:[{eventId:"e"}]}})),remote);
const replacement={version:3,songs:[{id:"r",title:"replace"}],playlists:[],settings:{}};
const afterReplace=overlayPendingLibrary(remote,{
  version:2,inFlight:{replaceLibrary:replacement},
  pending:{upsertSongs:[{song:{id:"z",title:"after-replace"},sortOrder:1}]}
});
assert.deepEqual(afterReplace.songs.map(s=>s.id),["r","z"]);
assert.throws(()=>decodeQueue("{bad json"));
console.log("Cloud queue recovery tests passed");
