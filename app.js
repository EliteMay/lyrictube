const APP_VERSION = "v34";
const STORAGE_KEY = "lyrictube.library.v3";
const LEGACY_KEY = "lyrictube.songs.v1";
const LIB_VERSION = 3;

let library = defaultLibrary();
let selectedSongId = null;
let selectedVersionId = null;
let currentView = { type: "all", playlistId: null };
let ytPlayer = null;
let ytReady = false;
let syncTimer = null;
let activeLyricIndex = -1;
let pendingLyricsResults = [];
let syncDraft = [];
let syncUndoStack = [];
let syncSeekDragging = false;
let pendingSkipStart = null;
let handlingEnd = false;
let lastCountedSongId = null;
let fullLyrics = false;
let lyricsSearchReturnToSong = false;
let bottomSeekDragging = false;
let autoScrollManualPaused = false;
let autoScrollPauseTimer = null;
let playlistTargetSongId = null;
let lyricVideoSwitchPending = false;
let lyricVideoSwitchStartedAt = 0;
let lyricViewportResetToken = 0;
let mainPage = "player";
let syncSelectedIndex = 0;

const $ = id => document.getElementById(id);
const els = Object.fromEntries([
  "songList","songCount","librarySearch","addSongBtn","editSongBtn","deleteSongBtn","favoriteBtn","playlistBtn","settingsBtn","exportBtn","importInput","allCount","favoriteCount","needsLyricsCount","needsSyncCount","coverCount","libraryLabel","playlistNav","managePlaylistsBtn",
  "playerPageBtn","browsePageBtn","browsePage","playerWorkspace","browseSearch","browseAddSongBtn","browseHeading","browseCount","browseGrid",
  "nowTitle","nowArtist","nowThumb","nowVersionBadge","nowPlayCount","playerPlaceholder","versionTabs","addVersionBtn","editVersionBtn","prevBtn","nextBtn","restartBtn","shuffleBtn","repeatBtn",
  "bottomPlayer","bottomThumb","bottomTitle","bottomArtist","bottomPrevBtn","bottomPlayBtn","bottomNextBtn","bottomCurrentTime","bottomDuration","bottomSeek","bottomQueueBtn","bottomVolume","queueDialog","closeQueueDialog","queueList",
  "startTimeLabel","endTimeLabel","setStartBtn","setEndBtn","resetRangeBtn","autoSkipToggle","markSkipStartBtn","markSkipEndBtn","pendingSkipLabel","skipList",
  "lyricsView","syncStatus","versionSyncStatus","offsetInput","offsetMinus","offsetPlus","openSyncEditorBtn","toggleAutoScrollBtn","fullscreenLyricsBtn","toast",
  "songDialog","songForm","songDialogTitle","closeSongDialog","cancelSongBtn","editingSongId","initialVideoSection","youtubeUrl","fetchYoutubeInfoBtn","initialVersionType","initialPerformer","trackTitle","artistName","searchLyricsBtn","googleLyricsBtn","pasteLyricsBtn","lyricsInput","lyricsInputHint",
  "versionDialog","versionForm","versionDialogTitle","closeVersionDialog","cancelVersionBtn","deleteVersionBtn","editingVersionId","versionYoutubeUrl","fetchVersionInfoBtn","versionType","versionLabel","versionPerformer",
  "settingsDialog","closeSettingsDialog","lyricsSearchDialog","closeLyricsSearchDialog","lyricsSearchProgress","lyricsSearchResults","syncDialog","closeSyncDialog","syncEditorList","syncVideoTime","syncVideoDuration","syncRelativeTime","syncSeekBar","syncGoStartBtn","syncBack5Btn","syncBack1Btn","syncPlayPauseBtn","syncForward1Btn","syncForward5Btn","syncAddInterludeBtn","syncUndoBtn","resetSyncBtn","saveSyncBtn","useSharedSyncBtn",
  "helpBtn","lyricsHelpBtn","syncHelpBtn","helpDialog","closeHelpDialog","helpDialogTitle","helpDialogBody","topHelpBtn","openHelpFromSettingsBtn",
  "playlistDialog","closePlaylistDialog","newPlaylistName","createPlaylistBtn","playlistDialogHint","playlistManageList",
  "miniPlayerBtn","shortcutDialog","closeShortcutDialog",
  "lyricsFontSizeSlider","lyricsFontSizeValue","settingsAutoScroll","settingsBottomPlayer","settingsSpotlight","openShortcutFromSettingsBtn","settingsAppVersion","settingsStartupPage","settingsCompactMode","settingsShowArtwork","settingsGlass","settingsReduceMotion","settingsHelpTips",
  "syncNudgeMinus1","syncNudgePlus1","syncNudgeMinus5","syncNudgePlus5",
  "fontSizeUpBtn","fontSizeDownBtn"
].map(id => [id, $(id)]));


function handleCriticalDialogClose(event){
  const button=event.target?.closest?.("button");
  if(!button)return;

  const id=button.id;
  const criticalIds=new Set([
    "closeSongDialog","closeVersionDialog","closeSettingsDialog",
    "closeLyricsSearchDialog","closeSyncDialog",
    "closePlaylistDialog","closeQueueDialog","closeShortcutDialog","closeHelpDialog"
  ]);
  if(!criticalIds.has(id))return;

  event.preventDefault();
  event.stopImmediatePropagation();

  if(id==="closeSettingsDialog"){
    closeSettingsDialog();
    return;
  }
  if(id==="closeLyricsSearchDialog"){
    closeLyricsResultsAndReturn();
    return;
  }
  if(id==="closePlaylistDialog"){
    if(els.playlistDialog.open)els.playlistDialog.close();
    playlistTargetSongId=null;
    return;
  }

  const dialogByButton={
    closeSongDialog:"songDialog",
    closeVersionDialog:"versionDialog",
    closeSyncDialog:"syncDialog",
    closeQueueDialog:"queueDialog",
    closeShortcutDialog:"shortcutDialog",
    closeHelpDialog:"helpDialog"
  };
  const dialog=els[dialogByButton[id]];
  if(dialog?.open)dialog.close();
}
document.addEventListener("click",handleCriticalDialogClose,true);

function defaultLibrary(){return{version:LIB_VERSION,songs:[],playlists:[],settings:{theme:"dark",lyricsFontSize:18,showBottomPlayer:true,spotlight:true,shuffle:false,repeat:"off",autoScroll:true,volume:80,mainPage:"player",startupPage:"player",compactMode:false,showArtwork:true,glassEffect:true,reduceMotion:false,helpTips:true}}}
function uid(){return crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`}
function nowIso(){return new Date().toISOString()}
function normalizeText(v=""){return v.toLowerCase().normalize("NFKC").replace(/\s+/g," ").trim()}
function clamp(n,min,max){return Math.max(min,Math.min(max,n))}
function escText(v=""){return String(v)}

function typeName(type){return({original:"原曲 / MV",cover:"歌ってみた",firsttake:"FIRST TAKE",live:"Live",acoustic:"Acoustic",other:"その他"})[type]||"その他"}
function versionDisplayName(v){return v.label?.trim() || (v.type === "cover" && v.performer ? `Cover · ${v.performer}` : v.type === "live" && v.performer ? `Live · ${v.performer}` : typeName(v.type))}
function formatTime(sec,{allowEmpty=false}={}){if(allowEmpty&&(sec===null||sec===undefined||sec===""))return"未設定";const n=Math.max(0,Number(sec)||0),m=Math.floor(n/60),s=Math.floor(n%60),cs=Math.floor((n-Math.floor(n))*100);return`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}.${String(cs).padStart(2,"0")}`}
function parseTimecode(v){const m=String(v).trim().match(/^(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?$/);if(!m)return 0;const f=m[3]?Number(`0.${m[3].padEnd(2,"0").slice(0,2)}`):0;return Number(m[1])*60+Number(m[2])+f}
function extractVideoId(input){try{const u=new URL(input.trim());if(u.hostname.includes("youtu.be"))return u.pathname.split("/").filter(Boolean)[0]||"";if(u.pathname.startsWith("/shorts/")||u.pathname.startsWith("/embed/"))return u.pathname.split("/")[2]||"";return u.searchParams.get("v")||""}catch{const m=String(input).match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/);return m?m[1]:""}}
function thumbnailUrl(videoId){return videoId?`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`:""}
function parseLrc(text=""){const lines=[];for(const raw of text.split(/\r?\n/)){const stamps=[...raw.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];if(!stamps.length)continue;const t=raw.replace(/\[[^\]]+\]/g,"").trim();for(const st of stamps){const f=st[3]?Number(`0.${st[3].padEnd(2,"0").slice(0,2)}`):0;lines.push({time:Number(st[1])*60+Number(st[2])+f,text:t||"♪"})}}return lines.sort((a,b)=>a.time-b.time)}
function plainFromLrc(text=""){return parseLrc(text).map(x=>x.text).join("\n")}

function lyricTextLines(text=""){
  return String(text)
    .split(/\r?\n/)
    .map(x=>x.trim())
    .filter(Boolean);
}
function lyricLineKey(text=""){
  return String(text)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g,"")
    .replace(/[、。！？!?.,・…「」『』（）()【】[\]'"`~〜ー\-–—]/g,"")
    .trim();
}
function lcsLineMapping(oldLines,newLines){
  const a=oldLines.map(lyricLineKey);
  const b=newLines.map(lyricLineKey);
  const n=a.length,m=b.length;
  const dp=Array.from({length:n+1},()=>new Uint16Array(m+1));

  for(let i=n-1;i>=0;i--){
    for(let j=m-1;j>=0;j--){
      dp[i][j]=(a[i]&&a[i]===b[j])
        ? dp[i+1][j+1]+1
        : Math.max(dp[i+1][j],dp[i][j+1]);
    }
  }

  const map=new Map();
  let i=0,j=0;
  while(i<n&&j<m){
    if(a[i]&&a[i]===b[j]){
      map.set(j,i);
      i++;j++;
    }else if(dp[i+1][j]>=dp[i][j+1]){
      i++;
    }else{
      j++;
    }
  }
  return map;
}
function interpolateTimeForInsertedLine(newIndex,newCount,mapping,timedLines){
  let prevNew=-1,prevOld=-1,nextNew=-1,nextOld=-1;

  for(const [nidx,oidx] of mapping){
    if(nidx<newIndex && nidx>prevNew){
      prevNew=nidx;prevOld=oidx;
    }
    if(nidx>newIndex && (nextNew<0||nidx<nextNew)){
      nextNew=nidx;nextOld=oidx;
    }
  }

  const prevTime=prevOld>=0&&timedLines[prevOld] ? Number(timedLines[prevOld].time)||0 : null;
  const nextTime=nextOld>=0&&timedLines[nextOld] ? Number(timedLines[nextOld].time)||0 : null;

  if(prevTime!==null&&nextTime!==null&&nextNew>prevNew){
    const ratio=(newIndex-prevNew)/(nextNew-prevNew);
    return Math.max(0,prevTime+(nextTime-prevTime)*ratio);
  }
  if(prevTime!==null){
    return Math.max(0,prevTime+2*Math.max(1,newIndex-prevNew));
  }
  if(nextTime!==null){
    return Math.max(0,nextTime-2*Math.max(1,nextNew-newIndex));
  }

  if(timedLines.length){
    const ratio=newCount<=1?0:newIndex/(newCount-1);
    const last=Number(timedLines[timedLines.length-1]?.time)||0;
    return Math.max(0,last*ratio);
  }
  return 0;
}
function isSyncMarkerText(text=""){
  const t=String(text).normalize("NFKC").trim();
  return /^(?:♪|♫|♬|♩)(?:\s*間奏)?$/.test(t);
}
function mergePreservedSyncMarkers(lrcText,markers=[]){
  if(!markers.length)return lrcText||"";
  const lyricLines=parseLrc(lrcText||"").map((line,index)=>({...line,_kind:1,_order:index}));
  const markerLines=markers.map((line,index)=>({...line,_kind:0,_order:index}));
  return [...lyricLines,...markerLines]
    .sort((a,b)=>(a.time-b.time)||(a._kind-b._kind)||(a._order-b._order))
    .map(line=>`[${formatTime(Math.max(0,Number(line.time)||0))}]${line.text}`)
    .join("\n");
}
function rebaseLrcTextKeepingTimes(lrcText,oldPlainText,newPlainText){
  const allTimed=parseLrc(lrcText||"");
  const preservedMarkers=allTimed.filter(line=>isSyncMarkerText(line.text));
  const timed=allTimed.filter(line=>!isSyncMarkerText(line.text));
  const oldLines=lyricTextLines(oldPlainText);
  const newLines=lyricTextLines(newPlainText);

  if(!timed.length || !newLines.length)return lrcText||"";

  const finish=body=>mergePreservedSyncMarkers(body,preservedMarkers);

  // Most common case: typo correction / wording correction only.
  // Preserve every lyric timestamp exactly; musical-note markers are version-only
  // and are merged back at their original timestamps.
  if(timed.length===newLines.length){
    return finish(
      timed.map((line,index)=>`[${formatTime(line.time)}]${newLines[index]}`).join("\n")
    );
  }

  // If the old plain text and timed lyric lines have matching counts,
  // use unchanged surrounding lines to retain their exact timestamps.
  if(oldLines.length===timed.length){
    const mapping=lcsLineMapping(oldLines,newLines);
    const mappedTimes=new Array(newLines.length).fill(null);

    for(const [newIndex,oldIndex] of mapping){
      if(timed[oldIndex])mappedTimes[newIndex]=Number(timed[oldIndex].time)||0;
    }

    for(let i=0;i<newLines.length;i++){
      if(mappedTimes[i]===null){
        mappedTimes[i]=interpolateTimeForInsertedLine(i,newLines.length,mapping,timed);
      }
    }

    for(let i=1;i<mappedTimes.length;i++){
      if(mappedTimes[i]<mappedTimes[i-1])mappedTimes[i]=mappedTimes[i-1];
    }

    return finish(
      newLines.map((text,index)=>`[${formatTime(mappedTimes[index])}]${text}`).join("\n")
    );
  }

  // Fallback: keep as much lyric timing as possible by index.
  const out=[];
  for(let i=0;i<newLines.length;i++){
    let timeValue;
    if(i<timed.length){
      timeValue=Number(timed[i].time)||0;
    }else{
      const last=Number(timed[timed.length-1]?.time)||0;
      timeValue=last+2*(i-timed.length+1);
    }
    out.push(`[${formatTime(timeValue)}]${newLines[i]}`);
  }
  return finish(out.join("\n"));
}
function applyEditedLyricsToExistingSync(song,oldPlain,newPlain){
  if(!song||!newPlain)return{shared:false,versions:0};

  let shared=false;
  let versions=0;

  if(song.syncedLyrics){
    song.syncedLyrics=rebaseLrcTextKeepingTimes(song.syncedLyrics,oldPlain,newPlain);
    shared=true;
  }

  for(const version of song.versions||[]){
    if(version.customSyncedLyrics){
      version.customSyncedLyrics=rebaseLrcTextKeepingTimes(
        version.customSyncedLyrics,
        oldPlain,
        newPlain
      );
      version.updatedAt=nowIso();
      versions++;
    }
  }

  return{shared,versions};
}

function hasLrc(text=""){return /\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/.test(text)}

function makeVersion({youtubeUrl="",videoId="",type="original",performer="",label="",rawYoutubeTitle="",rawYoutubeAuthor=""}={}){return{id:uid(),youtubeUrl,videoId,type,performer,label,rawYoutubeTitle,rawYoutubeAuthor,startTime:0,endTime:null,lyricsOffset:0,skipSegments:[],autoSkip:true,customSyncedLyrics:"",createdAt:nowIso(),updatedAt:nowIso()}}
function migrateLegacy(raw){const out=defaultLibrary();if(!Array.isArray(raw))return out;out.songs=raw.map(s=>{const v=makeVersion({youtubeUrl:s.youtubeUrl||"",videoId:s.videoId||"",type:"original",performer:s.artist||""});v.lyricsOffset=-(Number(s.lyricsOffset)||0);return{id:s.id||uid(),title:s.title||"無題",artist:s.artist||"",plainLyrics:s.plainLyrics||"",syncedLyrics:s.syncedLyrics||"",lyricsSource:s.lyricsSource||"",lrclibId:s.lrclibId||"",favorite:false,playCount:0,lastPlayedAt:null,versions:[v],createdAt:s.createdAt||nowIso(),updatedAt:s.updatedAt||nowIso()}});return out}
function normalizeLibrary(data){const base=defaultLibrary();if(!data||typeof data!=="object")return base;base.settings={...base.settings,...(data.settings||{})};if(!base.settings.theme)base.settings.theme="dark";if(!base.settings.lyricsFontSize)base.settings.lyricsFontSize=18;if(base.settings.showBottomPlayer===undefined)base.settings.showBottomPlayer=true;if(base.settings.spotlight===undefined)base.settings.spotlight=true;if(base.settings.compactMode===undefined)base.settings.compactMode=false;if(base.settings.showArtwork===undefined)base.settings.showArtwork=true;if(base.settings.glassEffect===undefined)base.settings.glassEffect=true;if(base.settings.reduceMotion===undefined)base.settings.reduceMotion=false;if(base.settings.helpTips===undefined)base.settings.helpTips=true;if(!["player","browse"].includes(base.settings.mainPage))base.settings.mainPage="player";if(!["player","browse"].includes(base.settings.startupPage))base.settings.startupPage=base.settings.mainPage||"player";base.playlists=Array.isArray(data.playlists)?data.playlists.filter(p=>p&&p.id&&p.name).map(p=>({...p,songIds:Array.isArray(p.songIds)?p.songIds:[]})):[];base.songs=Array.isArray(data.songs)?data.songs.filter(Boolean).map(s=>({...s,id:s.id||uid(),title:s.title||"無題",artist:s.artist||"",plainLyrics:s.plainLyrics||"",syncedLyrics:s.syncedLyrics||"",favorite:Boolean(s.favorite),playCount:Number(s.playCount)||0,lastPlayedAt:s.lastPlayedAt||null,versions:(Array.isArray(s.versions)?s.versions:[]).map(v=>({...makeVersion(),...v,id:v.id||uid(),startTime:Number(v.startTime)||0,endTime:v.endTime===null||v.endTime===undefined?null:Number(v.endTime),lyricsOffset:Number(v.lyricsOffset)||0,skipSegments:Array.isArray(v.skipSegments)?v.skipSegments:[],autoSkip:v.autoSkip!==false,customSyncedLyrics:v.customSyncedLyrics||""}))})):[];base.version=LIB_VERSION;return base}
function loadLibrary(){try{const v3=localStorage.getItem(STORAGE_KEY);if(v3){library=normalizeLibrary(JSON.parse(v3));return}const legacy=localStorage.getItem(LEGACY_KEY);if(legacy){library=migrateLegacy(JSON.parse(legacy));persistLibrary();showToast("以前の曲データを新しい形式へ移行しました。");return}}catch(e){console.warn(e)}library=defaultLibrary()}
function persistLibrary(){localStorage.setItem(STORAGE_KEY,JSON.stringify(library))}

