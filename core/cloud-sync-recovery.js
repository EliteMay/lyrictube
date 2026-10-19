((root,factory)=>{
  "use strict";
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.LyricTubeCloudRecovery=Object.freeze(api);
})(typeof window!=="undefined"?window:null,()=>{
  "use strict";
  const QUEUE_PREFIX="lyrictube.cloudSyncQueue.v1.";
  const own=(value,key)=>Object.prototype.hasOwnProperty.call(value||{},key);
  function decodeQueue(value){
    const data=typeof value==="string"?JSON.parse(value):value;
    if(!data||typeof data!=="object"||Array.isArray(data))throw new Error("invalid cloud queue");
    if(data.version===2 && own(data,"pending")){
      return {inFlight:data.inFlight||null,pending:data.pending||null};
    }
    // v1 stored the delta itself. Retain backward compatibility.
    return {inFlight:null,pending:data};
  }
  function hasLibraryDelta(change){
    return Boolean(change&&(change.replaceLibrary||
      change.upsertSongs?.length||change.deleteSongIds?.length||
      change.upsertPlaylists?.length||change.deletePlaylistIds?.length||
      change.state));
  }
  function hasQueuedChanges(value){
    if(!value)return false;
    const queue=decodeQueue(value);
    return [queue.inFlight,queue.pending].some(c=>hasLibraryDelta(c)||Boolean(c?.playHistory?.length));
  }
  function applyCollection(items,upserts,deletions,idField,itemField){
    const next=[...(Array.isArray(items)?items:[])];
    const deleted=new Set((Array.isArray(deletions)?deletions:[]).map(String));
    for(let i=next.length-1;i>=0;i--)if(deleted.has(String(next[i]?.id||"")))next.splice(i,1);
    const changes=(Array.isArray(upserts)?upserts:[])
      .filter(entry=>entry?.[itemField]?.id)
      .sort((a,b)=>(Number(a.sortOrder)||0)-(Number(b.sortOrder)||0));
    for(const entry of changes){
      const item=entry[itemField];
      const id=String(item.id);
      const index=next.findIndex(x=>String(x?.id||"")===id);
      if(index!==-1)next.splice(index,1);
      const position=Math.max(0,Math.min(next.length,Math.trunc(Number(entry.sortOrder)||0)));
      next.splice(position,0,item);
    }
    return next;
  }
  function overlayPendingLibrary(remote,queueValue){
    if(!queueValue)return remote;
    const queue=decodeQueue(queueValue);
    let library=remote;
    for(const change of [queue.inFlight,queue.pending]){
      if(!hasLibraryDelta(change))continue;
      if(change.replaceLibrary){
        library=change.replaceLibrary;
        continue;
      }
      library={
        ...library,
        songs:applyCollection(library?.songs,change.upsertSongs,change.deleteSongIds,"id","song"),
        playlists:applyCollection(library?.playlists,change.upsertPlaylists,change.deletePlaylistIds,"id","playlist"),
        settings:change.state?.settings??library?.settings,
        version:change.state?.version??library?.version,
        ...(change.state&&own(change.state,"exportedAt")?{exportedAt:change.state.exportedAt}:{}),
      };
    }
    return library;
  }
  return {QUEUE_PREFIX,decodeQueue,hasLibraryDelta,hasQueuedChanges,overlayPendingLibrary};
});
