(() => {
  "use strict";

  const MODES=Object.freeze(["default","title","artist","added","played"]);
  const collator=new Intl.Collator("ja",{numeric:true,sensitivity:"base"});

  function timestamp(value){
    const time=Date.parse(String(value||""));
    return Number.isFinite(time)?time:0;
  }

  function sortSongs(songs,mode="default"){
    const items=Array.isArray(songs)?[...songs]:[];
    if(!MODES.includes(mode)||mode==="default")return items;
    const indexed=items.map((song,index)=>({song,index}));
    indexed.sort((a,b)=>{
      const left=a.song||{},right=b.song||{};
      let diff=0;
      if(mode==="title")diff=collator.compare(String(left.title||""),String(right.title||""));
      else if(mode==="artist")diff=collator.compare(String(left.artist||""),String(right.artist||""));
      else if(mode==="added")diff=timestamp(right.createdAt)-timestamp(left.createdAt);
      else if(mode==="played")diff=timestamp(right.lastPlayedAt)-timestamp(left.lastPlayedAt);
      return diff||a.index-b.index;
    });
    return indexed.map(item=>item.song);
  }

  const api=Object.freeze({MODES,sortSongs});
  globalThis.LyricTubeLibrarySort=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})();