function showToast(message){
  const openDialogs=[...document.querySelectorAll("dialog[open]")];
  const topDialog=openDialogs.at(-1);
  if(topDialog){
    topDialog.querySelectorAll(".dialog-toast").forEach(x=>x.remove());
    const local=document.createElement("div");
    local.className="dialog-toast";
    local.textContent=message;
    topDialog.appendChild(local);
    setTimeout(()=>local.remove(),2400);
    return;
  }
  els.toast.textContent=message;
  els.toast.classList.add("show");
  clearTimeout(showToast.t);
  showToast.t=setTimeout(()=>els.toast.classList.remove("show"),2400);
}
function getSong(){return library.songs.find(s=>s.id===selectedSongId)||null}
function getVersion(song=getSong()){if(!song)return null;return song.versions.find(v=>v.id===selectedVersionId)||song.versions[0]||null}
function ensureSelection(){const song=getSong()||library.songs[0]||null;if(!song){selectedSongId=null;selectedVersionId=null;return}selectedSongId=song.id;if(!song.versions.some(v=>v.id===selectedVersionId))selectedVersionId=song.versions[0]?.id||null}
function effectiveLrc(song=getSong(),version=getVersion()){return version?.customSyncedLyrics||song?.syncedLyrics||""}
function currentPlayerTime(){try{return Number(ytPlayer?.getCurrentTime?.())||0}catch{return 0}}

function songHasLyrics(song){return Boolean(song?.plainLyrics?.trim()||song?.syncedLyrics?.trim())}
function songHasSync(song){return Boolean(song?.syncedLyrics?.trim()||(song?.versions||[]).some(v=>v.customSyncedLyrics?.trim()))}
function songHasCover(song){return (song?.versions||[]).some(v=>["cover","firsttake","live","acoustic"].includes(v.type))}
function viewSongs(){
  let arr=[...library.songs];
  if(currentView.type==="favorites")arr=arr.filter(s=>s.favorite);
  else if(currentView.type==="recent")arr=arr.filter(s=>s.lastPlayedAt).sort((a,b)=>String(b.lastPlayedAt).localeCompare(String(a.lastPlayedAt)));
  else if(currentView.type==="needsLyrics")arr=arr.filter(s=>!songHasLyrics(s));
  else if(currentView.type==="needsSync")arr=arr.filter(s=>songHasLyrics(s)&&!songHasSync(s));
  else if(currentView.type==="covers")arr=arr.filter(songHasCover);
  else if(currentView.type==="playlist"){
    const p=library.playlists.find(x=>x.id===currentView.playlistId);
    const ids=new Set(p?.songIds||[]);
    arr=arr.filter(s=>ids.has(s.id)).sort((a,b)=>(p.songIds.indexOf(a.id)-p.songIds.indexOf(b.id)));
  }
  const q=normalizeText(els.librarySearch.value);
  if(q)arr=arr.filter(s=>normalizeText(`${s.title} ${s.artist} ${s.versions.map(v=>`${v.performer} ${v.label}`).join(" ")}`).includes(q));
  return arr
}
function queueSongs(){const q=els.librarySearch.value;els.librarySearch.value="";const list=viewSongs();els.librarySearch.value=q;return list.length?list:[...library.songs]}

function currentViewLabel(){
  if(currentView.type==="favorites")return"お気に入り";
  if(currentView.type==="recent")return"最近聴いた曲";
  if(currentView.type==="needsLyrics")return"歌詞未登録";
  if(currentView.type==="needsSync")return"同期未設定";
  if(currentView.type==="covers")return"Coverあり";
  if(currentView.type==="playlist")return library.playlists.find(p=>p.id===currentView.playlistId)?.name||"プレイリスト";
  return"すべての曲";
}
function largeThumbnailUrl(videoId){
  return videoId?`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`:"";
}
function setMainPage(mode,{persist=true}={}){
  mainPage=mode==="browse"?"browse":"player";
  if(persist){
    library.settings.mainPage=mainPage;
    persistLibrary();
  }
  renderMainPage();
}
function renderMainPage(){
  const browse=mainPage==="browse";
  els.browsePage.classList.toggle("page-hidden",!browse);
  els.playerWorkspace.classList.toggle("page-hidden",browse);
  els.playerPageBtn.classList.toggle("active",!browse);
  els.browsePageBtn.classList.toggle("active",browse);
}
function makeBrowseMini(text,good=false){
  const span=document.createElement("span");
  span.className=`browse-mini${good?" good":""}`;
  span.textContent=text;
  return span;
}
function playSongFromBrowse(songId){
  selectSong(songId,true);
  // Keep the large browser open while playback changes.
}
function renderBrowse(){
  if(!els.browseGrid)return;
  const songs=viewSongs();

  els.browseHeading.textContent=currentViewLabel();
  els.browseCount.textContent=`${songs.length}曲`;
  document.querySelectorAll(".browse-chip").forEach(btn=>{
    btn.classList.toggle("active",btn.dataset.browseView===currentView.type);
  });

  els.browseGrid.innerHTML="";
  if(!songs.length){
    const empty=document.createElement("div");
    empty.className="browse-empty";
    const wrap=document.createElement("div");
    const strong=document.createElement("strong");
    const span=document.createElement("span");
    if(library.songs.length){
      strong.textContent="条件に合う曲がありません";
      span.textContent="検索やカテゴリを変えてみてください。";
    }else{
      strong.textContent="まだ曲がありません";
      span.textContent="「＋ 曲を追加」から最初の曲を登録できます。";
    }
    wrap.append(strong,span);
    empty.appendChild(wrap);
    els.browseGrid.appendChild(empty);
    return;
  }

  for(const song of songs){
    const card=document.createElement("article");
    card.className=`browse-card${song.id===selectedSongId?" active":""}`;
    const version=song.versions?.[0]||null;

    if(song.id===selectedSongId){
      const now=document.createElement("span");
      now.className="browse-now";
      now.textContent=playerStateSafe()===1?"再生中":"選択中";
      card.appendChild(now);
    }

    const actions=document.createElement("div");
    actions.className="browse-card-actions";
    const add=document.createElement("button");
    add.type="button";
    add.className="browse-quick-add";
    add.textContent="＋";
    add.title=`「${song.title}」を再生せずプレイリストに追加`;
    add.addEventListener("click",e=>{
      e.preventDefault();
      e.stopPropagation();
      openPlaylistDialog(song.id);
    });
    actions.appendChild(add);

    const cover=document.createElement("button");
    cover.type="button";
    cover.className="browse-cover";
    cover.title=`${song.title}を再生`;
    cover.addEventListener("click",()=>playSongFromBrowse(song.id));

    if(version?.videoId){
      const img=document.createElement("img");
      img.src=largeThumbnailUrl(version.videoId);
      img.alt="";
      img.loading="lazy";
      cover.appendChild(img);
    }else{
      const ph=document.createElement("span");
      ph.className="browse-placeholder";
      ph.textContent="♫";
      cover.appendChild(ph);
    }

    const play=document.createElement("span");
    play.className="browse-play";
    play.textContent="▶";
    cover.appendChild(play);

    const body=document.createElement("div");
    body.className="browse-body";
    const title=document.createElement("button");
    title.type="button";
    title.className="browse-title";
    title.textContent=song.title;
    title.title=song.title;
    title.addEventListener("click",()=>playSongFromBrowse(song.id));

    const artist=document.createElement("span");
    artist.className="browse-artist";
    artist.textContent=song.artist||"原曲アーティスト未設定";

    const status=document.createElement("div");
    status.className="browse-status";
    status.appendChild(makeBrowseMini(`${song.versions.length}版`));
    if(song.favorite)status.appendChild(makeBrowseMini("★ お気に入り",true));
    if(songHasSync(song))status.appendChild(makeBrowseMini("同期済み",true));
    else if(songHasLyrics(song))status.appendChild(makeBrowseMini("歌詞あり"));
    if(songHasCover(song))status.appendChild(makeBrowseMini("Cover",true));

    body.append(title,artist,status);
    card.append(actions,cover,body);
    els.browseGrid.appendChild(card);
  }
}
function renderAll(){ensureSelection();applyUiSettings();renderViewNav();renderPlaylists();renderLibrary();renderBrowse();renderSelectedSong();renderBottomPlayer();updateVisualTheme();renderMainPage()}
function renderViewNav(){
  document.querySelectorAll(".view-btn").forEach(btn=>btn.classList.toggle("active",btn.dataset.view===currentView.type));
  els.allCount.textContent=library.songs.length;
  els.favoriteCount.textContent=library.songs.filter(s=>s.favorite).length;
  els.needsLyricsCount.textContent=library.songs.filter(s=>!songHasLyrics(s)).length;
  els.needsSyncCount.textContent=library.songs.filter(s=>songHasLyrics(s)&&!songHasSync(s)).length;
  els.coverCount.textContent=library.songs.filter(songHasCover).length;
}
function renderPlaylists(){els.playlistNav.innerHTML="";for(const p of library.playlists){const b=document.createElement("button");b.type="button";b.className=`playlist-item${currentView.type==="playlist"&&currentView.playlistId===p.id?" active":""}`;b.textContent=`${p.name} · ${p.songIds.length}`;b.addEventListener("click",()=>{currentView={type:"playlist",playlistId:p.id};renderAll()});els.playlistNav.appendChild(b)}}
function renderLibrary(){
  const filtered=viewSongs();
  els.songCount.textContent=`${filtered.length}曲`;
  els.libraryLabel.textContent=currentViewLabel();
  els.songList.innerHTML="";

  if(!filtered.length){
    const p=document.createElement("p");
    p.className="muted small";
    p.style.padding="10px 6px";
    p.textContent=library.songs.length?"ここにはまだ曲がありません。":"右上の＋から曲を追加できます。";
    els.songList.appendChild(p);
    return;
  }

  for(const song of filtered){
    const row=document.createElement("div");
    row.className="song-row";

    const btn=document.createElement("button");
    btn.type="button";
    btn.className=`song-item${song.id===selectedSongId?" active":""}`;
    btn.title="クリックしてこの曲を選択";
    btn.addEventListener("click",()=>selectSong(song.id,false));

    const thumb=document.createElement("div");
    thumb.className="thumb";
    const vid=song.versions[0]?.videoId;
    if(vid){
      const img=document.createElement("img");
      img.src=thumbnailUrl(vid);
      img.alt="";
      img.loading="lazy";
      thumb.appendChild(img);
    }

    const meta=document.createElement("div");
    meta.className="song-meta";
    const title=document.createElement("strong");
    title.textContent=song.title;
    const ar=document.createElement("span");
    ar.textContent=`${song.artist||"原曲アーティスト未設定"} · ${song.versions.length}版`;
    meta.append(title,ar);

    const fav=document.createElement("span");
    fav.className="favorite-mark";
    fav.textContent=song.favorite?"★":"";
    btn.append(thumb,meta,fav);

    const quickAdd=document.createElement("button");
    quickAdd.type="button";
    quickAdd.className=`song-playlist-add${currentView.type==="playlist"?" in-playlist-view":""}`;
    quickAdd.textContent="＋";
    quickAdd.title=`「${song.title}」を再生せずプレイリストに追加`;
    quickAdd.setAttribute("aria-label",`${song.title}を再生せずプレイリストに追加`);
    quickAdd.addEventListener("click",e=>{
      e.preventDefault();
      e.stopPropagation();
      openPlaylistDialog(song.id);
    });

    row.append(btn,quickAdd);
    els.songList.appendChild(row);
  }
}

function setImageSource(img,url){
  if(!img)return;
  if(url){img.src=url;img.style.display="block"}
  else{img.removeAttribute("src");img.style.display="none"}
}
function renderSelectedSong(){
  const song=getSong(),v=getVersion(song),has=Boolean(song);
  for(const k of ["editSongBtn","deleteSongBtn","favoriteBtn","playlistBtn","addVersionBtn"])els[k].disabled=!has;
  els.editVersionBtn.disabled=!v;
  for(const k of ["setStartBtn","setEndBtn","resetRangeBtn","markSkipStartBtn","openSyncEditorBtn"])els[k].disabled=!v;
  els.markSkipEndBtn.disabled=true;
  els.favoriteBtn.textContent=song?.favorite?"★ お気に入り":"☆ お気に入り";
  if(!song){
    els.nowArtist.textContent="曲を追加してください";
    els.nowTitle.textContent="YouTubeと歌詞をひとつの画面で";
    els.nowVersionBadge.textContent="NO TRACK";
    els.nowPlayCount.textContent="";
    setImageSource(els.nowThumb,"");
    els.versionTabs.innerHTML="";
    els.playerPlaceholder.classList.remove("hidden");
    renderLyrics();
    renderVersionControls();
    renderBottomPlayer();
    updateVisualTheme();
    return
  }
  els.nowTitle.textContent=song.title;
  els.nowArtist.textContent=song.artist||"原曲アーティスト未設定";
  els.nowVersionBadge.textContent=v?typeName(v.type).toUpperCase():"NO VIDEO";
  els.nowPlayCount.textContent=song.playCount?`${song.playCount}回再生`:"";
  setImageSource(els.nowThumb,v?.videoId?thumbnailUrl(v.videoId):"");
  renderVersionTabs(song);
  renderVersionControls(v);
  renderLyrics(song,v);
  renderBottomPlayer();
  updateVisualTheme();
}
function renderVersionTabs(song){els.versionTabs.innerHTML="";song.versions.forEach(v=>{const b=document.createElement("button");b.type="button";b.className=`version-tab${v.id===selectedVersionId?" active":""}`;b.textContent=versionDisplayName(v);b.addEventListener("click",()=>selectVersion(v.id,false));els.versionTabs.appendChild(b)})}
function renderVersionControls(v=getVersion()){pendingSkipStart=null;els.pendingSkipLabel.textContent="";els.markSkipEndBtn.disabled=true;if(!v){els.startTimeLabel.textContent="00:00.00";els.endTimeLabel.textContent="未設定";els.offsetInput.value="0.0";els.skipList.innerHTML="";return}els.startTimeLabel.textContent=formatTime(v.startTime);els.endTimeLabel.textContent=formatTime(v.endTime,{allowEmpty:true});els.offsetInput.value=Number(v.lyricsOffset||0).toFixed(1);els.autoSkipToggle.checked=v.autoSkip!==false;els.versionSyncStatus.textContent=v.customSyncedLyrics?"この動画専用同期を使用":"原曲の時間データを使用";renderSkipList(v);updateModeButtons()}
function renderSkipList(v=getVersion()){els.skipList.innerHTML="";if(!v?.skipSegments?.length){const p=document.createElement("p");p.className="muted small";p.textContent="スキップ区間はありません。";els.skipList.appendChild(p);return}v.skipSegments.sort((a,b)=>a.start-b.start).forEach((seg,i)=>{const row=document.createElement("div");row.className="skip-row";const chk=document.createElement("input");chk.type="checkbox";chk.checked=seg.enabled!==false;chk.title="この区間を自動スキップ";chk.addEventListener("change",()=>{seg.enabled=chk.checked;persistLibrary()});const name=document.createElement("input");name.type="text";name.value=seg.label||`スキップ ${i+1}`;name.addEventListener("change",()=>{seg.label=name.value.trim()||`スキップ ${i+1}`;persistLibrary()});const time=document.createElement("span");time.className="time";time.textContent=`${formatTime(seg.start)} → ${formatTime(seg.end)}`;const del=document.createElement("button");del.type="button";del.className="skip-delete";del.textContent="削除";del.addEventListener("click",()=>{v.skipSegments=v.skipSegments.filter(x=>x.id!==seg.id);persistLibrary();renderSkipList(v)});row.append(chk,name,time,del);els.skipList.appendChild(row)})}


function playerVideoIdSafe(){
  try{return String(ytPlayer?.getVideoData?.()?.video_id||"")}catch{return""}
}
function setLyricsScrollTopInstant(top=0){
  const view=els.lyricsView;
  if(!view)return;
  const previous=view.style.scrollBehavior;
  view.style.scrollBehavior="auto";
  view.scrollTop=Math.max(0,Number(top)||0);
  view.style.scrollBehavior=previous;
}
function resetLyricsViewport(){
  const view=els.lyricsView;
  if(!view)return;

  lyricViewportResetToken+=1;
  const token=lyricViewportResetToken;

  setLyricsScrollTopInstant(0);

  // DOM layout / font calculation may finish after renderLyrics().
  // Re-apply the top position on the next two frames so an old song's
  // scroll position cannot be restored by the browser.
  requestAnimationFrame(()=>{
    if(token!==lyricViewportResetToken)return;
    setLyricsScrollTopInstant(0);
    requestAnimationFrame(()=>{
      if(token!==lyricViewportResetToken)return;
      setLyricsScrollTopInstant(0);
      ensureFirstLyricVisible();
    });
  });
}

function ensureFirstLyricVisible(){
  const view=els.lyricsView;
  const first=view?.querySelector?.(".lyric-line:first-child");
  if(!view||!first)return;
  const viewRect=view.getBoundingClientRect();
  const firstRect=first.getBoundingClientRect();
  if(view.scrollTop<=1 && firstRect.top < viewRect.top-1){
    setLyricsScrollTopInstant(0);
  }
}

