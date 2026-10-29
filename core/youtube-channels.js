(() => {
"use strict";
const BASE="https://www.googleapis.com/youtube/v3/", KEY="lyrictube.youtubeSearch.key.session";
const VIDEO=/^[A-Za-z0-9_-]{11}$/,CHANNEL=/^UC[A-Za-z0-9_-]{22}$/;
const $=id=>document.getElementById(id);
function videoIdsFromLibrary(lib){const s=new Set();for(const song of Array.isArray(lib?.songs)?lib.songs:[])for(const v of Array.isArray(song.versions)?song.versions:[]){const id=String(v.videoId||"");if(VIDEO.test(id)&&v.source!=="localmedia")s.add(id);}return [...s];}
function chunks(items,size=50){if(!Number.isInteger(size)||size<1||size>50)throw Error("Invalid page size");const a=[];for(let i=0;i<items.length;i+=size)a.push(items.slice(i,i+size));return a;}
function apiUrl(resource,params,key){if(!["videos","channels","playlistItems"].includes(resource))throw Error("Invalid endpoint");const u=new URL(resource,BASE);for(const [k,v] of Object.entries(params))u.searchParams.set(k,String(v));u.searchParams.set("key",String(key));return u.toString();}
function normalizeChannels(videos,channels){const counts=new Map();for(const v of videos){const id=String(v?.snippet?.channelId||"");if(CHANNEL.test(id))counts.set(id,(counts.get(id)||0)+1);}return channels.filter(c=>counts.has(c?.id)).map(c=>({id:c.id,title:String(c.snippet?.title||"チャンネル").slice(0,150),icon:String(c.snippet?.thumbnails?.high?.url||c.snippet?.thumbnails?.medium?.url||c.snippet?.thumbnails?.default?.url||""),uploadsId:String(c.contentDetails?.relatedPlaylists?.uploads||""),registeredCount:counts.get(c.id)})).sort((a,b)=>a.title.localeCompare(b.title,"ja"));}
function channelFromVideo(video,channel){
  const id=String(video?.snippet?.channelId||"");
  if(!VIDEO.test(String(video?.id||""))||!CHANNEL.test(id)||channel?.id!==id)return null;
  return normalizeChannels([video],[channel])[0]||null;
}
function normalizeUploads(payload,registered){const items=[],seen=new Set();for(const v of Array.isArray(payload?.items)?payload.items:[]){const id=String(v?.snippet?.resourceId?.videoId||"");if(!VIDEO.test(id)||seen.has(id))continue;seen.add(id);const title=String(v.snippet?.title||"動画").slice(0,180);if(title==="Private video"||title==="Deleted video")continue;items.push({videoId:id,title,registered:registered.has(id)});}return {items,nextPageToken:String(payload?.nextPageToken||"")};}
function likelyShort(video){const iso=String(video?.contentDetails?.duration||"");const m=/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)$/.exec(iso);if(!m||!m.slice(1).some(Boolean))return false;const seconds=(Number(m[1]||0)*86400)+(Number(m[2]||0)*3600)+(Number(m[3]||0)*60)+Number(m[4]||0);if(seconds<=0||seconds>180)return false;if(seconds<=60)return true;const snippet=video?.snippet||{};const details=[snippet.title||"",snippet.description||"",...(Array.isArray(snippet.tags)?snippet.tags:[])].join(" ");return /(?:#|＃)\s*(?:shorts?|ytshorts)(?![A-Za-z0-9_])|(?:#|＃)\s*ショート(?:動画)?|(?:^|[\s　【\[（(])shorts(?=$|[\s　】\]）)!！])/i.test(details);}
function onlyRegularVideos(uploads,metadata){const byId=new Map((Array.isArray(metadata)?metadata:[]).filter(v=>VIDEO.test(String(v?.id||""))).map(v=>[v.id,v]));return uploads.filter(item=>{const video=byId.get(item.videoId);return video?.snippet?.liveBroadcastContent==="none"&&!video.liveStreamingDetails&&!likelyShort(video);});}
function safeIconUrl(raw){try{const u=new URL(raw),host=u.hostname.toLowerCase();if(u.protocol==="https:"&&(host==="yt3.ggpht.com"||host==="yt3.googleusercontent.com"||host.endsWith(".ggpht.com")||host.endsWith(".googleusercontent.com")))return u.href;}catch{}return "";}
if(typeof module!=="undefined"&&module.exports)module.exports={videoIdsFromLibrary,chunks,apiUrl,normalizeChannels,channelFromVideo,normalizeUploads,onlyRegularVideos,likelyShort,safeIconUrl};
if(typeof document==="undefined")return;
const dialog=$("youtubeChannelsDialog");if(!dialog||!window.LyricTubeCore)return;
const keyInput=$("channelApiKey"),help=$("channelKeyHelp"),list=$("channelList"),panel=$("channelPanel"),videoPanel=$("channelVideosPanel"),status=$("channelStatus"),vstatus=$("channelVideoStatus"),videos=$("channelVideos"),refresh=$("channelRefreshBtn"),more=$("channelLoadMore"),filter=$("channelFilter");
let aborter=null,seq=0,cache=null,cacheSignature="",selected=null,nextToken="";
const nowBtn=$("nowChannelBtn"),nowIcon=$("nowChannelIcon"),nowLabel=$("nowChannelLabel"),back=$("channelBackBtn");
let nowVideoId="",nowChannel=null,nowAborter=null,nowSeq=0,origin="browse",openedVideoId="";
const videoChannelCache=new Map();
function key(){try{return sessionStorage.getItem(KEY)||keyInput.value.trim();}catch{return keyInput.value.trim();}}
function cancel(){seq++;aborter?.abort();aborter=null;}
function begin(){cancel();aborter=new AbortController();return {seq,signal:aborter.signal};}
function live(ctx){return dialog.open&&ctx.seq===seq&&!ctx.signal.aborted;}
function node(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function avatar(channel){const wrap=node("span","channel-avatar",channel.title.slice(0,1)||"♪"),url=safeIconUrl(channel.icon);if(url){const img=node("img");img.alt="";img.loading="lazy";img.referrerPolicy="no-referrer";img.style.opacity="0";img.addEventListener("load",()=>{img.style.opacity="1";},{once:true});img.addEventListener("error",()=>img.remove(),{once:true});wrap.append(img);img.src=url;}return wrap;}
function errorMessage(code){return code===400||code===403?"YouTube APIキー、利用権限、利用上限を確認してください。":code===429?"YouTubeの利用制限に達しました。":"YouTubeへ接続できませんでした。";}
async function request(endpoint,params,ctx){const r=await fetch(apiUrl(endpoint,params,key()),{signal:ctx.signal,referrerPolicy:"origin"});if(!r.ok)throw Error(errorMessage(r.status));return r.json();}
function showCurrentChannel(channel){
  nowChannel=channel;
  if(!nowBtn)return;
  nowIcon.replaceChildren(avatar(channel));
  nowLabel.textContent=channel.title;
  nowBtn.title=channel.title+"の投稿動画を見る";
  nowBtn.setAttribute("aria-label",channel.title+"の投稿動画一覧を見る");
}
async function resolveVideoChannel(videoId,ctx){
  if(!VIDEO.test(String(videoId||"")))throw Error("再生動画のIDを取得できませんでした。");
  const cached=videoChannelCache.get(videoId);
  if(cached)return cached;
  const data=await request("videos",{part:"snippet",id:videoId},ctx);
  const video=(Array.isArray(data.items)?data.items:[]).find(item=>item?.id===videoId);
  const channelId=String(video?.snippet?.channelId||"");
  if(!CHANNEL.test(channelId))throw Error("この動画の投稿チャンネルを取得できませんでした。");
  let owner=cache?.find(item=>item.id===channelId);
  if(!owner){
    const response=await request("channels",{part:"snippet,contentDetails",id:channelId},ctx);
    owner=(Array.isArray(response.items)?response.items:[]).find(item=>item?.id===channelId);
  }
  if(!owner)throw Error("投稿チャンネルの情報が見つかりませんでした。");
  const channel=owner.uploadsId?owner:channelFromVideo(video,owner);
  if(!channel)throw Error("投稿チャンネルの情報が不正です。");
  videoChannelCache.set(videoId,channel);
  return channel;
}
async function refreshNowChannel(force=false){
  const song=window.LyricTubeCore.getSong();
  const version=window.LyricTubeCore.getVersion(song);
  const videoId=version?.source==="localmedia"||version?.source==="local"?"":String(version?.videoId||"");
  const id=VIDEO.test(videoId)?videoId:"";
  if(!force&&id===nowVideoId)return;
  nowVideoId=id;
  nowChannel=null;
  const generation=++nowSeq;
  nowAborter?.abort();
  nowAborter=null;
  if(!nowBtn)return;
  nowBtn.hidden=!id;
  nowIcon.textContent="♪";
  nowLabel.textContent="投稿チャンネルを見る";
  nowBtn.title="再生動画の投稿チャンネルを開く";
  nowBtn.setAttribute("aria-label","再生動画の投稿チャンネルを開く");
  if(!id||!key())return;
  const controller=new AbortController();
  nowAborter=controller;
  try{
    const channel=await resolveVideoChannel(id,{signal:controller.signal});
    if(generation===nowSeq&&!controller.signal.aborted&&nowVideoId===id)showCurrentChannel(channel);
  }catch(error){
    if(generation===nowSeq&&!controller.signal.aborted){
      nowBtn.title=error.message||"チャンネルを開いて再取得できます。";
    }
  }finally{if(generation===nowSeq)nowAborter=null;}
}
async function openCurrentFromVideo(id){
  if(!VIDEO.test(String(id||"")))return;
  origin="playing";
  openedVideoId=id;
  cancel();
  selected=null;
  nextToken="";
  panel.hidden=true;
  videoPanel.hidden=false;
  back.hidden=true;
  more.hidden=true;
  videos.replaceChildren();
  $("channelCurrentIcon").replaceChildren(avatar(nowChannel||{title:"投稿チャンネル",icon:""}));
  $("channelCurrentName").textContent=nowChannel?.title||"投稿チャンネル";
  keyInput.value="";
  help.hidden=Boolean(key());
  vstatus.textContent=key()?"投稿チャンネルを取得しています…":"YouTube Data APIキーを設定すると、チャンネルの動画を表示できます。";
  if(!dialog.open)dialog.showModal();
  if(!key())return;
  const ctx=begin();
  try{
    const channel=await resolveVideoChannel(id,ctx);
    if(!live(ctx)||origin!=="playing"||openedVideoId!==id)return;
    if(nowVideoId===id)showCurrentChannel(channel);
    openChannel(channel);
  }catch(error){
    if(live(ctx))vstatus.textContent=error.message||"投稿チャンネルを取得できませんでした。";
  }
}
function showChannels(){list.replaceChildren();if(!cache?.length){list.append(node("p","channel-empty","チャンネルが見つかりません。"));return;}const q=filter.value.trim().toLowerCase();const matches=cache.filter(c=>c.title.toLowerCase().includes(q));if(!matches.length)list.append(node("p","channel-empty","一致するチャンネルがありません。"));for(const c of matches){const b=node("button","channel-card");b.type="button";const meta=node("span","channel-card-meta");meta.append(node("strong","",c.title),node("small","",c.registeredCount+"件の登録動画"));b.append(avatar(c),meta,node("span","channel-card-arrow","›"));b.addEventListener("click",()=>openChannel(c));list.append(b);}}
async function scan(force=false){cancel();const ids=videoIdsFromLibrary(window.LyricTubeCore.getLibrary()),sig=ids.slice().sort().join(",");refresh.disabled=false;if(!ids.length){cache=[];cacheSignature=sig;status.textContent="動画が未登録です。先に曲を追加してください。";showChannels();return;}if(!key()){help.hidden=false;list.replaceChildren();status.textContent="YouTube Data APIキーを設定してください。";return;}if(!force&&cache&&sig===cacheSignature){status.textContent=cache.length+"件のチャンネル";showChannels();return;}const ctx=begin(),found=[],owners=[];refresh.disabled=true;help.hidden=true;list.replaceChildren();status.textContent=ids.length+"件の登録動画を調べています…";try{for(const batch of chunks(ids)){const d=await request("videos",{part:"snippet",id:batch.join(",")},ctx);if(!live(ctx))return;found.push(...(Array.isArray(d.items)?d.items:[]));}const idsOfOwners=[...new Set(found.map(x=>x?.snippet?.channelId).filter(x=>CHANNEL.test(String(x||""))))];for(const batch of chunks(idsOfOwners)){const d=await request("channels",{part:"snippet,contentDetails",id:batch.join(",")},ctx);if(!live(ctx))return;owners.push(...(Array.isArray(d.items)?d.items:[]));}if(!live(ctx))return;cache=normalizeChannels(found,owners);cacheSignature=sig;status.textContent=cache.length+"件のチャンネルを取得しました。";showChannels();}catch(e){if(live(ctx))status.textContent=e.message||"取得に失敗しました。";}finally{if(live(ctx))refresh.disabled=false;}}
function listView(){cancel();selected=null;nextToken="";panel.hidden=false;videoPanel.hidden=true;more.hidden=true;}
function openChannel(c){selected=c;nextToken="";panel.hidden=true;videoPanel.hidden=false;$("channelCurrentIcon").replaceChildren(avatar(c));$("channelCurrentName").textContent=c.title;videos.replaceChildren();loadVideos(false);}
function registered(){return new Set(videoIdsFromLibrary(window.LyricTubeCore.getLibrary()));}
function showVideos(items,c){
  for(const item of items){
    const card=node("article","channel-video-card"),img=node("img","channel-video-cover"),body=node("div","channel-video-meta"),actions=node("div","channel-video-actions");
    img.src="https://i.ytimg.com/vi/"+item.videoId+"/mqdefault.jpg";
    img.alt="";
    img.loading="lazy";
    body.append(node("strong","",item.title));
    const choose=node("button","primary-soft",item.registered?"この曲を再生":"この動画を追加");
    choose.type="button";
    choose.addEventListener("click",()=>{
      if(item.registered){
        if(window.LyricTubeCore.playRegisteredVideo?.(item.videoId))close();
        else window.LyricTubeCore.toast("登録済みの曲を確認できませんでした。");
        return;
      }
      close();
      $("addSongBtn")?.click();
      const detail={videoId:item.videoId,title:item.title,channel:c.title,target:"song",accepted:false};
      document.dispatchEvent(new CustomEvent("lyrictube:youtube-search:select",{detail}));
      if(!detail.accepted)window.LyricTubeCore.toast("動画を選択できませんでした。重複登録などを確認してください。");
    });
    const a=node("a","","YouTubeで確認 ↗");
    a.href="https://www.youtube.com/watch?v="+item.videoId;
    a.target="_blank";
    a.rel="noopener noreferrer";
    actions.append(choose,a);
    body.append(actions);
    card.append(img,body);
    videos.append(card);
  }
}
async function loadVideos(append){if(!selected)return;const c=selected,token=append?nextToken:"";if(append&&!token)return;if(!c.uploadsId){vstatus.textContent="投稿動画一覧を取得できません。";return;}const ctx=begin();more.hidden=true;vstatus.textContent="投稿動画を取得しています…";try{const p={part:"snippet",playlistId:c.uploadsId,maxResults:50};if(token)p.pageToken=token;const d=await request("playlistItems",p,ctx);if(!live(ctx)||selected?.id!==c.id)return;const result=normalizeUploads(d,registered());let regular=[];if(result.items.length){const details=await request("videos",{part:"snippet,contentDetails,liveStreamingDetails",id:result.items.map(item=>item.videoId).join(",")},ctx);if(!live(ctx)||selected?.id!==c.id)return;regular=onlyRegularVideos(result.items,details.items);}if(!append)videos.replaceChildren();showVideos(regular,c);nextToken=result.nextPageToken;more.hidden=!nextToken;vstatus.textContent=videos.childElementCount?"動画を表示中（配信・Shorts候補を除外）":nextToken?"この50件はすべて除外対象でした。次の50件を確認できます。":"表示できる通常動画が見つかりませんでした。";}catch(e){if(live(ctx)){vstatus.textContent=e.message||"取得できませんでした。";if(append)more.hidden=false;}}}
function close(){cancel();selected=null;openedVideoId="";origin="browse";if(dialog.open)dialog.close();}
function open(){origin="browse";openedVideoId="";back.hidden=false;listView();keyInput.value="";help.hidden=Boolean(key());if(!dialog.open)dialog.showModal();scan();}
nowBtn?.addEventListener("click",()=>openCurrentFromVideo(nowVideoId));
window.LyricTubeHooks?.on?.("render:selected-song:done",()=>refreshNowChannel());
refreshNowChannel();
$("browseChannelsBtn")?.addEventListener("click",open);$("closeYoutubeChannelsDialog")?.addEventListener("click",close);$("channelBackBtn")?.addEventListener("click",listView);more.addEventListener("click",()=>loadVideos(true));refresh.addEventListener("click",()=>scan(true));filter.addEventListener("input",showChannels);
$("channelKeySave")?.addEventListener("click",()=>{const k=keyInput.value.trim();if(!k){status.textContent="APIキーを入力してください。";return;}try{sessionStorage.setItem(KEY,k);}catch{status.textContent="このブラウザではキーを保存できません。";return;}keyInput.value="";help.hidden=true;refreshNowChannel(true);if(origin==="playing")openCurrentFromVideo(openedVideoId);else scan(true);});
dialog.addEventListener("cancel",e=>{e.preventDefault();close();});dialog.addEventListener("close",cancel);
})();