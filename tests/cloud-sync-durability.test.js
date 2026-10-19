const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const source=fs.readFileSync("cloud-sync.js","utf8");
const recovery=require("../core/cloud-sync-recovery.js");
const key="lyrictube.cloudSyncQueue.v1.account-test";
const values=new Map();
const store={getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
const song=(title)=>({song:{id:"song-one",title},sortOrder:0});
const delta=(title)=>({upsertSongs:[song(title)]});
function boot(request){
  const handlers=new Map();
  const document={
    documentElement:{dataset:{}},
    addEventListener(name,fn){handlers.set(name,fn)},
    querySelector(){return {addEventListener(){}}}
  };
  const window={
    LyricTubeCloudRecovery:recovery,
    LyricTubePlaybackState:true,
    LyricTubePlaybackA1:false,
    LyricTubeProfiles:{
      currentRole:()=>"cloud",
      readCloudSession:()=>({token:"fake-test-token",account:{id:"account-test"}})
    },
    addEventListener(){}
  };
  const context={
    window,document,localStorage:store,fetch:request,
    setTimeout:()=>1,clearTimeout:()=>{},
    console:{...console,error:()=>{}},CustomEvent:class{},
    Date,JSON,Map,Set,Promise
  };
  vm.runInNewContext(source,context,{filename:"cloud-sync.js"});
  const emit=(name,detail)=>{
    const fn=handlers.get(name);
    assert(fn,"handler exists: "+name);
    fn({detail});
  };
  return {sync:window.LyricTubeCloudSync,emit,document};
}
(async()=>{
  let failRequest;
  const pendingRequest=new Promise((resolve,reject)=>{failRequest=reject});
  const app=boot(()=>pendingRequest);
  app.emit("lyrictube:cloud-library-delta",delta("first edit"));
  assert.equal(app.sync.hasPending(),true);
  const uploading=app.sync.flush();
  let stored=JSON.parse(values.get(key));
  assert.equal(stored.version,2);
  assert.equal(stored.inFlight.upsertSongs[0].song.title,"first edit",
    "in-flight batch must be durable before fetch completes");
  app.emit("lyrictube:cloud-library-delta",delta("second edit"));
  stored=JSON.parse(values.get(key));
  assert.equal(stored.pending.upsertSongs[0].song.title,"second edit",
    "changes while uploading must also survive tab close");

  // A new browser session can rehydrate both stages even before the old
  // network request resolves. No real account or remote write is involved.
  const reloaded=boot(async()=>({ok:true,json:async()=>({ok:true})}));
  reloaded.sync.hydrateQueue();
  assert.equal(reloaded.sync.hasPending(),true);
  assert.equal(JSON.parse(values.get(key)).pending.upsertSongs[0].song.title,"second edit");

  failRequest(new Error("simulated offline"));
  await uploading;
  assert.equal(JSON.parse(values.get(key)).pending.upsertSongs[0].song.title,"second edit",
    "older request failure must not overwrite the newer edit");

  await reloaded.sync.flush();
  assert.equal(values.has(key),false,"queue removed only after acknowledgement");

  app.emit("lyrictube:cloud-library-delta",delta("save test"));
  const success=boot(async()=>({ok:true,json:async()=>({ok:true})}));
  await success.sync.flush();
  assert.equal(values.has(key),false);

  const legacy=JSON.stringify({upsertSongs:[song("old format")]});
  values.set(key,legacy);
  const legacyApp=boot(async()=>({ok:true,json:async()=>({ok:true})}));
  legacyApp.sync.hydrateQueue();
  assert.equal(legacyApp.sync.hasPending(),true,"old queue format survives migration");
  await legacyApp.sync.flush();
  assert.equal(values.has(key),false);
  console.log("Cloud sync in-flight durability tests passed");
})().catch(error=>{console.error(error);process.exitCode=1});
