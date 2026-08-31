(() => {
  "use strict";

  function playedAt(song){
    if(!song?.lastPlayedAt)return null;
    const time=Date.parse(song.lastPlayedAt);
    return Number.isFinite(time)?time:null;
  }

  function candidatePool(queue,currentId){
    const candidates=(Array.isArray(queue)?queue:[]).filter(song=>song&&song.id&&song.id!==currentId);
    if(!candidates.length)return[];

    // A track that has never actually started should get a chance before
    // yesterday's / today's already-played tracks can repeat again.
    const neverPlayed=candidates.filter(song=>playedAt(song)===null);
    if(neverPlayed.length)return neverPlayed;

    // Once every candidate has history, keep shuffle random but only inside
    // the least-recently-played group. A selected track becomes newest as soon
    // as playback starts, so it naturally rotates out of this pool.
    const sorted=[...candidates].sort((a,b)=>playedAt(a)-playedAt(b));
    const oldestWindow=Math.max(
      Math.min(3,sorted.length),
      Math.ceil(sorted.length*0.35)
    );
    return sorted.slice(0,oldestWindow);
  }

  function pickNext(queue,currentId,random=Math.random){
    const pool=candidatePool(queue,currentId);
    if(!pool.length)return null;
    const value=Number(random());
    const normalized=Number.isFinite(value)?Math.min(Math.max(value,0),0.999999999):0;
    return pool[Math.floor(normalized*pool.length)]||pool[0]||null;
  }

  const api=Object.freeze({candidatePool,pickNext});
  globalThis.LyricTubeFairShuffle=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})();