function beginLyricVideoSwitch(){
  lyricVideoSwitchPending=true;
  lyricVideoSwitchStartedAt=performance.now();
  activeLyricIndex=-1;
  resetLyricsViewport();
}
function lyricPlayerReadyForSelectedVideo(v){
  if(!v?.videoId||!ytPlayer)return false;

  const playerId=playerVideoIdSafe();
  if(playerId&&playerId!==v.videoId)return false;

  if(!lyricVideoSwitchPending)return true;

  const elapsed=performance.now()-lyricVideoSwitchStartedAt;
  const current=currentPlayerTime();
  const expected=Math.max(0,Number(v.startTime)||0);
  const state=playerStateSafe();

  // CUED / PLAYING / PAUSED and already close to the selected version start
  // means the player has actually switched away from the previous video.
  const switched=
    (!playerId||playerId===v.videoId) &&
    (
      state===5 ||
      ((state===1||state===2||state===0) && Math.abs(current-expected)<=6)
    );

  if(switched||elapsed>8000){
    lyricVideoSwitchPending=false;
    return true;
  }
  return false;
}
function clearLyricHighlightClasses(){
  els.lyricsView.querySelectorAll(".lyric-line").forEach(el=>{
    el.classList.remove("active","past","near");
  });
}

function selectSong(id,autoplay=false){selectedSongId=id;const song=getSong();selectedVersionId=song?.versions[0]?.id||null;beginLyricVideoSwitch();renderAll();loadSelectedVideo(autoplay)}
function selectVersion(id,autoplay=false){selectedVersionId=id;beginLyricVideoSwitch();renderSelectedSong();renderLibrary();loadSelectedVideo(autoplay)}
function loadSelectedVideo(autoplay=false){
  const v=getVersion();
  beginLyricVideoSwitch();
  if(!v?.videoId){
    els.playerPlaceholder.classList.remove("hidden");
    lyricVideoSwitchPending=false;
    resetLyricsViewport();
    return;
  }
  els.playerPlaceholder.classList.add("hidden");
  const start=Math.max(0,Number(v.startTime)||0);
  if(ytReady&&ytPlayer){
    const arg={videoId:v.videoId,startSeconds:start};
    try{autoplay?ytPlayer.loadVideoById(arg):ytPlayer.cueVideoById(arg)}catch{}
  }else if(window.YT?.Player&&!ytPlayer){
    createYoutubePlayer(v.videoId);
  }
}

function renderLyrics(song=getSong(),v=getVersion()){
  els.lyricsView.innerHTML="";
  activeLyricIndex=-1;

  if(!song||(!song.syncedLyrics&&!song.plainLyrics)){
    els.lyricsView.className="lyrics-view empty";
    els.lyricsView.innerHTML='<div class="empty-copy"><strong>歌詞はまだありません</strong><span>曲情報から歌詞を検索するか、手動で入力できます。</span></div>';
    els.syncStatus.textContent="歌詞なし";
    els.syncStatus.className="status-pill";
    resetLyricsViewport();
    return;
  }

  const synced=parseLrc(effectiveLrc(song,v));
  if(synced.length){
    els.lyricsView.className="lyrics-view";
    synced.forEach((line,index)=>{
      const d=document.createElement("div");
      d.className="lyric-line";
      d.dataset.index=index;
      d.textContent=line.text;
      d.title=`曲開始から ${formatTime(line.time)}`;
      d.addEventListener("click",()=>{
        const vv=getVersion();
        if(!vv||!ytPlayer?.seekTo)return;
        lyricVideoSwitchPending=false;
        ytPlayer.seekTo(
          Math.max(0,Number(vv.startTime||0)+line.time+Number(vv.lyricsOffset||0)),
          true
        );
        ytPlayer.playVideo?.();
      });
      els.lyricsView.appendChild(d);
    });
    els.syncStatus.textContent="時間付き歌詞";
    els.syncStatus.className="status-pill synced";
  }else{
    els.lyricsView.className="lyrics-view";
    const pre=document.createElement("div");
    pre.className="plain-lyrics";
    pre.textContent=song.plainLyrics||song.syncedLyrics;
    els.lyricsView.appendChild(pre);
    els.syncStatus.textContent="通常歌詞";
    els.syncStatus.className="status-pill";
  }

  // Always finish a fresh render at the real top.
  resetLyricsViewport();
}
function updateLyricHighlight(){
  const song=getSong(),v=getVersion(song);
  if(!song||!v||!ytPlayer?.getCurrentTime)return;

  const lines=parseLrc(effectiveLrc(song,v));
  if(!lines.length)return;

  // Critical v20 fix:
  // while YouTube is still switching, getCurrentTime() can belong to the
  // previous video. Never use that old time to scroll the new song's lyrics.
  if(!lyricPlayerReadyForSelectedVideo(v)){
    if(els.lyricsView.scrollTop>1)setLyricsScrollTopInstant(0);
    return;
  }

  const timeline=currentPlayerTime()-Number(v.startTime||0)-Number(v.lyricsOffset||0);
  let idx=-1;
  for(let i=0;i<lines.length;i++){
    if(lines[i].time<=timeline)idx=i;
    else break;
  }

  // Before the first timestamp, the correct viewport is always the very top.
  // v19 returned early here when activeLyricIndex was already -1, which let
  // an incorrectly inherited scroll position remain.
  if(idx<0){
    if(activeLyricIndex!==-1)clearLyricHighlightClasses();
    activeLyricIndex=-1;
    if(library.settings.autoScroll&&!autoScrollManualPaused&&els.lyricsView.scrollTop>1){
      setLyricsScrollTopInstant(0);
    }
    return;
  }

  if(idx===activeLyricIndex){
    // If the first line is active but somehow no longer visible, recover it.
    if(idx===0&&library.settings.autoScroll&&!autoScrollManualPaused&&els.lyricsView.scrollTop>24){
      setLyricsScrollTopInstant(0);
    }
    return;
  }

  activeLyricIndex=idx;
  els.lyricsView.querySelectorAll(".lyric-line").forEach((el,i)=>{
    el.classList.toggle("active",i===idx);
    el.classList.toggle("past",i<idx);
    el.classList.toggle("near",i===idx-1||i===idx+1);
  });

  if(library.settings.autoScroll&&!autoScrollManualPaused){
    if(idx===0){
      setLyricsScrollTopInstant(0);
      return;
    }

    const target=els.lyricsView.querySelector(`.lyric-line[data-index="${idx}"]`);
    if(target){
      const top=Math.max(
        0,
        target.offsetTop-(els.lyricsView.clientHeight/2)+(target.offsetHeight/2)
      );
      els.lyricsView.scrollTo({top,behavior:"smooth"});
    }
  }
}

function enforcePlaybackRules(){const v=getVersion();if(!v||!ytPlayer?.getPlayerState)return;let state;try{state=ytPlayer.getPlayerState()}catch{return}if(state!==1)return;const t=currentPlayerTime();if(v.autoSkip!==false){const seg=v.skipSegments.find(s=>s.enabled!==false&&t>=Number(s.start)&&t<Number(s.end)-.08);if(seg){ytPlayer.seekTo(Number(seg.end)+.02,true);return}}if(v.endTime!==null&&Number(v.endTime)>Number(v.startTime||0)&&t>=Number(v.endTime)-.08){handleTrackEnd("range")}}
function playbackTick(){
  updateLyricHighlight();
  updateSyncTransport();
  updateBottomPlayer();
  if(!els.syncDialog?.open)enforcePlaybackRules();
  if(mainPage==="browse"&&els.browseGrid){
    const label=els.browseGrid.querySelector(".browse-card.active .browse-now");
    if(label)label.textContent=playerStateSafe()===1?"再生中":"選択中";
  }
}
function handleTrackEnd(reason="ended"){if(handlingEnd)return;handlingEnd=true;setTimeout(()=>handlingEnd=false,700);if(library.settings.repeat==="one"){restartCurrent(true);return}const queue=queueSongs();if(queue.length<=1&&library.settings.repeat!=="all"){try{ytPlayer.pauseVideo?.()}catch{}return}playAdjacent(1,true,true)}
function playAdjacent(direction=1,autoplay=true,fromEnd=false){const queue=queueSongs();if(!queue.length)return;let idx=queue.findIndex(s=>s.id===selectedSongId);if(library.settings.shuffle&&queue.length>1){let choices=queue.filter(s=>s.id!==selectedSongId);const next=choices[Math.floor(Math.random()*choices.length)];selectSong(next.id,autoplay);return}if(idx<0)idx=0;let next=idx+direction;if(next<0||next>=queue.length){if(library.settings.repeat==="all"||!fromEnd)next=(next+queue.length)%queue.length;else{try{ytPlayer.pauseVideo?.()}catch{}return}}selectSong(queue[next].id,autoplay)}
function restartCurrent(autoplay=true){const v=getVersion();if(!v||!ytPlayer)return;ytPlayer.seekTo(Number(v.startTime)||0,true);if(autoplay)ytPlayer.playVideo?.()}
function pauseAutoScrollForManualScroll(){
  if(!library.settings.autoScroll)return;
  autoScrollManualPaused=true;
  clearTimeout(autoScrollPauseTimer);
  updateModeButtons();
  autoScrollPauseTimer=setTimeout(()=>{
    autoScrollManualPaused=false;
    updateModeButtons();
  },8000);
}
function clearAutoScrollManualPause(){
  autoScrollManualPaused=false;
  clearTimeout(autoScrollPauseTimer);
  autoScrollPauseTimer=null;
}
function formatShortTime(sec){
  const n=Math.max(0,Number(sec)||0);
  const m=Math.floor(n/60),s=Math.floor(n%60);
  return `${m}:${String(s).padStart(2,"0")}`;
}
function stableAccentHue(seed=""){
  let hash=0;
  for(const ch of String(seed))hash=((hash<<5)-hash+ch.charCodeAt(0))|0;
  return 225+(Math.abs(hash)%66);
}
function updateVisualTheme(){
  const v=getVersion();
  const song=getSong();
  const currentTheme=library.settings.theme||"dark";
  if(currentTheme==="dark"){
    const seed=v?.videoId||song?.id||"lyrictube";
    document.documentElement.style.setProperty("--accent-h",String(stableAccentHue(seed)));
  }
  document.documentElement.style.setProperty("--ambient-image",v?.videoId?`url("${thumbnailUrl(v.videoId)}")`:"none");
  document.body.classList.toggle("has-track",!!(song&&v));
}
function applyTheme(){
  const theme=library.settings.theme||"dark";
  document.body.classList.forEach(c=>{if(c.startsWith("theme-"))document.body.classList.remove(c)});
  document.body.classList.add("theme-"+theme);
  if(theme==="dark"){
    const v=getVersion();
    const song=getSong();
    const seed=v?.videoId||song?.id||"lyrictube";
    document.documentElement.style.setProperty("--accent-h",String(stableAccentHue(seed)));
  }
}
function setTheme(name){
  library.settings.theme=name;
  applyTheme();
  persistLibrary();
  renderThemeButtons();
}
function applyLyricsFontSize(){
  const size=clamp(Number(library.settings.lyricsFontSize)||18,12,32);
  library.settings.lyricsFontSize=size;
  document.documentElement.style.setProperty("--lyric-font-size",size+"px");
  document.documentElement.style.setProperty("--lyric-font-size-full",Math.round(size*1.65)+"px");
  if(els.lyricsFontSizeSlider)els.lyricsFontSizeSlider.value=String(size);
  if(els.lyricsFontSizeValue)els.lyricsFontSizeValue.textContent=size+"px";
}
function toggleBottomPlayer(){
  const show=library.settings.showBottomPlayer!==false;
  document.body.classList.toggle("hide-bottom-player",!show);
  document.documentElement.style.setProperty("--bottom-player-h",show?"86px":"0px");
}
function toggleSpotlight(){
  const on=library.settings.spotlight!==false;
  const sp=document.getElementById("spotlight");
  if(sp)sp.style.display=on?"block":"none";
}
const HELP_TOPICS={
  overview:{title:"LyricTubeの使い方",html:[
    "<section class=\"help-block\"><h4>まずやること</h4><ol><li>「＋ 曲を追加」からYouTube URLを登録</li><li>歌詞を貼るか、自動歌詞検索を使う</li><li>必要なら「この動画専用に歌詞時間を合わせる」で同期</li></ol></section>",
    "<section class=\"help-block\"><h4>保存について</h4><p>曲・歌詞・プレイリスト・設定は、このブラウザの localStorage に保存されます。別のPCや別ブラウザでは自動共有されないので、必要なら書き出しを使ってください。</p></section>",
    "<section class=\"help-block\"><h4>おすすめの使い方</h4><p>原曲を1つ作って、Cover・Live・FIRST TAKE を別バージョンで追加すると管理しやすいです。</p></section>"
  ].join("")},
  player:{title:"再生画面ヘルプ",html:[
    "<section class=\"help-block\"><h4>再生画面</h4><p>左に動画、右に歌詞を並べて見られます。自動スクロールは手動で歌詞を触ると一時停止し、またONに戻せます。</p></section>",
    "<section class=\"help-block\"><h4>プレイリスト追加</h4><p>一覧の「＋」は、今流れている曲を変えずにプレイリストへ追加するためのボタンです。</p></section>"
  ].join("")},
  lyrics:{title:"歌詞ヘルプ",html:[
    "<section class=\"help-block\"><h4>歌詞の入れ方</h4><p>手動で貼り付けるほか、LRC形式なら時間付きのまま保存できます。通常歌詞だけでもあとから同期できます。</p></section>",
    "<section class=\"help-block\"><h4>画面からOCRする</h4><p>WindowsでPowerToys Text Extractorを使っている場合、通常は <strong>Win + Shift + T</strong> → 歌詞部分を範囲選択 → LyricTubeへ <strong>Ctrl + V</strong> で貼り付けできます。ショートカットを変更している場合はPowerToys側の設定を使ってください。</p></section>",
    "<section class=\"help-block\"><h4>見やすくする</h4><p>大きく表示・A＋/A−・自動スクロールON/OFFを使うと見やすさを調整できます。</p></section>"
  ].join("")},
  sync:{title:"歌詞時間合わせヘルプ",html:[
    "<section class=\"help-block\"><h4>基本</h4><p>各行の「今の時間」でその行に現在の再生位置を入れられます。シークバーで何度でも戻れるので、ミスしてもやり直せます。</p></section>",
    "<section class=\"help-block\"><h4>便利操作</h4><ul><li>行をクリックして選択</li><li><strong>Shift + T</strong> で選択中の行に現在時間を打刻</li><li>各行の <strong>-0.5 / -0.1 / +0.1 / +0.5</strong> は、その1行の保存時間だけを微調整（動画は動かない）</li><li>上部の±0.1 / ±0.5秒は全行を一括補正</li><li>「♪ 間奏を追加」で音符行を追加</li></ul></section>"
  ].join("")},
  settings:{title:"設定ヘルプ",html:[
    "<section class=\"help-block\"><h4>起動</h4><p>再生画面と曲を探す画面のどちらを最初に開くか選べます。</p></section>",
    "<section class=\"help-block\"><h4>表示</h4><p>コンパクト表示、サムネイル表示、ガラス風質感、動きの抑制などを切り替えられます。</p></section>",
    "<section class=\"help-block\"><h4>ショートカット</h4><p>ブラウザ版なので Win + Shift + T のようなPC全体のショートカットは取得できません。代わりにページを開いている間だけ使えるショートカットを用意しています。</p></section>"
  ].join("")}
};
function applyUiSettings(){
  document.body.classList.toggle("density-compact",!!library.settings.compactMode);
  document.body.classList.toggle("hide-library-thumbs",library.settings.showArtwork===false);
  document.body.classList.toggle("glass-off",library.settings.glassEffect===false);
  document.body.classList.toggle("reduce-motion",!!library.settings.reduceMotion);
  document.body.classList.toggle("hide-help-tips",library.settings.helpTips===false);
}
function openHelpDialog(topic="overview"){
  leaveLyricsFullscreenForDialog();
  const data=HELP_TOPICS[topic]||HELP_TOPICS.overview;
  if(els.helpDialogTitle)els.helpDialogTitle.textContent=data.title;
  if(els.helpDialogBody)els.helpDialogBody.innerHTML=data.html;
  if(!els.helpDialog)return;
  if(typeof els.helpDialog.showModal==="function"){
    if(!els.helpDialog.open)els.helpDialog.showModal();
  }else{
    els.helpDialog.setAttribute("open","open");
  }
}
function closeHelpDialog(){
  if(!els.helpDialog)return;
  if(typeof els.helpDialog.close==="function"&&els.helpDialog.open)els.helpDialog.close();
  else els.helpDialog.removeAttribute("open");
}

function playerDurationSafe(){try{return Math.max(0,Number(ytPlayer?.getDuration?.())||0)}catch{return 0}}
function playerStateSafe(){try{return Number(ytPlayer?.getPlayerState?.())}catch{return -1}}
function renderBottomPlayer(){
  const song=getSong(),v=getVersion(song);
  if(!song){
    els.bottomTitle.textContent="曲を選択してください";
    els.bottomArtist.textContent="LyricTube";
    setImageSource(els.bottomThumb,"");
    els.bottomPlayBtn.textContent="▶";
    els.bottomCurrentTime.textContent="0:00";
    els.bottomDuration.textContent="--:--";
    els.bottomSeek.value="0";
    els.bottomSeek.max="100";
    els.bottomSeek.disabled=true;
    return;
  }
  els.bottomTitle.textContent=song.title;
  els.bottomArtist.textContent=v?.performer?`${song.artist||"原曲未設定"} · ${v.performer}`:(song.artist||versionDisplayName(v||{}));
  setImageSource(els.bottomThumb,v?.videoId?thumbnailUrl(v.videoId):"");
  els.bottomSeek.disabled=!v?.videoId;
}
function updateBottomPlayer(){
  const song=getSong(),v=getVersion(song);
  renderBottomPlayer();
  if(!song||!v)return;
  const current=currentPlayerTime();
  const duration=playerDurationSafe();
  const displayEnd=(v.endTime!==null&&Number(v.endTime)>0)?Math.min(duration||Number(v.endTime),Number(v.endTime)):duration;
  els.bottomCurrentTime.textContent=formatShortTime(current);
  els.bottomDuration.textContent=displayEnd>0?formatShortTime(displayEnd):"--:--";
  els.bottomPlayBtn.textContent=playerStateSafe()===1?"❚❚":"▶";
  els.bottomVolume.value=String(clamp(Number(library.settings.volume??80),0,100));
  if(displayEnd>0){
    els.bottomSeek.max=String(displayEnd);
    if(!bottomSeekDragging)els.bottomSeek.value=String(clamp(current,0,displayEnd));
  }
}
function toggleMainPlayback(){
  if(!ytPlayer)return;
  try{playerStateSafe()===1?ytPlayer.pauseVideo?.():ytPlayer.playVideo?.()}catch{}
  setTimeout(updateBottomPlayer,50);
}
function renderQueueDialog(){
  const list=queueSongs();
  els.queueList.innerHTML="";
  if(!list.length){
    els.queueList.innerHTML='<p class="muted small">再生できる曲がありません。</p>';
    return;
  }
  list.forEach((song,index)=>{
    const button=document.createElement("button");
    button.type="button";
    button.className=`queue-item${song.id===selectedSongId?" active":""}`;
    const thumb=document.createElement("div");
    thumb.className="queue-thumb";
    const vid=song.versions?.[0]?.videoId;
    if(vid){
      const img=document.createElement("img");
      img.src=thumbnailUrl(vid);img.alt="";
      thumb.appendChild(img);
    }
    const meta=document.createElement("div");
    meta.className="queue-meta";
    const title=document.createElement("strong");title.textContent=song.title;
    const sub=document.createElement("span");sub.textContent=song.artist||"アーティスト未設定";
    meta.append(title,sub);
    const order=document.createElement("span");
    order.className="queue-order";order.textContent=String(index+1).padStart(2,"0");
    button.append(thumb,meta,order);
    button.addEventListener("click",()=>{els.queueDialog.close();selectSong(song.id,true)});
    els.queueList.appendChild(button);
  });
}
function openQueueDialog(){
  leaveLyricsFullscreenForDialog();
  renderQueueDialog();
  els.queueDialog.showModal();
}

function updateModeButtons(){
  els.shuffleBtn.textContent=`シャッフル ${library.settings.shuffle?"ON":"OFF"}`;
  els.shuffleBtn.classList.toggle("active",library.settings.shuffle);
  const r=library.settings.repeat;
  els.repeatBtn.textContent=`リピート ${r==="off"?"OFF":r==="all"?"全曲":"1曲"}`;
  els.repeatBtn.classList.toggle("active",r!=="off");
  const scrollText=!library.settings.autoScroll?"OFF":autoScrollManualPaused?"一時停止中":"ON";
  els.toggleAutoScrollBtn.textContent=`自動スクロール ${scrollText}`;
  els.toggleAutoScrollBtn.classList.toggle("active",library.settings.autoScroll&&!autoScrollManualPaused);
  els.toggleAutoScrollBtn.classList.toggle("paused",library.settings.autoScroll&&autoScrollManualPaused);
}

function createYoutubePlayer(videoId){if(!window.YT?.Player||ytPlayer)return;const v=getVersion();ytPlayer=new YT.Player("player",{width:"100%",height:"100%",videoId,playerVars:{playsinline:1,rel:0,start:Math.floor(Number(v?.startTime)||0),origin:window.location.origin},events:{onReady:()=>{ytReady=true;try{ytPlayer.setVolume?.(clamp(Number(library.settings.volume??80),0,100))}catch{}const current=getVersion();if(current?.videoId&&current.videoId!==videoId)ytPlayer.cueVideoById({videoId:current.videoId,startSeconds:Number(current.startTime)||0});resetLyricsViewport();updateBottomPlayer()},onStateChange:e=>{if(e.data===1)markPlayed();if(e.data===0)handleTrackEnd("youtube");updateBottomPlayer()},onError:e=>showToast(e.data===101||e.data===150?"この動画は投稿者の設定でサイト内再生できません。":"YouTube動画を再生できませんでした。")}})}
window.onYouTubeIframeAPIReady=()=>{ytReady=true;const v=getVersion();if(v?.videoId)createYoutubePlayer(v.videoId)}
function loadYoutubeApi(){if(window.YT?.Player){window.onYouTubeIframeAPIReady();return}const s=document.createElement("script");s.src="https://www.youtube.com/iframe_api";s.async=true;document.head.appendChild(s)}
function markPlayed(){const song=getSong();if(!song||lastCountedSongId===song.id)return;lastCountedSongId=song.id;song.playCount=(Number(song.playCount)||0)+1;song.lastPlayedAt=nowIso();persistLibrary();renderViewNav();if(currentView.type==="recent")renderLibrary();if(els.nowPlayCount)els.nowPlayCount.textContent=`${song.playCount}回再生`;setTimeout(()=>{if(lastCountedSongId===song.id)lastCountedSongId=null},15000)}

function detectVideoType(title=""){
  const t=String(title).toLowerCase();
  if(/the\s*first\s*take/i.test(t))return"firsttake";
  if(/歌ってみた|cover(?:ed)?|カバー/.test(t))return"cover";
  if(/\blive\b|ライブ|concert|生演奏/.test(t))return"live";
  if(/acoustic|アコースティック/.test(t))return"acoustic";
  return"original";
}
function cleanYoutubeTitle(title=""){
  return String(title)
    .replace(/[【\[][^】\]]*(?:歌ってみた|cover|covered|official|mv|music\s*video|the\s*first\s*take|live|acoustic)[^】\]]*[】\]]/gi," ")
    .replace(/\((?:[^)]*(?:official|music\s*video|mv|cover|covered|the\s*first\s*take|live|acoustic)[^)]*)\)/gi," ")
    .replace(/\b(?:official\s*)?(?:music\s*video|mv)\b/gi," ")
    .replace(/\s*[｜|]\s*(?:official|music\s*video|mv).*$/gi," ")
    .replace(/\s*[／/]\s*the\s*first\s*take.*$/gi," ")
    .replace(/\bthe\s*first\s*take\b.*$/gi," ")
    .replace(/\bcover(?:ed)?(?:\s*by)?\b.*$/gi," ")
    .replace(/歌ってみた(?:\s*by)?/gi," ")
    .replace(/\s{2,}/g," ")
    .replace(/^[\s\-–—|｜/／:：]+|[\s\-–—|｜/／:：]+$/g,"")
    .trim();
}
function normalizeLyricsSearchText(value=""){
  return String(value)
    .normalize("NFKC")
    .replace(/[【\[].*?[】\]]/g," ")
    .replace(/\((?:[^)]*(?:cover|covered|歌ってみた|歌ってみました|the\s*first\s*take|official|mv|music\s*video)[^)]*)\)/gi," ")
    .replace(/\b(?:cover(?:ed)?(?:\s*by)?|the\s*first\s*take|official\s*(?:music\s*video|mv)|music\s*video)\b/gi," ")
    .replace(/歌ってみた(?:動画)?|歌ってみました|歌わせていただきました/gi," ")
    .replace(/\s{2,}/g," ")
    .replace(/^[\s\-–—|｜/／:：]+|[\s\-–—|｜/／:：]+$/g,"")
    .trim();
}
function lyricsResultKey(item){
  return [
    normalizeText(item?.trackName||""),
    normalizeText(item?.artistName||""),
    Math.round(Number(item?.duration)||0)
  ].join("|");
}
function rankLyricsResults(results,title,artist){
  const nt=normalizeText(title),na=normalizeText(artist);
  const score=x=>{
    const xt=normalizeText(x?.trackName||"");
    const xa=normalizeText(x?.artistName||"");
    let s=0;
    if(nt&&xt===nt)s+=100;
    else if(nt&&(xt.includes(nt)||nt.includes(xt)))s+=45;
    if(na&&xa===na)s+=50;
    else if(na&&(xa.includes(na)||na.includes(xa)))s+=20;
    if(x?.syncedLyrics)s+=5;
    return s;
  };
  return [...results].sort((a,b)=>score(b)-score(a));
}
function buildCoverFallbackQueries(title,artist){
  const out=[];
  const seen=new Set();
  const add=params=>{
    const clean=Object.fromEntries(Object.entries(params).filter(([,v])=>String(v||"").trim()));
    const key=JSON.stringify(clean);
    if(!Object.keys(clean).length||seen.has(key))return;
    seen.add(key);
    out.push(clean);
  };

  // Coverでは投稿者/歌唱者が原曲アーティスト欄へ混ざっても検索できるよう、
  // 最初に「曲名だけ」を必ず試す。
  add({track_name:title});
  if(artist)add({q:`${title} ${artist}`});
  add({q:title});

  // 編集中の既存曲の場合はバージョンの生タイトルを使う
  let rawTitle="";
  if(!els.initialVideoSection.hidden){
    rawTitle=els.youtubeUrl.dataset.rawTitle||"";
  }else{
    const v=getVersion();
    rawTitle=String(v?.rawYoutubeTitle||"").trim();
  }
  let cleaned=normalizeLyricsSearchText(rawTitle);

  // 編集中の既存曲の場合はバージョンの歌唱者を使う
  let performer="";
  if(!els.initialVideoSection.hidden){
    performer=els.youtubeUrl.dataset.performer||els.initialPerformer.value.trim();
  }else{
    const v=getVersion();
    performer=String(v?.rawYoutubeAuthor||"").trim();
  }
  if(performer&&cleaned){
    const escaped=performer.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    cleaned=cleaned.replace(new RegExp(`(?:\\s*[|｜/／-]\\s*)?${escaped}\\s*$`,"i"),"").trim();
  }

  if(cleaned&&normalizeText(cleaned)!==normalizeText(title)){
    add({q:cleaned});

    // 嵐「Monster」のような表記
    const quote=cleaned.match(/^(.+?)[「『](.+?)[」』]/);
    if(quote){
      add({track_name:quote[2].trim(),artist_name:quote[1].trim()});
      add({track_name:quote[2].trim()});
    }

    // Monster / 嵐 または逆向きも候補にする
    const slash=cleaned.match(/^(.+?)\s*[／/]\s*(.+)$/);
    if(slash){
      add({track_name:slash[1].trim(),artist_name:slash[2].trim()});
      add({track_name:slash[1].trim()});
      add({track_name:slash[2].trim(),artist_name:slash[1].trim()});
    }

    // 嵐 - Monster または逆向きも候補にする
    const dash=cleaned.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    if(dash){
      add({track_name:dash[2].trim(),artist_name:dash[1].trim()});
      add({track_name:dash[2].trim()});
      add({track_name:dash[1].trim(),artist_name:dash[2].trim()});
    }
  }

  return out.slice(0,8);
}
function getV1RawLyricsQuery(){
  if(!els.initialVideoSection.hidden){
    const rawTitle=(els.youtubeUrl.dataset.rawTitle||"").trim();
    const rawAuthor=(els.youtubeUrl.dataset.performer||"").trim();
    if(rawTitle)return{track_name:rawTitle,...(rawAuthor?{artist_name:rawAuthor}:{})};
    return null;
  }

  const v=getVersion();
  const rawTitle=String(v?.rawYoutubeTitle||"").trim();
  const rawAuthor=String(v?.rawYoutubeAuthor||"").trim();
  if(rawTitle)return{track_name:rawTitle,...(rawAuthor?{artist_name:rawAuthor}:{})};
  return null;
}

const LRCLIB_BASE_URL="https://lrclib.net";
const LRCLIB_CLIENT_ID=`LyricTube/${APP_VERSION.replace(/^v/,"")} (GitHub Pages)`;
const lrclibBrowserCache=new Map();

function lrclibDelay(ms){
  return new Promise(resolve=>setTimeout(resolve,ms));
}
function lrclibRetryAfterSeconds(res){
  const raw=res.headers?.get?.("Retry-After");
  const n=Number(raw);
  return Number.isFinite(n)?Math.max(0,Math.ceil(n)):0;
}
async function lrclibFetchJson(path,{timeoutMs=30000,retry=true}={}){
  let lastError=null;
  const tries=retry?2:1;

  for(let attempt=0;attempt<tries;attempt++){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const res=await fetch(`${LRCLIB_BASE_URL}${path}`,{
        method:"GET",
        mode:"cors",
        cache:"no-store",
        headers:{
          "Accept":"application/json",
          "Lrclib-Client":LRCLIB_CLIENT_ID
        },
        signal:controller.signal
      });
      clearTimeout(timer);

      if(res.status===429){
        const err=new Error("LRCLIBのレート制限に達しました。");
        err.code="RATE_LIMIT";
        err.retryAfter=lrclibRetryAfterSeconds(res);
        throw err;
      }
      if(!res.ok){
        const err=new Error(`LRCLIB HTTP ${res.status}`);
        err.status=res.status;
        if(res.status>=500&&attempt+1<tries){
          lastError=err;
          await lrclibDelay(900);
          continue;
        }
        throw err;
      }
      return await res.json();
    }catch(err){
      clearTimeout(timer);
      if(err?.code==="RATE_LIMIT")throw err;
      lastError=err?.name==="AbortError"
        ?new Error("LRCLIBが30秒以内に応答しませんでした。")
        :err;
      if(attempt+1<tries){
        await lrclibDelay(900);
        continue;
      }
    }
  }
  throw lastError||new Error("LRCLIBへ接続できませんでした。");
}
async function requestLyricsSearch(params){
  const qs=new URLSearchParams(params);
  const key=`search:${qs.toString().toLowerCase()}`;
  const cached=lrclibBrowserCache.get(key);
  if(cached&&Date.now()-cached.at<10*60*1000)return cached.data;

  const data=await lrclibFetchJson(`/api/search?${qs.toString()}`);
  const list=Array.isArray(data)?data:[];
  if(list.length)lrclibBrowserCache.set(key,{at:Date.now(),data:list});
  return list;
}
async function requestLyricsById(id){
  if(!id)return null;
  const key=`id:${id}`;
  const cached=lrclibBrowserCache.get(key);
  if(cached&&Date.now()-cached.at<10*60*1000)return cached.data;

  try{
    const item=await lrclibFetchJson(`/api/get/${encodeURIComponent(id)}`,{retry:false});
    if(item&&typeof item==="object"){
      lrclibBrowserCache.set(key,{at:Date.now(),data:item});
      return item;
    }
  }catch(err){
    if(err?.status===404)return null;
    throw err;
  }
  return null;
}
function leaveLyricsFullscreenForDialog(){
  if(!fullLyrics)return;
  fullLyrics=false;
  document.querySelector(".lyrics-panel")?.classList.remove("fullscreen");
  els.fullscreenLyricsBtn.textContent="大きく表示";
}
function openLyricsResultsFront(){
  leaveLyricsFullscreenForDialog();
  lyricsSearchReturnToSong=els.songDialog.open;
  if(lyricsSearchReturnToSong)els.songDialog.close();
  requestAnimationFrame(()=>{
    if(!els.lyricsSearchDialog.open)els.lyricsSearchDialog.showModal();
  });
}
function closeLyricsResultsAndReturn(){
  if(els.lyricsSearchDialog.open)els.lyricsSearchDialog.close();
  const shouldReturn=lyricsSearchReturnToSong;
  lyricsSearchReturnToSong=false;
  if(shouldReturn){
    requestAnimationFrame(()=>{
      if(!els.songDialog.open)els.songDialog.showModal();
    });
  }
}
function lyricTextForCopy(item){
  if(item?.plainLyrics?.trim())return item.plainLyrics.trim();
  if(item?.syncedLyrics?.trim())return plainFromLrc(item.syncedLyrics).trim();
  return "";
}
async function copyTextReliable(text){
  if(!text)return false;
  try{
    if(navigator.clipboard?.writeText){
      await navigator.clipboard.writeText(text);
      return true;
    }
  }catch(err){
    console.warn("Clipboard API write failed:",err);
  }

  // Fallback for browsers/settings that reject Clipboard API.
  const ta=document.createElement("textarea");
  ta.value=text;
  ta.setAttribute("readonly","");
  Object.assign(ta.style,{
    position:"fixed",
    left:"-9999px",
    top:"0",
    opacity:"0"
  });
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0,ta.value.length);
  let ok=false;
  try{ok=document.execCommand("copy")}catch{}
  ta.remove();
  return ok;
}
async function copyLyricsResult(index){
  const item=pendingLyricsResults[index];
  if(!item)return;
  const text=lyricTextForCopy(item);
  if(!text)return showToast("この候補にはコピーできる歌詞がありません。");
  const ok=await copyTextReliable(text);
  showToast(ok?"歌詞をコピーしました。":"自動コピーできませんでした。「歌詞を表示」から選択してコピーできます。");
}

function normalizeArtistIdentity(value=""){
  return String(value||"")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\bofficial\b|\bchannel\b|\bch\.?\b|\btopic\b/g," ")
    .replace(/公式|チャンネル/g," ")
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/gi,"")
    .trim();
}
function artistLooksSame(a,b){
  const na=normalizeArtistIdentity(a),nb=normalizeArtistIdentity(b);
  if(!na||!nb)return false;
  return na===nb || (Math.min(na.length,nb.length)>=4 && (na.includes(nb)||nb.includes(na)));
}
function explicitOriginalArtistFromTitle(raw=""){
  const s=String(raw||"");
  for(const p of [
    /(?:原曲|original\s*(?:artist|by)?)\s*[:：]\s*([^|｜/／【\[\(（]+)/i,
    /(?:original)\s*[:：]\s*([^|｜/／【\[\(（]+)/i
  ]){
    const m=s.match(p);
    if(m?.[1])return m[1].trim();
  }
  return"";
}
function parseYoutubeMetadata(data={},typeHint=""){
  const raw=String(data.title||"").trim();
  const author=String(data.author_name||data.author||"").trim();
  const detectedType=detectVideoType(raw);
  const hintedType=String(typeHint||"").trim();
  const type=(detectedType==="original"&&hintedType&&hintedType!=="original")
    ? hintedType
    : detectedType;

  let base=cleanYoutubeTitle(raw);
  let track=base;
  let parsedArtist="";
  let separator="";

  const dash=base.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if(dash){
    parsedArtist=dash[1].trim();
    track=dash[2].trim();
    separator="dash";
  }else{
    const slash=base.match(/^(.+?)\s*[／/]\s*(.+)$/);
    if(slash&&!/youtube|official|channel/i.test(slash[2])){
      track=slash[1].trim();
      parsedArtist=slash[2].trim();
      separator="slash";
    }
  }

  track=track.replace(/[【\[].*?[】\]]/g," ").replace(/\([^)]*\)$/g," ").replace(/\s{2,}/g," ").trim();
  parsedArtist=parsedArtist.replace(/[【\[].*?[】\]]/g," ").replace(/\([^)]*\)$/g," ").replace(/\s{2,}/g," ").trim();

  const explicitOriginal=explicitOriginalArtistFromTitle(raw);
  let artistName="";
  let artistConfidence="none";

  if(explicitOriginal){
    artistName=explicitOriginal;
    artistConfidence="explicit-original";
  }else if(["original","firsttake","live","acoustic"].includes(type)){
    artistName=parsedArtist;
    artistConfidence=artistName?"title-pattern":"none";
  }else if(type==="cover"){
    if(separator==="slash"&&parsedArtist&&!artistLooksSame(parsedArtist,author)){
      artistName=parsedArtist;
      artistConfidence="cover-song-slash-original";
    }else if(
      separator==="dash"&&parsedArtist&&
      /cover(?:ed)?\s+by/i.test(raw)&&
      !artistLooksSame(parsedArtist,author)
    ){
      artistName=parsedArtist;
      artistConfidence="cover-by-explicit";
    }
  }

  if(!track)track=raw||"無題";
  return{
    rawTitle:raw,
    trackTitle:track,
    artistName,
    artistConfidence,
    performer:author,
    type,
    label:base||raw,
    source:data.source||"unknown"
  };
}


function waitForYoutubeApi(timeoutMs=7000){
  if(window.YT?.Player)return Promise.resolve();
  loadYoutubeApi();
  return new Promise((resolve,reject)=>{
    const started=Date.now();
    const timer=setInterval(()=>{
      if(window.YT?.Player){
        clearInterval(timer);
        resolve();
      }else if(Date.now()-started>timeoutMs){
        clearInterval(timer);
        reject(new Error("YouTube Player API timeout"));
      }
    },100);
  });
}
async function fetchYoutubeInfoViaPlayer(videoId){
  await waitForYoutubeApi();
  return new Promise((resolve,reject)=>{
    const holder=document.createElement("div");
    holder.id=`yt-meta-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    Object.assign(holder.style,{
      position:"fixed",
      left:"-10000px",
      top:"0",
      width:"320px",
      height:"200px",
      opacity:"0.01",
      pointerEvents:"none",
      zIndex:"-1"
    });
    document.body.appendChild(holder);

    let tempPlayer=null;
    let finished=false;
    let pollTimer=null;
    const timeout=setTimeout(()=>finish(new Error("player metadata timeout")),7000);

    function cleanup(){
      clearTimeout(timeout);
      if(pollTimer)clearInterval(pollTimer);
      try{tempPlayer?.destroy?.()}catch{}
      holder.remove();
    }
    function finish(err,data){
      if(finished)return;
      finished=true;
      cleanup();
      err?reject(err):resolve(data);
    }
    function tryRead(){
      try{
        const d=tempPlayer?.getVideoData?.();
        if(d?.title){
          finish(null,{
            title:d.title,
            author_name:d.author||"",
            video_id:videoId,
            source:"youtube-player"
          });
        }
      }catch{}
    }

    try{
      tempPlayer=new YT.Player(holder.id,{
        width:"320",
        height:"200",
        videoId,
        playerVars:{controls:0,playsinline:1,rel:0},
        events:{
          onReady:()=>{
            tryRead();
            pollTimer=setInterval(tryRead,200);
          },
          onStateChange:tryRead,
          onError:()=>finish(new Error("YouTube player metadata error"))
        }
      });
    }catch(err){
      finish(err);
    }
  });
}

async function requestYoutubeMetadata(url,videoId){
  if(!videoId)throw new Error("YouTube動画IDを取得できませんでした。");
  return await fetchYoutubeInfoViaPlayer(videoId);
}
function applyYoutubeMetadata(body,target){
  const typeHint=target==="song"
    ? (els.initialVersionType?.value||"")
    : (els.versionType?.value||"");
  const info=parseYoutubeMetadata(body,typeHint);

  if(target==="song"){
    els.youtubeUrl.dataset.rawTitle=info.rawTitle||body.title||"";
    els.youtubeUrl.dataset.performer=info.performer||"";
    els.youtubeUrl.dataset.detectedType=info.type||"original";

    els.trackTitle.value=info.trackTitle||body.title||"";
    els.initialPerformer.value=info.performer||"";
    els.initialVersionType.value=info.type||"original";

    const existingArtist=els.artistName.value.trim();
    if(info.artistName){
      if(!existingArtist||info.artistConfidence==="explicit-original"){
        els.artistName.value=info.artistName;
      }
    }else if(info.type==="original"&&info.performer&&!existingArtist){
      els.artistName.value=info.performer;
    }

    els.fetchYoutubeInfoBtn.title=`取得元: ${info.source}`;
    const sourceLabel=info.source==="youtube-player"?"Player経由":"YouTube情報";
    const coverNote=info.type==="cover"&&!info.artistName
      ?"（歌唱者と原曲アーティストは分離）"
      :"";
    showToast(`${sourceLabel}から反映しました: ${info.trackTitle}${coverNote}`);
  }else{
    els.versionYoutubeUrl.dataset.rawTitle=info.rawTitle||body.title||"";
    els.versionYoutubeUrl.dataset.performer=info.performer||"";
    els.versionPerformer.value=info.performer||"";
    els.versionType.value=info.type||els.versionType.value;
    els.versionLabel.value=(info.label||body.title||"").slice(0,60);
    els.fetchVersionInfoBtn.title=`取得元: ${info.source}`;
    showToast(`動画情報を反映しました: ${info.label||info.trackTitle}`);
  }
}

async function fetchOembed(url,target="song"){
  const videoId=extractVideoId(url);
  if(!videoId)return showToast("YouTube URLを確認してください。");

  const btn=target==="song"?els.fetchYoutubeInfoBtn:els.fetchVersionInfoBtn;
  btn.disabled=true;
  const oldText=btn.textContent;
  btn.textContent="取得中…";

  try{
    const body=await requestYoutubeMetadata(url,videoId);
    applyYoutubeMetadata(body,target);
  }catch(err){
    console.warn("YouTube info fetch failed:",err);
    showToast("動画情報を取得できませんでした。YouTubeで再生できる公開動画か確認してください。");
  }finally{
    btn.disabled=false;
    btn.textContent=oldText;
  }
}


function renderThemeButtons(){
  const theme=library.settings.theme||"dark";
  document.querySelectorAll(".theme-btn").forEach(btn=>{
    btn.classList.toggle("active",btn.dataset.theme===theme);
  });
}
function openSettingsDialog(){
  leaveLyricsFullscreenForDialog();
  renderThemeButtons();
  els.lyricsFontSizeSlider.value=String(library.settings.lyricsFontSize||18);
  els.lyricsFontSizeValue.textContent=(library.settings.lyricsFontSize||18)+"px";
  els.settingsAutoScroll.checked=library.settings.autoScroll!==false;
  els.settingsBottomPlayer.checked=library.settings.showBottomPlayer!==false;
  els.settingsSpotlight.checked=library.settings.spotlight!==false;
  if(els.settingsStartupPage)els.settingsStartupPage.value=library.settings.startupPage||"player";
  if(els.settingsCompactMode)els.settingsCompactMode.checked=!!library.settings.compactMode;
  if(els.settingsShowArtwork)els.settingsShowArtwork.checked=library.settings.showArtwork!==false;
  if(els.settingsGlass)els.settingsGlass.checked=library.settings.glassEffect!==false;
  if(els.settingsReduceMotion)els.settingsReduceMotion.checked=!!library.settings.reduceMotion;
  if(els.settingsHelpTips)els.settingsHelpTips.checked=library.settings.helpTips!==false;
  els.settingsAppVersion.textContent=`GH ${APP_VERSION}`;
  if(!els.settingsDialog.open)els.settingsDialog.showModal();
}
function closeSettingsDialog(){
  if(els.settingsDialog.open)els.settingsDialog.close();
}
function openSongDialog(song=null){
  leaveLyricsFullscreenForDialog();
  els.songForm.reset();
  delete els.lyricsInput.dataset.lrclibId;
  delete els.lyricsInput.dataset.lyricsSource;
  delete els.youtubeUrl.dataset.rawTitle;
  delete els.youtubeUrl.dataset.performer;
  delete els.youtubeUrl.dataset.detectedType;
  els.editingSongId.value=song?.id||"";
  els.songDialogTitle.textContent=song?"曲情報を編集":"曲を追加";
  els.initialVideoSection.hidden=Boolean(song);
  els.youtubeUrl.required=!song;
  if(song){
    els.trackTitle.value=song.title||"";
    els.artistName.value=song.artist||"";
    els.lyricsInput.value=song.syncedLyrics||song.plainLyrics||"";
    if(song.lrclibId)els.lyricsInput.dataset.lrclibId=song.lrclibId;
    if(song.lyricsSource)els.lyricsInput.dataset.lyricsSource=song.lyricsSource;
  }else{
    els.initialVersionType.value="original";
  }
  els.songDialog.showModal();
}
async function searchLyrics(){
  const title=els.trackTitle.value.trim();
  const artist=els.artistName.value.trim();
  if(!title)return showToast("先に曲名を入力してください。");

  els.searchLyricsBtn.disabled=true;
  const oldText=els.searchLyricsBtn.textContent;
  els.searchLyricsBtn.textContent="検索中…";
  els.lyricsSearchProgress.textContent="LRCLIBへ直接検索しています…";

  const diagnostics=[];
  const merged=[];
  const mergedKeys=new Set();
  let rateLimited=null;

  const addResults=(items,source)=>{
    for(const item of items||[]){
      const key=String(item?.id??lyricsResultKey(item));
      if(mergedKeys.has(key))continue;
      mergedKeys.add(key);
      merged.push({...item,_matchSource:source});
    }
  };
  const runAttempt=async(label,params)=>{
    try{
      const items=await requestLyricsSearch(params);
      diagnostics.push({label,ok:true,count:items.length});
      addResults(items,label);
      return true;
    }catch(err){
      diagnostics.push({label,ok:false,count:0,error:err.message||"接続失敗"});
      if(err?.code==="RATE_LIMIT"){
        rateLimited=err;
        return false;
      }
      return true;
    }
  };

  try{
    const savedId=els.lyricsInput.dataset.lrclibId||getSong()?.lrclibId||"";
    if(savedId){
      try{
        const item=await requestLyricsById(savedId);
        diagnostics.push({label:"保存済みLRCLIB ID",ok:Boolean(item),count:item?1:0});
        if(item)addResults([item],"保存済みLRCLIB ID");
      }catch(err){
        diagnostics.push({label:"保存済みLRCLIB ID",ok:false,count:0,error:err.message||"取得失敗"});
        if(err?.code==="RATE_LIMIT")rateLimited=err;
      }
    }

    const currentType=els.initialVideoSection.hidden
      ?(getVersion()?.type||"original")
      :(els.initialVersionType.value||els.youtubeUrl.dataset.detectedType||"original");
    const performer=els.initialVideoSection.hidden
      ?String(getVersion()?.performer||getVersion()?.rawYoutubeAuthor||"").trim()
      :String(els.initialPerformer.value||els.youtubeUrl.dataset.performer||"").trim();

    const badCoverArtist=
      ["cover","other"].includes(currentType)&&
      artist&&performer&&
      typeof artistLooksSame==="function"&&
      artistLooksSame(artist,performer);

    const attempts=[];
    const attemptSeen=new Set();
    const addAttempt=(label,params)=>{
      const clean=Object.fromEntries(
        Object.entries(params)
          .map(([k,v])=>[k,String(v||"").trim()])
          .filter(([,v])=>v)
      );
      if(!clean.track_name&&!clean.q)return;
      const key=JSON.stringify(clean).toLowerCase();
      if(attemptSeen.has(key))return;
      attemptSeen.add(key);
      attempts.push({label,params:clean});
    };

    if(artist&&!badCoverArtist)addAttempt("曲名＋原曲アーティスト",{track_name:title,artist_name:artist});
    addAttempt("曲名のみ",{track_name:title});
    if(artist&&!badCoverArtist)addAttempt("自由検索",{q:`${title} ${artist}`});
    addAttempt("曲名の自由検索",{q:title});

    for(const q of buildCoverFallbackQueries(title,badCoverArtist?"":artist)){
      addAttempt("表記ゆれ候補",q);
    }

    const raw=getV1RawLyricsQuery();
    if(raw?.track_name){
      addAttempt("YouTube生タイトル",raw);
      addAttempt("YouTube生タイトル自由検索",{q:[raw.track_name,raw.artist_name].filter(Boolean).join(" ")});
    }

    for(let i=0;i<attempts.length&&!rateLimited&&merged.length<8;i++){
      if(i>0)await lrclibDelay(350);
      const keepGoing=await runAttempt(attempts[i].label,attempts[i].params);
      if(!keepGoing)break;
    }

    pendingLyricsResults=rankLyricsResults(merged,title,badCoverArtist?"":artist);

    const detail=diagnostics.map(x=>
      x.ok?`${x.label}: ${x.count}件`:`${x.label}: ${x.error||"失敗"}`
    ).join(" → ");

    if(rateLimited){
      const wait=Number(rateLimited.retryAfter)||0;
      els.lyricsSearchProgress.textContent=
        `LRCLIBレート制限${wait?` · 約${wait}秒待って再検索`:""} · ${detail}`;
    }else{
      els.lyricsSearchProgress.textContent=detail||"候補はありませんでした。";
    }

    renderLyricsSearchResults();
    openLyricsResultsFront();

    if(!pendingLyricsResults.length){
      if(rateLimited){
        const wait=Number(rateLimited.retryAfter)||0;
        showToast(wait
          ?`LRCLIBの制限中です。約${wait}秒待って再検索してください。`
          :"LRCLIBのレート制限中です。少し待って再検索してください。");
      }else if(diagnostics.some(x=>!x.ok)&&!diagnostics.some(x=>x.ok)){
        showToast("LRCLIBへ接続できませんでした。ネット接続またはLRCLIB側の状態を確認してください。");
      }else{
        showToast("LRCLIBでは見つかりませんでした。Google歌詞検索も使えます。");
      }
    }
  }catch(err){
    console.warn("Lyrics search failed:",err);
    els.lyricsSearchProgress.textContent=`検索エラー: ${err.message}`;
    showToast("歌詞検索に失敗しました。Google歌詞検索も使えます。");
  }finally{
    els.searchLyricsBtn.disabled=false;
    els.searchLyricsBtn.textContent=oldText;
  }
}
function buildGoogleLyricsQuery(){
  const title=els.trackTitle.value.trim();
  const artist=els.artistName.value.trim();
  if(!title)return null;
  return [title,artist,"歌詞"].filter(Boolean).join(" ");
}
function openGoogleLyricsSearch(){
  const query=buildGoogleLyricsQuery();
  if(!query)return showToast("先に曲名を入力してください。");
  const url=`https://www.google.com/search?q=${encodeURIComponent(query)}`;
  try{
    sessionStorage.setItem("lyrictube.awaitingLyricsPaste","1");
    sessionStorage.setItem("lyrictube.lastLyricsQuery",query);
  }catch{}
  const opened=window.open(url,"_blank","noopener,noreferrer");
  if(!opened){
    showToast("Googleを開けませんでした。ポップアップ許可を確認してください。");
    return;
  }
  showToast(`「${query}」でGoogle検索を開きました。`);
}
async function pasteLyricsFromClipboard(){
  els.lyricsInput.focus();
  try{
    if(!navigator.clipboard?.readText)throw new Error("Clipboard API unavailable");
    const text=await navigator.clipboard.readText();
    if(!text.trim()){
      showToast("クリップボードに文字がありません。");
      return;
    }
    const current=els.lyricsInput.value.trim();
    if(current&&!confirm("今の歌詞をクリップボードの内容で置き換えますか？"))return;
    els.lyricsInput.value=text.trim();
    delete els.lyricsInput.dataset.lrclibId;
    els.lyricsInput.dataset.lyricsSource="Google等から手動コピー";
    els.lyricsInputHint.textContent=hasLrc(text)
      ?"時間付き歌詞を貼り付けました。同期歌詞として保存できます。"
      :"歌詞を貼り付けました。必要なら後で手動同期できます。";
    showToast("クリップボードから歌詞を貼り付けました。");
  }catch(err){
    console.warn("Clipboard read failed:",err);
    showToast("自動貼り付けが許可されませんでした。歌詞欄でCtrl+Vしてください。");
  }
}
function focusLyricsAfterGoogle(){
  let awaiting=false;
  try{awaiting=sessionStorage.getItem("lyrictube.awaitingLyricsPaste")==="1"}catch{}
  if(!awaiting||!els.songDialog.open)return;
  try{sessionStorage.removeItem("lyrictube.awaitingLyricsPaste")}catch{}
  setTimeout(()=>{
    els.lyricsInput.focus();
    els.lyricsInput.scrollIntoView({block:"center",behavior:"smooth"});
    showToast("コピーした歌詞をCtrl+V、または「クリップボードから貼り付け」で入れられます。");
  },120);
}

function renderLyricsSearchResults(){
  els.lyricsSearchResults.innerHTML="";
  if(!pendingLyricsResults.length){
    els.lyricsSearchResults.innerHTML='<p class="muted">一致する歌詞が見つかりませんでした。Google歌詞検索も利用できます。</p>';
    return;
  }

  pendingLyricsResults.slice(0,20).forEach((item,index)=>{
    const card=document.createElement("div");
    card.className="result-item";

    const top=document.createElement("div");
    top.className="result-top";
    const strong=document.createElement("strong");
    strong.textContent=item.trackName||"無題";
    const ar=document.createElement("span");
    ar.className="muted small";
    ar.textContent=item.artistName||"";
    top.append(strong,ar);

    const badges=document.createElement("div");
    badges.className="result-badges";
    for(const [text,good] of [
      [item.albumName||"アルバム不明",false],
      [item.duration?formatTime(item.duration).slice(0,5):"時間不明",false],
      [item.syncedLyrics?"時間付き":"通常歌詞",Boolean(item.syncedLyrics)],
      [item._matchSource?`検索: ${item._matchSource}`:"",false]
    ].filter(([text])=>text)){
      const sp=document.createElement("span");
      sp.className=`mini-badge${good?" good":""}`;
      sp.textContent=text;
      badges.appendChild(sp);
    }

    const actions=document.createElement("div");
    actions.className="result-actions";

    const useBtn=document.createElement("button");
    useBtn.type="button";
    useBtn.className="use-lyrics-btn";
    useBtn.textContent="この歌詞を使う";
    useBtn.addEventListener("click",()=>chooseLyrics(index));

    const copyBtn=document.createElement("button");
    copyBtn.type="button";
    copyBtn.textContent="歌詞をコピー";
    copyBtn.addEventListener("click",()=>copyLyricsResult(index));

    actions.append(useBtn,copyBtn);

    const details=document.createElement("details");
    details.className="lyrics-preview-details";
    const summary=document.createElement("summary");
    summary.textContent="歌詞を表示・手動で選択";
    const pre=document.createElement("pre");
    pre.className="lyrics-preview-text";
    pre.textContent=lyricTextForCopy(item)||"表示できる歌詞がありません。";
    details.append(summary,pre);

    card.append(top,badges,actions,details);
    els.lyricsSearchResults.appendChild(card);
  });
}
function chooseLyrics(index){
  const item=pendingLyricsResults[index];
  if(!item)return;
  els.lyricsInput.value=item.syncedLyrics||item.plainLyrics||"";
  els.lyricsInput.dataset.lrclibId=item.id||"";
  els.lyricsInput.dataset.lyricsSource=`LRCLIB: ${item.trackName||""} / ${item.artistName||""}`;
  closeLyricsResultsAndReturn();
  setTimeout(()=>showToast(item.syncedLyrics?"時間付き歌詞を選択しました。":"通常歌詞を選択しました。"),80);
}
function findRegisteredVideo(videoId,{excludeSongId="",excludeVersionId=""}={}){
  const target=String(videoId||"").trim();
  if(!target)return null;
  for(const song of library.songs||[]){
    for(const version of song.versions||[]){
      if(String(version.videoId||"")!==target)continue;
      if(song.id===excludeSongId&&version.id===excludeVersionId)continue;
      return {song,version};
    }
  }
  return null;
}
function duplicateVideoNotice(duplicate){
  if(!duplicate)return "この動画はすでに登録されています。";
  const songTitle=duplicate.song?.title||"無題";
  const version=duplicate.version||{};
  const typeLabel=typeName(version.type)||"動画";
  const label=String(version.label||"").trim();
  return `この動画はすでに「${songTitle}」の${label?`「${label}」`:`${typeLabel}`}として登録されています。`;
}
function blockDuplicateVideo(videoId,options={}){
  const duplicate=findRegisteredVideo(videoId,options);
  if(!duplicate)return false;
  const message=duplicateVideoNotice(duplicate);
  showToast("この動画はすでに登録されています。");
  alert(message);
  return true;
}
function saveSongForm(){
  const editing=els.editingSongId.value;
  const old=library.songs.find(s=>s.id===editing);
  const raw=els.lyricsInput.value.trim();
  const title=els.trackTitle.value.trim();

  if(!title){
    showToast("原曲名を入力してください。");
    return;
  }

  const rawHasLrc=Boolean(raw&&hasLrc(raw));
  const newPlain=raw
    ? (rawHasLrc?plainFromLrc(raw):raw)
    : "";

  let song;
  let syncUpdateInfo={shared:false,versions:0};

  if(old){
    const oldPlain=old.plainLyrics||plainFromLrc(old.syncedLyrics||"")||"";

    song={
      ...old,
      title,
      artist:els.artistName.value.trim(),
      plainLyrics:newPlain,
      lyricsSource:els.lyricsInput.dataset.lyricsSource||(raw?"手動入力":""),
      lrclibId:els.lyricsInput.dataset.lrclibId||"",
      updatedAt:nowIso()
    };

    if(rawHasLrc){
      // User supplied new timestamps explicitly, so prefer them for shared lyrics.
      song.syncedLyrics=raw;

      // Video-specific timing still keeps its own timestamps,
      // but receives the newly edited text.
      for(const version of song.versions||[]){
        if(version.customSyncedLyrics){
          version.customSyncedLyrics=rebaseLrcTextKeepingTimes(
            version.customSyncedLyrics,
            oldPlain,
            newPlain
          );
          version.updatedAt=nowIso();
          syncUpdateInfo.versions++;
        }
      }
    }else if(newPlain){
      // Plain-text edit after timing:
      // retain every existing timestamp and update only lyric text.
      syncUpdateInfo=applyEditedLyricsToExistingSync(song,oldPlain,newPlain);
    }else{
      // Lyrics were intentionally cleared.
      song.syncedLyrics="";
      for(const version of song.versions||[]){
        version.customSyncedLyrics="";
        version.updatedAt=nowIso();
      }
    }
  }else{
    const url=els.youtubeUrl.value.trim();
    const videoId=extractVideoId(url);
    if(!videoId){
      showToast("正しいYouTube URLを入力してください。");
      return;
    }
    if(blockDuplicateVideo(videoId))return;


    const v=makeVersion({
      youtubeUrl:url,
      videoId,
      type:els.initialVersionType.value,
      performer:els.initialPerformer.value.trim(),
      rawYoutubeTitle:els.youtubeUrl.dataset.rawTitle||"",
      rawYoutubeAuthor:els.youtubeUrl.dataset.performer||""
    });

    song={
      id:uid(),
      title,
      artist:els.artistName.value.trim(),
      plainLyrics:newPlain,
      syncedLyrics:rawHasLrc?raw:"",
      lyricsSource:els.lyricsInput.dataset.lyricsSource||(raw?"手動入力":""),
      lrclibId:els.lyricsInput.dataset.lrclibId||"",
      favorite:false,
      playCount:0,
      lastPlayedAt:null,
      versions:[v],
      createdAt:nowIso(),
      updatedAt:nowIso()
    };
  }

  if(old){
    library.songs=library.songs.map(s=>s.id===old.id?song:s);
  }else{
    library.songs.unshift(song);
  }

  persistLibrary();
  selectedSongId=song.id;
  if(!old)selectedVersionId=song.versions[0].id;

  els.songDialog.close();
  renderAll();
  if(!old)loadSelectedVideo(false);

  if(old&&(syncUpdateInfo.shared||syncUpdateInfo.versions)){
    const targets=[
      syncUpdateInfo.shared?"原曲の同期時間":"",
      syncUpdateInfo.versions?`${syncUpdateInfo.versions}個の動画専用同期`:""
    ].filter(Boolean).join("・");
    showToast(`歌詞を更新しました。${targets}はそのまま維持しています。`);
  }else{
    showToast(old?"曲情報を更新しました。":"曲を追加しました。");
  }
}
function deleteSong(){const s=getSong();if(!s)return;if(!confirm(`「${s.title}」を削除しますか？`))return;library.songs=library.songs.filter(x=>x.id!==s.id);library.playlists.forEach(p=>p.songIds=p.songIds.filter(id=>id!==s.id));selectedSongId=library.songs[0]?.id||null;selectedVersionId=library.songs[0]?.versions[0]?.id||null;persistLibrary();renderAll();if(selectedSongId)loadSelectedVideo(false);else try{ytPlayer?.stopVideo?.()}catch{}showToast("曲を削除しました。")}

function getPlaylistTargetSong(){
  return playlistTargetSongId
    ? library.songs.find(s=>s.id===playlistTargetSongId)||null
    : null;
}
function openPlaylistDialog(targetSongId=selectedSongId){
  leaveLyricsFullscreenForDialog();

  // This is intentionally separate from selectedSongId.
  // Opening the playlist dialog from another library row must never change playback.
  playlistTargetSongId=targetSongId||null;

  const target=getPlaylistTargetSong();
  const playing=getSong();

  els.newPlaylistName.value="";
  els.playlistDialogHint.replaceChildren();

  if(target){
    const sameAsPlaying=playing?.id===target.id;

    if(sameAsPlaying){
      els.playlistDialogHint.textContent=`「${target.title}」を入れるプレイリストを選べます。`;
    }else{
      const line1=document.createTextNode(`「${target.title}」をプレイリストへ追加します。`);
      const br=document.createElement("br");
      const strong=document.createElement("strong");
      strong.textContent=`現在再生中の「${playing?.title||"曲"}」は切り替わりません。`;
      els.playlistDialogHint.append(line1,br,strong);
    }
  }else{
    els.playlistDialogHint.textContent="プレイリストの作成・削除ができます。";
  }

  renderPlaylistManager();
  els.playlistDialog.showModal();
}
function renderPlaylistManager(){
  const target=getPlaylistTargetSong();
  els.playlistManageList.innerHTML="";

  if(!library.playlists.length){
    els.playlistManageList.innerHTML='<p class="muted">プレイリストはまだありません。上で作成すると、選んだ曲をそのまま追加できます。</p>';
    return;
  }

  for(const p of library.playlists){
    const row=document.createElement("div");
    row.className="playlist-manage-row";

    const chk=document.createElement("input");
    chk.type="checkbox";
    chk.disabled=!target;
    chk.checked=Boolean(target&&p.songIds.includes(target.id));
    chk.addEventListener("change",()=>{
      if(!target)return;
      p.songIds=chk.checked
        ? [...new Set([...p.songIds,target.id])]
        : p.songIds.filter(id=>id!==target.id);
      persistLibrary();
      renderPlaylists();

      // Only refresh list contents; never alter selectedSongId / selectedVersionId / player.
      if(currentView.type==="playlist")renderLibrary();

      showToast(chk.checked
        ? `「${target.title}」を「${p.name}」に追加しました。`
        : `「${target.title}」を「${p.name}」から外しました。`);
    });

    const label=document.createElement("label");
    const name=document.createElement("span");
    name.textContent=`${p.name} (${p.songIds.length}曲)`;
    label.append(chk,name);

    const spacer=document.createElement("span");

    const del=document.createElement("button");
    del.type="button";
    del.className="playlist-delete";
    del.textContent="削除";
    del.addEventListener("click",()=>{
      if(!confirm(`プレイリスト「${p.name}」を削除しますか？ 曲自体は消えません。`))return;
      library.playlists=library.playlists.filter(x=>x.id!==p.id);
      if(currentView.playlistId===p.id)currentView={type:"all",playlistId:null};
      persistLibrary();
      renderPlaylistManager();
      renderAll();
    });

    row.append(label,spacer,del);
    els.playlistManageList.appendChild(row);
  }
}
function createPlaylist(){
  const name=els.newPlaylistName.value.trim();
  if(!name)return showToast("プレイリスト名を入力してください。");
  if(library.playlists.some(p=>normalizeText(p.name)===normalizeText(name)))return showToast("同じ名前のプレイリストがあります。");

  const target=getPlaylistTargetSong();
  const p={
    id:uid(),
    name,
    songIds:target?[target.id]:[],
    createdAt:nowIso()
  };

  library.playlists.push(p);
  persistLibrary();
  els.newPlaylistName.value="";
  renderPlaylistManager();
  renderPlaylists();

  showToast(target
    ? `「${target.title}」を入れたプレイリスト「${name}」を作成しました。`
    : `プレイリスト「${name}」を作成しました。`);
}

function stripJsonBom(text=""){
  return String(text).replace(/^\uFEFF/,"").trim();
}
function looksLikeLegacySong(song){
  return Boolean(
    song &&
    typeof song==="object" &&
    ("youtubeUrl" in song || "videoId" in song) &&
    !Array.isArray(song.versions)
  );
}
function migrateLegacySongs(rawSongs){
  const songs=Array.isArray(rawSongs)?rawSongs:[];
  const out=defaultLibrary();

  out.songs=songs.filter(Boolean).map(s=>{
    const videoId=s.videoId||extractVideoId(s.youtubeUrl||"");
    const v=makeVersion({
      youtubeUrl:s.youtubeUrl||"",
      videoId,
      type:s.type||"original",
      performer:s.performer||s.artist||"",
      label:s.label||"",
      rawYoutubeTitle:s.rawYoutubeTitle||"",
      rawYoutubeAuthor:s.rawYoutubeAuthor||""
    });

    // v01/v02 used opposite offset semantics compared with v03+.
    v.lyricsOffset=-(Number(s.lyricsOffset)||0);
    v.startTime=Number(s.startTime)||0;
    v.endTime=s.endTime===null||s.endTime===undefined?null:Number(s.endTime);
    v.customSyncedLyrics=s.customSyncedLyrics||"";

    return{
      id:s.id||uid(),
      title:s.title||"無題",
      artist:s.artist||"",
      plainLyrics:s.plainLyrics||plainFromLrc(s.syncedLyrics||"")||"",
      syncedLyrics:s.syncedLyrics||"",
      lyricsSource:s.lyricsSource||"",
      lrclibId:s.lrclibId||"",
      favorite:Boolean(s.favorite),
      playCount:Number(s.playCount)||0,
      lastPlayedAt:s.lastPlayedAt||null,
      versions:[v],
      createdAt:s.createdAt||nowIso(),
      updatedAt:s.updatedAt||nowIso()
    };
  });

  return out;
}
function detectImportFormat(data){
  if(Array.isArray(data)){
    return{
      kind:"legacy-array",
      label:"v01/v02旧形式（曲配列）",
      library:migrateLegacySongs(data)
    };
  }

  if(!data||typeof data!=="object"){
    throw new Error("JSONの中身がライブラリ形式ではありません。");
  }

  // Some backup tools wrap the actual library in "library".
  if(data.library&&typeof data.library==="object"){
    const nested=detectImportFormat(data.library);
    return{...nested,label:`ラップ形式 → ${nested.label}`};
  }

  // v01/v02 export:
  // { version: 1, exportedAt: "...", songs: [old song objects] }
  if(Array.isArray(data.songs) && (
    data.version===1 ||
    data.songs.some(looksLikeLegacySong)
  )){
    return{
      kind:"legacy-object",
      label:"v01/v02バックアップ",
      library:migrateLegacySongs(data.songs)
    };
  }

  // v03+ library format.
  if(Array.isArray(data.songs)){
    return{
      kind:"library",
      label:`v03以降ライブラリ${data.version?` (data v${data.version})`:""}`,
      library:normalizeLibrary(data)
    };
  }

  throw new Error("songs配列が見つかりません。LyricTubeのJSONか確認してください。");
}
function validateImportedLibrary(incoming){
  if(!incoming||!Array.isArray(incoming.songs)){
    throw new Error("曲データを読み取れませんでした。");
  }

  const validSongs=incoming.songs.filter(song=>
    song &&
    typeof song==="object" &&
    typeof song.title==="string" &&
    Array.isArray(song.versions)
  );

  if(incoming.songs.length && !validSongs.length){
    throw new Error("曲は見つかりましたが、動画データへ変換できませんでした。");
  }

  // Remove completely broken empty video entries, but keep songs that have lyrics only.
  for(const song of validSongs){
    song.versions=(song.versions||[]).filter(v=>
      v && typeof v==="object" && (v.videoId || v.youtubeUrl)
    );
  }

  incoming.songs=validSongs;
  return incoming;
}

function exportLibrary(){const blob=new Blob([JSON.stringify({...library,exportedAt:nowIso()},null,2)],{type:"application/json"});const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`lyrictube_v14_${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url)}
async function importLibrary(file){
  try{
    const rawText=stripJsonBom(await file.text());
    if(!rawText){
      throw new Error("ファイルが空です。");
    }

    let data;
    try{
      data=JSON.parse(rawText);
    }catch{
      throw new Error("JSONとして読み取れませんでした。");
    }

    const detected=detectImportFormat(data);
    const incoming=validateImportedLibrary(detected.library);

    if(!incoming.songs.length){
      throw new Error(`${detected.label}として読み取りましたが、曲が0件でした。`);
    }

    const videoCount=incoming.songs.reduce((sum,s)=>sum+(s.versions?.length||0),0);
    const message=[
      `形式: ${detected.label}`,
      `曲数: ${incoming.songs.length}曲`,
      `動画数: ${videoCount}本`,
      "",
      "現在のライブラリを置き換えて読み込みますか？"
    ].join("\n");

    if(!confirm(message))return;

    library=incoming;
    selectedSongId=library.songs[0]?.id||null;
    selectedVersionId=library.songs[0]?.versions?.[0]?.id||null;
    currentView={type:"all",playlistId:null};

    persistLibrary();
    applyTheme();
    applyLyricsFontSize();
    applyUiSettings();
    toggleBottomPlayer();
    toggleSpotlight();
    renderAll();

    if(selectedSongId&&selectedVersionId){
      loadSelectedVideo(false);
    }else{
      try{ytPlayer?.stopVideo?.()}catch{}
    }

    showToast(`${detected.label}から ${library.songs.length}曲を読み込みました。`);
  }catch(err){
    console.error("Library import failed:",err);
    showToast(`読み込み失敗: ${err?.message||"不明なエラー"}`);
  }
}

// ---- Favorite ----
function toggleFavorite(){
  const s=getSong();
  if(!s)return;
  s.favorite=!s.favorite;
  s.updatedAt=nowIso();
  persistLibrary();
  renderViewNav();
  renderSelectedSong();
  if(currentView.type==="favorites")renderLibrary();
  showToast(s.favorite?"お気に入りに追加しました。":"お気に入りから外しました。");
}

// ---- Version add / edit / delete ----
function openVersionDialog(version=null){
  leaveLyricsFullscreenForDialog();
  const song=getSong();
  if(!song)return;
  els.versionForm.reset();
  delete els.versionYoutubeUrl.dataset.rawTitle;
  delete els.versionYoutubeUrl.dataset.performer;
  els.editingVersionId.value=version?.id||"";
  els.versionDialogTitle.textContent=version?"動画バージョンを編集":"動画バージョンを追加";
  els.deleteVersionBtn.style.display=version?"":"none";
  if(version){
    els.versionYoutubeUrl.value=version.youtubeUrl||(version.videoId?`https://www.youtube.com/watch?v=${version.videoId}`:"");
    els.versionType.value=version.type||"original";
    els.versionLabel.value=version.label||"";
    els.versionPerformer.value=version.performer||"";
    if(version.rawYoutubeTitle)els.versionYoutubeUrl.dataset.rawTitle=version.rawYoutubeTitle;
    if(version.rawYoutubeAuthor)els.versionYoutubeUrl.dataset.performer=version.rawYoutubeAuthor;
  }
  els.versionDialog.showModal();
}
function saveVersionForm(){
  const song=getSong();
  if(!song)return;
  const url=els.versionYoutubeUrl.value.trim();
  const videoId=extractVideoId(url);
  if(!videoId){
    showToast("正しいYouTube URLを入力してください。");
    return;
  }

  const editing=els.editingVersionId.value;
  if(blockDuplicateVideo(videoId,{excludeSongId:song.id,excludeVersionId:editing}))return;
  const old=song.versions.find(v=>v.id===editing);
  let toastMessage="";

  if(old){
    const videoChanged=old.videoId!==videoId;
    Object.assign(old,{
      youtubeUrl:url,
      videoId,
      type:els.versionType.value,
      label:els.versionLabel.value.trim(),
      performer:els.versionPerformer.value.trim(),
      rawYoutubeTitle:els.versionYoutubeUrl.dataset.rawTitle||old.rawYoutubeTitle||"",
      rawYoutubeAuthor:els.versionYoutubeUrl.dataset.performer||old.rawYoutubeAuthor||"",
      updatedAt:nowIso()
    });
    if(videoChanged){
      // 別動画へ差し替えた場合、旧動画の開始/終了/スキップ/同期は意味をなさないためリセットする。
      old.startTime=0;
      old.endTime=null;
      old.lyricsOffset=0;
      old.skipSegments=[];
      old.customSyncedLyrics="";
      toastMessage="動画を差し替えました。開始/終了/スキップ/動画専用同期はリセットされています。";
    }else{
      toastMessage="動画バージョンを更新しました。";
    }
    selectedVersionId=old.id;
  }else{
    const v=makeVersion({
      youtubeUrl:url,
      videoId,
      type:els.versionType.value,
      performer:els.versionPerformer.value.trim(),
      label:els.versionLabel.value.trim(),
      rawYoutubeTitle:els.versionYoutubeUrl.dataset.rawTitle||"",
      rawYoutubeAuthor:els.versionYoutubeUrl.dataset.performer||""
    });
    song.versions.push(v);
    selectedVersionId=v.id;
    toastMessage="動画バージョンを追加しました。";
  }

  song.updatedAt=nowIso();
  persistLibrary();
  els.versionDialog.close();
  renderAll();
  loadSelectedVideo(false);
  showToast(toastMessage);
}
function deleteVersion(){
  const song=getSong();
  const id=els.editingVersionId.value;
  const v=song?.versions.find(x=>x.id===id);
  if(!song||!v)return;

  if(song.versions.length<=1){
    if(!confirm(`「${song.title}」の最後の動画です。削除すると曲ごと削除されます。よろしいですか？`))return;
    library.songs=library.songs.filter(x=>x.id!==song.id);
    library.playlists.forEach(p=>p.songIds=p.songIds.filter(sid=>sid!==song.id));
    selectedSongId=library.songs[0]?.id||null;
    selectedVersionId=library.songs[0]?.versions[0]?.id||null;
    persistLibrary();
    els.versionDialog.close();
    renderAll();
    if(selectedSongId)loadSelectedVideo(false);
    else try{ytPlayer?.stopVideo?.()}catch{}
    showToast("曲を削除しました。");
    return;
  }

  if(!confirm(`動画「${versionDisplayName(v)}」を削除しますか？\nこの動画の開始/終了/スキップ/同期設定も消えます。`))return;
  song.versions=song.versions.filter(x=>x.id!==id);
  if(selectedVersionId===id)selectedVersionId=song.versions[0]?.id||null;
  song.updatedAt=nowIso();
  persistLibrary();
  els.versionDialog.close();
  renderAll();
  loadSelectedVideo(false);
  showToast("動画バージョンを削除しました。");
}

// ---- Play range / skip segments ----
function setRange(kind){
  const v=getVersion();
  if(!v)return;
  if(!ytPlayer?.getCurrentTime)return showToast("動画を再生してから押してください。");
  const t=currentPlayerTime();
  if(kind==="start"){
    v.startTime=Math.max(0,t);
    if(v.endTime!==null&&Number(v.endTime)<=v.startTime)v.endTime=null;
    showToast(`曲開始を ${formatTime(v.startTime)} に設定しました。`);
  }else{
    if(t<=Number(v.startTime||0))return showToast("曲開始より後ろの位置で押してください。");
    v.endTime=t;
    showToast(`曲終了を ${formatTime(v.endTime)} に設定しました。`);
  }
  v.updatedAt=nowIso();
  persistLibrary();
  renderVersionControls(v);
}
function resetRange(){
  const v=getVersion();
  if(!v)return;
  v.startTime=0;
  v.endTime=null;
  v.updatedAt=nowIso();
  persistLibrary();
  renderVersionControls(v);
  showToast("再生範囲をリセットしました。");
}
function markSkipStart(){
  const v=getVersion();
  if(!v)return;
  if(!ytPlayer?.getCurrentTime)return showToast("動画を再生してから押してください。");
  pendingSkipStart=currentPlayerTime();
  els.pendingSkipLabel.textContent=`開始 ${formatTime(pendingSkipStart)} を記録中 → 会話が終わった位置で「ここまでをスキップ」`;
  els.markSkipEndBtn.disabled=false;
}
function markSkipEnd(){
  const v=getVersion();
  if(!v||pendingSkipStart===null)return;
  const end=currentPlayerTime();
  const start=Math.min(pendingSkipStart,end);
  const stop=Math.max(pendingSkipStart,end);
  if(stop-start<0.5){
    showToast("スキップ区間が短すぎます。0.5秒以上あけてください。");
    return;
  }
  v.skipSegments.push({id:uid(),start,end:stop,label:"",enabled:true});
  v.updatedAt=nowIso();
  pendingSkipStart=null;
  els.pendingSkipLabel.textContent="";
  els.markSkipEndBtn.disabled=true;
  persistLibrary();
  renderSkipList(v);
  showToast(`スキップ区間を追加しました（${formatTime(start)} → ${formatTime(stop)}）。`);
}

// ---- Lyrics offset ----
function updateOffset(delta){
  const v=getVersion();
  if(!v)return;
  let next=delta===null?Number.parseFloat(els.offsetInput.value):Number(v.lyricsOffset||0)+delta;
  if(!Number.isFinite(next))next=0;
  next=Math.round(clamp(next,-30,30)*10)/10;
  v.lyricsOffset=next;
  v.updatedAt=nowIso();
  els.offsetInput.value=next.toFixed(1);
  persistLibrary();
  activeLyricIndex=-1;
  updateLyricHighlight();
}

// ---- Sync editor (per-version lyric timing) ----
function getPlayerDuration(){try{return Number(ytPlayer?.getDuration?.())||0}catch{return 0}}
function syncRelativeSeconds(videoSec){
  const v=getVersion();
  return Math.max(0,Number(videoSec||0)-Number(v?.startTime||0)-Number(v?.lyricsOffset||0));
}
function seekSyncPlayer(sec){
  if(!ytPlayer?.seekTo)return;
  const dur=getPlayerDuration();
  const target=dur>0?clamp(Number(sec)||0,0,dur):Math.max(0,Number(sec)||0);
  try{ytPlayer.seekTo(target,true)}catch{}
}
function nudgeSyncPlayer(delta){seekSyncPlayer(currentPlayerTime()+delta)}
function toggleSyncPlayback(){
  if(!ytPlayer?.getPlayerState)return;
  try{
    if(ytPlayer.getPlayerState()===1)ytPlayer.pauseVideo();
    else ytPlayer.playVideo();
  }catch{}
  updateSyncTransport();
}
function updateSyncTransport(){
  if(!els.syncDialog?.open)return;
  const t=currentPlayerTime();
  const dur=getPlayerDuration();
  els.syncVideoTime.textContent=formatTime(t);
  els.syncVideoDuration.textContent=dur>0?formatTime(dur):"--:--.--";
  els.syncRelativeTime.textContent=formatTime(syncRelativeSeconds(t));
  if(dur>0){
    els.syncSeekBar.max=dur;
    if(!syncSeekDragging)els.syncSeekBar.value=t;
  }
  let state=-1;
  try{state=ytPlayer?.getPlayerState?.()??-1}catch{}
  els.syncPlayPauseBtn.textContent=state===1?"一時停止":"再生";
}
function pushSyncUndo(entry){
  syncUndoStack.push(entry);
  if(syncUndoStack.length>200)syncUndoStack.shift();
  updateSyncUndoButton();
}
function updateSyncUndoButton(){els.syncUndoBtn.disabled=!syncUndoStack.length}
function undoSyncChange(){
  const last=syncUndoStack.pop();
  if(!last)return;

  if(last.type==="all"){
    last.prevTimes.forEach((t,i)=>{if(syncDraft[i])syncDraft[i].time=t});
  }else if(last.type==="insert"){
    if(syncDraft[last.index])syncDraft.splice(last.index,1);
  }else if(last.type==="remove"){
    syncDraft.splice(last.index,0,{...last.line});
  }else if(syncDraft[last.index]){
    syncDraft[last.index].time=last.prevTime;
  }

  renderSyncEditor();
  updateSyncUndoButton();
  showToast("直前の変更を戻しました。");
}
function findInterludeInsertIndex(atTime){
  const at=Math.max(0,Number(atTime)||0);

  // Prefer a lyric that already has a later assigned time.
  // This makes insertion work naturally even when following lines are still 0.
  for(let i=0;i<syncDraft.length;i++){
    const line=syncDraft[i];
    if(isSyncMarkerText(line.text))continue;
    const t=Number(line.time)||0;
    if(t>0&&t>at)return i;
  }

  // Otherwise place after the last already-timed lyric at/before current time.
  let lastTimed=-1;
  for(let i=0;i<syncDraft.length;i++){
    const line=syncDraft[i];
    if(isSyncMarkerText(line.text))continue;
    const t=Number(line.time)||0;
    if(t>0&&t<=at)lastTimed=i;
  }
  if(lastTimed>=0)return lastTimed+1;

  // With no timing information yet there is no reliable textual position.
  // Append rather than guessing between Google-imported lines.
  return syncDraft.length;
}
function setSelectedSyncLine(index,{scroll=false}={}){
  syncSelectedIndex=clamp(Number(index)||0,0,Math.max(0,syncDraft.length-1));
  document.querySelectorAll(".sync-editor-row").forEach((row,i)=>{row.classList.toggle("selected",i===syncSelectedIndex)});
  if(scroll){
    const target=document.querySelector(`.sync-editor-row[data-index="${syncSelectedIndex}"]`);
    target?.scrollIntoView({block:"nearest",behavior:"smooth"});
  }
}
function stampSyncLine(index){
  const line=syncDraft[index];
  if(!line)return;
  pushSyncUndo({type:"line",index,prevTime:line.time});
  line.time=syncRelativeSeconds(currentPlayerTime());
  renderSyncEditor();
  setSelectedSyncLine(index,{scroll:true});
  showToast(`${index+1}行目を ${formatTime(line.time)} に設定しました。`);
}
function nudgeSyncLine(index,deltaSec){
  const line=syncDraft[index];
  if(!line)return;
  const scrollTop=els.syncEditorList.scrollTop;
  pushSyncUndo({type:"line",index,prevTime:Number(line.time)||0});
  line.time=Math.max(0,(Number(line.time)||0)+deltaSec);
  syncSelectedIndex=index;
  renderSyncEditor();
  requestAnimationFrame(()=>{
    els.syncEditorList.scrollTop=scrollTop;
    const row=els.syncEditorList.querySelector(`.sync-editor-row[data-index="${index}"]`);
    row?.classList.add("changed","line-adjusted");
  });
  updateSyncUndoButton();
  showToast(`この行だけ ${deltaSec>0?"+":""}${deltaSec.toFixed(1)}秒。動画位置は動きません。`);
}
function makeSyncLineNudgeButton(index,delta){
  const btn=document.createElement("button");
  btn.type="button";
  btn.className="sync-line-nudge-btn";
  btn.textContent=`${delta>0?"+":""}${delta.toFixed(1)}`;
  btn.title=`この歌詞行の保存時間だけ ${delta>0?"+":""}${delta.toFixed(1)}秒変更（動画は動きません）`;
  btn.addEventListener("click",e=>{
    e.stopPropagation();
    setSelectedSyncLine(index);
    nudgeSyncLine(index,delta);
  });
  return btn;
}
function addInterludeMarker(){
  if(!els.syncDialog.open||!syncDraft.length)return;
  const at=syncRelativeSeconds(currentPlayerTime());

  const duplicate=syncDraft.some(line=>
    isSyncMarkerText(line.text)&&Math.abs((Number(line.time)||0)-at)<0.25
  );
  if(duplicate){
    showToast("この時間付近にはすでに ♪ があります。");
    return;
  }

  const index=findInterludeInsertIndex(at);
  pushSyncUndo({type:"insert",index});
  syncDraft.splice(index,0,{time:at,text:"♪"});
  renderSyncEditor();

  requestAnimationFrame(()=>{
    els.syncEditorList
      .querySelector(`.sync-editor-row[data-index="${index}"]`)
      ?.scrollIntoView({block:"center",behavior:"smooth"});
  });

  showToast(`♪ を ${formatTime(at)} に追加しました。`);
}
function removeInterludeMarker(index){
  const line=syncDraft[index];
  if(!line||!isSyncMarkerText(line.text))return;
  pushSyncUndo({type:"remove",index,line:{...line}});
  syncDraft.splice(index,1);
  renderSyncEditor();
  showToast("♪ を削除しました。");
}

function renderSyncEditor(){
  els.syncEditorList.innerHTML="";
  syncDraft.forEach((line,index)=>{
    const marker=isSyncMarkerText(line.text);
    const row=document.createElement("div");
    row.className=`sync-editor-row${marker?" interlude":""}${index===syncSelectedIndex?" selected":""}`;
    row.dataset.index=index;
    row.addEventListener("click",()=>setSelectedSyncLine(index));

    const timeInput=document.createElement("input");
    timeInput.type="text";
    timeInput.value=formatTime(line.time);
    timeInput.setAttribute("aria-label",`${index+1}行目の時間`);
    timeInput.addEventListener("focus",()=>setSelectedSyncLine(index));
    timeInput.addEventListener("change",()=>{
      const next=parseTimecode(timeInput.value);
      pushSyncUndo({type:"line",index,prevTime:line.time});
      line.time=next;
      timeInput.value=formatTime(next);
      row.classList.add("changed");
      setSelectedSyncLine(index);
    });

    const text=document.createElement("div");
    text.className="sync-editor-text";
    text.textContent=line.text;

    const actions=document.createElement("div");
    actions.className="sync-row-actions";

    const stamp=document.createElement("button");
    stamp.type="button";
    stamp.className="stamp-btn";
    stamp.textContent=index===syncSelectedIndex?"今の時間を入れる（選択中）":"今の時間";
    stamp.title=marker
      ?"動画の現在位置をこの ♪ の時間に設定"
      :"動画の現在位置をこの行の時間に設定（押し直せば上書き）";
    stamp.addEventListener("click",e=>{
      e.stopPropagation();
      setSelectedSyncLine(index);
      stampSyncLine(index);
    });

    const go=document.createElement("button");
    go.type="button";
    go.className="sync-seek-line-btn";
    go.textContent="この時間へ";
    go.title="この行の時間へ動画を移動";
    go.addEventListener("click",e=>{
      e.stopPropagation();
      setSelectedSyncLine(index);
      const v=getVersion();
      seekSyncPlayer(Number(v?.startTime||0)+line.time+Number(v?.lyricsOffset||0));
    });

    actions.append(stamp,go);

    const lineNudge=document.createElement("div");
    lineNudge.className="sync-line-nudge";
    const lineLabel=document.createElement("span");
    lineLabel.className="sync-line-nudge-label";
    lineLabel.textContent="この行だけ";
    lineNudge.append(
      lineLabel,
      makeSyncLineNudgeButton(index,-0.5),
      makeSyncLineNudgeButton(index,-0.1),
      makeSyncLineNudgeButton(index,0.1),
      makeSyncLineNudgeButton(index,0.5)
    );
    actions.appendChild(lineNudge);

    if(marker){
      const del=document.createElement("button");
      del.type="button";
      del.className="sync-delete-marker-btn";
      del.textContent="♪を削除";
      del.title="この間奏マーカーだけ削除";
      del.addEventListener("click",e=>{e.stopPropagation();removeInterludeMarker(index)});
      actions.appendChild(del);
    }

    row.append(timeInput,text,actions);
    els.syncEditorList.appendChild(row);
  });
}
function nudgeAllSyncTimes(deltaSec){
  if(!syncDraft.length)return;
  pushSyncUndo({type:"all",prevTimes:syncDraft.map(line=>Number(line.time)||0)});
  syncDraft.forEach(line=>{
    if(line.time!==null&&line.time!==undefined){
      line.time=Math.max(0,(Number(line.time)||0)+deltaSec);
    }
  });
  renderSyncEditor();
  updateSyncTransport();
  updateSyncUndoButton();
  showToast(`全行を ${deltaSec>0?"+":""}${deltaSec.toFixed(1)}秒補正しました。動画位置は動きません。`);
}
function openSyncEditor(){
  const song=getSong(),v=getVersion(song);
  if(!song||!v)return;
  leaveLyricsFullscreenForDialog();
  const synced=parseLrc(effectiveLrc(song,v));
  const source=synced.length
    ? synced
    : lyricTextLines(song.plainLyrics).map(text=>({time:0,text}));
  if(!source.length){
    showToast("先に曲情報から歌詞を登録してください。");
    return;
  }
  syncDraft=source.map(line=>({time:Number(line.time)||0,text:line.text}));
  syncUndoStack=[];
  syncSelectedIndex=0;
  renderSyncEditor();
  setSelectedSyncLine(0);
  updateSyncUndoButton();
  els.syncDialog.showModal();
  updateSyncTransport();
  seekSyncPlayer(Number(v.startTime)||0);
}
function resetSyncDraft(){
  if(!syncDraft.length)return;
  if(!confirm("全行の時間を0にしますか？\n「直前の変更を戻す」で元に戻せます。"))return;
  pushSyncUndo({type:"all",prevTimes:syncDraft.map(l=>l.time)});
  syncDraft.forEach(line=>line.time=0);
  renderSyncEditor();
  showToast("全行の時間を0にしました。");
}
function saveSyncDraft(){
  const v=getVersion();
  if(!v||!syncDraft.length)return;
  const lrc=syncDraft
    .map(l=>`[${formatTime(Math.max(0,Number(l.time)||0))}]${l.text}`)
    .join("\n");
  v.customSyncedLyrics=lrc;
  v.updatedAt=nowIso();
  persistLibrary();
  els.syncDialog.close();
  renderSelectedSong();
  showToast("この動画専用の歌詞時間を保存しました。");
}
function useSharedSync(){
  const v=getVersion();
  if(!v)return;
  v.customSyncedLyrics="";
  v.updatedAt=nowIso();
  persistLibrary();
  els.syncDialog.close();
  renderSelectedSong();
  showToast("原曲の同期時間に戻しました。");
}

// Events
try{
  bootstrapCore();
}catch(err){
  console.error("[LyricTube] core bootstrap failed:",err);
  document.documentElement.dataset.lyricTubeReady="error";
}
els.settingsBtn.addEventListener("click",()=>openSettingsDialog());
document.querySelectorAll('.theme-btn').forEach(btn=>{
  btn.addEventListener('click',()=>setTheme(btn.dataset.theme));
});
els.lyricsFontSizeSlider.addEventListener('input',()=>{
  const v=parseInt(els.lyricsFontSizeSlider.value,10);
  els.lyricsFontSizeValue.textContent=v+"px";
  library.settings.lyricsFontSize=v;
  applyLyricsFontSize();
  persistLibrary();
});
els.settingsAutoScroll.addEventListener('change',()=>{
  library.settings.autoScroll=els.settingsAutoScroll.checked;
  persistLibrary();
  updateModeButtons();
});
els.settingsBottomPlayer.addEventListener('change',()=>{
  library.settings.showBottomPlayer=els.settingsBottomPlayer.checked;
  toggleBottomPlayer();
  persistLibrary();
});
els.settingsSpotlight.addEventListener('change',()=>{
  library.settings.spotlight=els.settingsSpotlight.checked;
  toggleSpotlight();
  persistLibrary();
});
els.settingsStartupPage?.addEventListener('change',()=>{
  library.settings.startupPage=els.settingsStartupPage.value;
  persistLibrary();
  showToast(`次回は「${els.settingsStartupPage.value==="browse"?"曲を探す":"再生画面"}」から開きます。`);
});
els.settingsCompactMode?.addEventListener('change',()=>{
  library.settings.compactMode=els.settingsCompactMode.checked;
  applyUiSettings();
  persistLibrary();
});
els.settingsShowArtwork?.addEventListener('change',()=>{
  library.settings.showArtwork=els.settingsShowArtwork.checked;
  applyUiSettings();
  persistLibrary();
});
els.settingsGlass?.addEventListener('change',()=>{
  library.settings.glassEffect=els.settingsGlass.checked;
  applyUiSettings();
  persistLibrary();
});
els.settingsReduceMotion?.addEventListener('change',()=>{
  library.settings.reduceMotion=els.settingsReduceMotion.checked;
  applyUiSettings();
  persistLibrary();
});
els.settingsHelpTips?.addEventListener('change',()=>{
  library.settings.helpTips=els.settingsHelpTips.checked;
  applyUiSettings();
  persistLibrary();
});
els.openShortcutFromSettingsBtn.addEventListener('click',()=>{
  els.shortcutDialog.showModal();
});

els.closeSettingsDialog.addEventListener("click",closeSettingsDialog);
els.settingsDialog.addEventListener("cancel",e=>{e.preventDefault();closeSettingsDialog()});











els.addSongBtn.addEventListener("click",()=>openSongDialog());
els.browseAddSongBtn.addEventListener("click",()=>openSongDialog());
els.editSongBtn.addEventListener("click",()=>openSongDialog(getSong()));
els.deleteSongBtn.addEventListener("click",deleteSong);
els.favoriteBtn.addEventListener("click",toggleFavorite);
els.playlistBtn.addEventListener("click",()=>openPlaylistDialog(selectedSongId));
els.managePlaylistsBtn.addEventListener("click",()=>openPlaylistDialog(null));

els.playerPageBtn.addEventListener("click",()=>setMainPage("player",{persist:false}));
els.browsePageBtn.addEventListener("click",()=>setMainPage("browse",{persist:false}));

els.librarySearch.addEventListener("input",()=>{
  els.browseSearch.value=els.librarySearch.value;
  renderLibrary();
  renderBrowse();
});
els.browseSearch.addEventListener("input",()=>{
  els.librarySearch.value=els.browseSearch.value;
  renderLibrary();
  renderBrowse();
});

document.querySelectorAll(".view-btn").forEach(b=>b.addEventListener("click",()=>{
  currentView={type:b.dataset.view,playlistId:null};
  renderAll();
}));
document.querySelectorAll(".browse-chip").forEach(b=>b.addEventListener("click",()=>{
  currentView={type:b.dataset.browseView,playlistId:null};
  renderAll();
}));
els.youtubeUrl.addEventListener("input",()=>{delete els.youtubeUrl.dataset.rawTitle;delete els.youtubeUrl.dataset.performer;delete els.youtubeUrl.dataset.detectedType;});
els.versionYoutubeUrl.addEventListener("input",()=>{delete els.versionYoutubeUrl.dataset.rawTitle;delete els.versionYoutubeUrl.dataset.performer;});
els.exportBtn.addEventListener("click",exportLibrary);els.importInput.addEventListener("change",()=>{const f=els.importInput.files?.[0];if(f)importLibrary(f);els.importInput.value=""});
els.closeSongDialog.addEventListener("click",()=>els.songDialog.close());els.cancelSongBtn.addEventListener("click",()=>els.songDialog.close());els.songForm.addEventListener("submit",e=>{e.preventDefault();saveSongForm()});els.fetchYoutubeInfoBtn.addEventListener("click",()=>fetchOembed(els.youtubeUrl.value,"song"));els.searchLyricsBtn.addEventListener("click",searchLyrics);els.googleLyricsBtn.addEventListener("click",openGoogleLyricsSearch);els.pasteLyricsBtn.addEventListener("click",pasteLyricsFromClipboard);els.closeLyricsSearchDialog.addEventListener("click",closeLyricsResultsAndReturn);els.lyricsSearchDialog.addEventListener("cancel",e=>{e.preventDefault();closeLyricsResultsAndReturn()});
els.addVersionBtn.addEventListener("click",()=>openVersionDialog());els.editVersionBtn.addEventListener("click",()=>openVersionDialog(getVersion()));els.closeVersionDialog.addEventListener("click",()=>els.versionDialog.close());els.cancelVersionBtn.addEventListener("click",()=>els.versionDialog.close());els.versionForm.addEventListener("submit",e=>{e.preventDefault();saveVersionForm()});els.fetchVersionInfoBtn.addEventListener("click",()=>fetchOembed(els.versionYoutubeUrl.value,"version"));els.deleteVersionBtn.addEventListener("click",deleteVersion);
els.setStartBtn.addEventListener("click",()=>setRange("start"));els.setEndBtn.addEventListener("click",()=>setRange("end"));els.resetRangeBtn.addEventListener("click",resetRange);els.autoSkipToggle.addEventListener("change",()=>{const v=getVersion();if(v){v.autoSkip=els.autoSkipToggle.checked;persistLibrary()}});els.markSkipStartBtn.addEventListener("click",markSkipStart);els.markSkipEndBtn.addEventListener("click",markSkipEnd);
els.offsetMinus.addEventListener("click",()=>updateOffset(-.5));els.offsetPlus.addEventListener("click",()=>updateOffset(.5));els.offsetInput.addEventListener("change",()=>updateOffset(null));els.openSyncEditorBtn.addEventListener("click",openSyncEditor);els.closeSyncDialog.addEventListener("click",()=>els.syncDialog.close());els.resetSyncBtn.addEventListener("click",resetSyncDraft);els.saveSyncBtn.addEventListener("click",saveSyncDraft);els.useSharedSyncBtn.addEventListener("click",useSharedSync);
els.syncGoStartBtn.addEventListener("click",()=>{const v=getVersion();if(v)seekSyncPlayer(Number(v.startTime)||0)});
els.syncBack5Btn.addEventListener("click",()=>nudgeSyncPlayer(-5));
els.syncBack1Btn.addEventListener("click",()=>nudgeSyncPlayer(-1));
els.syncPlayPauseBtn.addEventListener("click",toggleSyncPlayback);
els.syncForward1Btn.addEventListener("click",()=>nudgeSyncPlayer(1));
els.syncForward5Btn.addEventListener("click",()=>nudgeSyncPlayer(5));
els.syncAddInterludeBtn.addEventListener("click",addInterludeMarker);
els.syncUndoBtn.addEventListener("click",undoSyncChange);
[els.syncNudgeMinus1,els.syncNudgePlus1,els.syncNudgeMinus5,els.syncNudgePlus5].forEach((btn,i)=>{const deltas=[-.1,.1,-.5,.5];btn.addEventListener("click",()=>nudgeAllSyncTimes(deltas[i]))});
els.syncSeekBar.addEventListener("pointerdown",()=>{syncSeekDragging=true});
els.syncSeekBar.addEventListener("pointerup",()=>{syncSeekDragging=false;seekSyncPlayer(Number(els.syncSeekBar.value)||0)});
els.syncSeekBar.addEventListener("input",()=>{
  syncSeekDragging=true;
  const preview=Number(els.syncSeekBar.value)||0;
  els.syncVideoTime.textContent=formatTime(preview);
  els.syncRelativeTime.textContent=formatTime(syncRelativeSeconds(preview));
});
els.syncSeekBar.addEventListener("change",()=>{
  syncSeekDragging=false;
  seekSyncPlayer(Number(els.syncSeekBar.value)||0);
});
els.prevBtn.addEventListener("click",()=>playAdjacent(-1,true,false));els.nextBtn.addEventListener("click",()=>playAdjacent(1,true,false));els.restartBtn.addEventListener("click",()=>restartCurrent(true));els.shuffleBtn.addEventListener("click",()=>{library.settings.shuffle=!library.settings.shuffle;persistLibrary();updateModeButtons()});els.repeatBtn.addEventListener("click",()=>{library.settings.repeat=library.settings.repeat==="off"?"all":library.settings.repeat==="all"?"one":"off";persistLibrary();updateModeButtons()});els.toggleAutoScrollBtn.addEventListener("click",()=>{clearAutoScrollManualPause();library.settings.autoScroll=!library.settings.autoScroll;persistLibrary();updateModeButtons()});els.fullscreenLyricsBtn.addEventListener("click",()=>{fullLyrics=!fullLyrics;document.querySelector(".lyrics-panel").classList.toggle("fullscreen",fullLyrics);els.fullscreenLyricsBtn.textContent=fullLyrics?"元に戻す":"大きく表示"});
els.closePlaylistDialog.addEventListener("click",()=>{els.playlistDialog.close();playlistTargetSongId=null});els.playlistDialog.addEventListener("close",()=>{playlistTargetSongId=null});els.createPlaylistBtn.addEventListener("click",createPlaylist);els.newPlaylistName.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();createPlaylist()}});

els.lyricsView.addEventListener("wheel",pauseAutoScrollForManualScroll,{passive:true});
els.lyricsView.addEventListener("touchstart",pauseAutoScrollForManualScroll,{passive:true});
els.lyricsView.addEventListener("pointerdown",e=>{
  if(e.pointerType!=="mouse"||e.button===0)pauseAutoScrollForManualScroll();
});

els.bottomPrevBtn.addEventListener("click",()=>playAdjacent(-1,true,false));
els.bottomNextBtn.addEventListener("click",()=>playAdjacent(1,true,false));
els.bottomPlayBtn.addEventListener("click",toggleMainPlayback);
els.bottomQueueBtn.addEventListener("click",openQueueDialog);
els.closeQueueDialog.addEventListener("click",()=>els.queueDialog.close());

els.bottomSeek.addEventListener("pointerdown",()=>{bottomSeekDragging=true});
els.bottomSeek.addEventListener("input",()=>{
  bottomSeekDragging=true;
  els.bottomCurrentTime.textContent=formatShortTime(Number(els.bottomSeek.value)||0);
});
els.bottomSeek.addEventListener("change",()=>{
  bottomSeekDragging=false;
  try{ytPlayer?.seekTo?.(Number(els.bottomSeek.value)||0,true)}catch{}
  updateBottomPlayer();
});
els.bottomSeek.addEventListener("pointerup",()=>{
  bottomSeekDragging=false;
  try{ytPlayer?.seekTo?.(Number(els.bottomSeek.value)||0,true)}catch{}
});

els.bottomVolume.addEventListener("input",()=>{
  const volume=clamp(Number(els.bottomVolume.value)||0,0,100);
  library.settings.volume=volume;
  try{ytPlayer?.setVolume?.(volume)}catch{}
});
els.bottomVolume.addEventListener("change",persistLibrary);

window.addEventListener("focus",focusLyricsAfterGoogle);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")focusLyricsAfterGoogle()});
window.addEventListener("keydown",e=>{if(els.syncDialog?.open&&e.shiftKey&&e.key.toLowerCase()==="t"){e.preventDefault();stampSyncLine(syncSelectedIndex);return}if(["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName))return;if(e.code==="Space"){e.preventDefault();try{ytPlayer?.getPlayerState?.()===1?ytPlayer.pauseVideo():ytPlayer.playVideo()}catch{}}else if(e.key==="ArrowRight"&&!e.ctrlKey){try{ytPlayer.seekTo(currentPlayerTime()+5,true)}catch{}}else if(e.key==="ArrowLeft"&&!e.ctrlKey){try{ytPlayer.seekTo(Math.max(0,currentPlayerTime()-5),true)}catch{}}else if(e.ctrlKey&&e.key==="ArrowRight"){e.preventDefault();playAdjacent(1,true,false)}else if(e.ctrlKey&&e.key==="ArrowLeft"){e.preventDefault();playAdjacent(-1,true,false)}else if(e.key.toLowerCase()==="f"){toggleFavorite()}else if(e.key==="?"||e.key==="/"){e.preventDefault();els.shortcutDialog.showModal()}});

let miniPlayerActive=false;
function toggleMiniPlayer(){
  const pc=document.querySelector('.player-card');
  if(!pc)return;
  miniPlayerActive=!miniPlayerActive;
  pc.classList.toggle('mini-player',miniPlayerActive);
  pc.classList.toggle('hidden-mini',!miniPlayerActive);
  els.miniPlayerBtn.classList.toggle('active',miniPlayerActive);
}
els.miniPlayerBtn.addEventListener('click',toggleMiniPlayer);
els.closeShortcutDialog.addEventListener('click',()=>els.shortcutDialog.close());
els.closeHelpDialog?.addEventListener('click',closeHelpDialog);
document.addEventListener('click',e=>{const btn=e.target.closest('[data-help-topic]');if(!btn)return;e.preventDefault();e.stopPropagation();openHelpDialog(btn.dataset.helpTopic||'overview')});

// Font size controls: use the same setting as the settings slider.
function changeLyricsFontSize(deltaPx){
  const current=Number(library.settings.lyricsFontSize)||18;
  library.settings.lyricsFontSize=clamp(current+deltaPx,12,32);
  applyLyricsFontSize();
  persistLibrary();
  showToast(`歌詞サイズ ${library.settings.lyricsFontSize}px`);
}
els.fontSizeUpBtn?.addEventListener('click',()=>changeLyricsFontSize(2));
els.fontSizeDownBtn?.addEventListener('click',()=>changeLyricsFontSize(-2));

// Visualizer: is-playing state
function updatePlayingState(){
  try{
    const playing=ytPlayer?.getPlayerState?.()===1;
    document.body.classList.toggle('is-playing',!!playing);
  }catch{}
}
setInterval(updatePlayingState,500);

// Mouse spotlight
const spotlight=document.createElement('div');
spotlight.className="cursor-spotlight";spotlight.id="spotlight";
document.body.appendChild(spotlight);
document.addEventListener('mousemove',e=>{
  spotlight.style.left=e.clientX+'px';
  spotlight.style.top=e.clientY+'px';
});
document.addEventListener('mouseleave',()=>{spotlight.style.opacity='0'});
document.addEventListener('mouseenter',()=>{spotlight.style.opacity='1'});

// Aurora background
document.body.classList.add('aurora-active');

function bootstrapCore(){
  if(window.__lyricTubeCoreReady)return;
  window.__lyricTubeCoreReady=true;

  loadLibrary();
  applyTheme();
  applyLyricsFontSize();
  applyUiSettings();
  toggleBottomPlayer();
  toggleSpotlight();
  mainPage=library.settings.startupPage==="browse"?"browse":"player";
  ensureSelection();
  renderAll();
  updateModeButtons();
  els.browseSearch.value=els.librarySearch.value;
  els.bottomVolume.value=String(clamp(Number(library.settings.volume??80),0,100));
  if(selectedSongId)loadSelectedVideo(false);
  syncTimer=setInterval(playbackTick,180);
  loadYoutubeApi();

  document.documentElement.dataset.lyricTubeReady="v29";
}
