"use strict";const test=require("node:test"),assert=require("node:assert/strict");const {videoIdsFromLibrary,chunks,apiUrl,normalizeChannels,normalizeUploads,onlyRegularVideos,likelyShort,safeIconUrl}=require("../core/youtube-channels.js");const video="abcdefghijk",second="ABCDEFGHIJK",channel="UC"+"a".repeat(22);test("deduplicates video IDs and skips local media",()=>{const a={songs:[{versions:[{videoId:video},{videoId:video},{source:"localmedia",videoId:second}]},{versions:[{videoId:second}]}]};const before=JSON.stringify(a);assert.deepEqual(videoIdsFromLibrary(a),[video,second]);assert.equal(JSON.stringify(a),before)});test("chunks at most 50",()=>{assert.deepEqual(chunks([1,2,3],2),[[1,2],[3]]);assert.throws(()=>chunks([1],0))});test("only official API resource paths",()=>{assert.equal(new URL(apiUrl("videos",{id:video},"k")).pathname,"/youtube/v3/videos");assert.throws(()=>apiUrl("../bad",{},"k"))});test("channel joins official icon and uploads playlist",()=>{const a=normalizeChannels([{snippet:{channelId:channel}}],[{id:channel,snippet:{title:"Artist",thumbnails:{high:{url:"https://yt3.googleusercontent.com/a"}}},contentDetails:{relatedPlaylists:{uploads:"UU"+"a".repeat(22)}}}]);assert.equal(a[0].title,"Artist");assert.equal(a[0].registeredCount,1);assert.ok(a[0].uploadsId.startsWith("UU"))});test("filters deleted and private videos",()=>{const a=normalizeUploads({nextPageToken:"next",items:[{snippet:{resourceId:{videoId:video},title:"Track"}},{snippet:{resourceId:{videoId:second},title:"Private video"}}]},new Set([video]));assert.deepEqual(a,{items:[{videoId:video,title:"Track",registered:true}],nextPageToken:"next"})});test("restricts channel avatar host",()=>{assert.equal(safeIconUrl("https://yt3.googleusercontent.com/a"),"https://yt3.googleusercontent.com/a");assert.equal(safeIconUrl("https://evil.example/a"),"");assert.equal(safeIconUrl("javascript:alert(1)"),"")});
test("lazy avatar image attaches before load; fallback survives an image error",()=>{
  const fs=require("node:fs"),vm=require("node:vm");
  const line=fs.readFileSync("core/youtube-channels.js","utf8").split("\n").find(s=>s.startsWith("function avatar(channel)"));
  assert.ok(line,"missing avatar function");
  const node=(tag,cls,text)=>({tag,cls,textContent:text,style:{},children:[],listeners:{},
    append(...items){this.children.push(...items)},
    addEventListener(kind,callback){this.listeners[kind]=callback},
    remove(){this.removed=true}
  });
  const avatar=vm.runInNewContext(line+";avatar",{node,safeIconUrl});
  const wrapper=avatar({title:"Music",icon:"https://yt3.googleusercontent.com/avatar"});
  const image=wrapper.children[0];
  assert.equal(wrapper.textContent,"M");
  assert.equal(image.tag,"img","lazy image must be in the DOM output");
  assert.equal(image.loading,"lazy");
  assert.equal(image.style.opacity,"0");
  image.listeners.load();
  assert.equal(image.style.opacity,"1","successful avatar replaces the visible fallback");
  image.listeners.error();
  assert.equal(image.removed,true,"error leaves the initial letter intact");
  assert.equal(avatar({title:"Other",icon:"https://untrusted.example/a"}).children.length,0);
  const stylesheet=fs.readFileSync("youtube-channels.css","utf8");
  assert.match(stylesheet,/\.channel-avatar\{[^}]*position:relative/);
  assert.match(stylesheet,/\.channel-avatar img\{[^}]*position:absolute/);
});

test("shows only regular videos, excluding live, upcoming, archived streams and missing metadata",()=>{
  const uploads=[
    {videoId:"aaaaaaaaaaa",title:"Music",registered:false},
    {videoId:"bbbbbbbbbbb",title:"On air",registered:false},
    {videoId:"ccccccccccc",title:"Scheduled",registered:false},
    {videoId:"ddddddddddd",title:"Archive",registered:true},
    {videoId:"eeeeeeeeeee",title:"Unlisted",registered:false},
    {videoId:"fffffffffff",title:"No metadata",registered:false}
  ];
  const details=[
    {id:"aaaaaaaaaaa",snippet:{liveBroadcastContent:"none"}},
    {id:"bbbbbbbbbbb",snippet:{liveBroadcastContent:"live"},liveStreamingDetails:{actualStartTime:"2026-10-22T12:00:00Z"}},
    {id:"ccccccccccc",snippet:{liveBroadcastContent:"upcoming"},liveStreamingDetails:{scheduledStartTime:"2026-10-23T12:00:00Z"}},
    {id:"ddddddddddd",snippet:{liveBroadcastContent:"none"},liveStreamingDetails:{actualEndTime:"2026-10-22T12:00:00Z"}},
    {id:"eeeeeeeeeee",snippet:{liveBroadcastContent:"none"}}
  ];
  const before=JSON.stringify(uploads);
  const regular=onlyRegularVideos(uploads,details);
  assert.deepEqual(regular.map(x=>x.videoId),["aaaaaaaaaaa","eeeeeeeeeee"]);
  assert.equal(JSON.stringify(uploads),before,"filter does not mutate upload data");
});
test("checks upload metadata using videos.list, including archived live metadata",()=>{
  const fs=require("node:fs");
  const source=fs.readFileSync("core/youtube-channels.js","utf8");
  assert.match(source,/request\("playlistItems"/);
  assert.match(source,/request\("videos",\{part:"snippet,contentDetails,liveStreamingDetails"/);
  assert.match(source,/onlyRegularVideos\(result\.items,details\.items\)/);
  assert.match(source,/次の50件を確認できます/,"pagination remains possible even if an entire page is streams");
});

test("Shorts heuristic excludes under-a-minute clips but protects ordinary songs up to three minutes",()=>{
  const make=(duration,title,description="",tags=[])=>({contentDetails:{duration},snippet:{title,description,tags,liveBroadcastContent:"none"}});
  assert.equal(likelyShort(make("PT59S","Normal short track")),true,"under 60 seconds is treated as a Shorts candidate");
  assert.equal(likelyShort(make("PT1M","One-minute song")),true);
  assert.equal(likelyShort(make("PT1M1S","Regular song")),false,"ordinary song longer than one minute stays visible");
  assert.equal(likelyShort(make("PT2M57S","Music video")),false,"do not hide all short full songs");
  assert.equal(likelyShort(make("PT2M57S","MV #Shorts")),true);
  assert.equal(likelyShort(make("PT2M59S","Original song","Official music video #Shorts")),true);
  assert.equal(likelyShort(make("PT1M45S","Music clip", "", ["youtube","shorts"])),true);
  assert.equal(likelyShort(make("PT2M30S","ショート動画【Cover】")),false,"do not infer from arbitrary title fragments");
  assert.equal(likelyShort(make("PT2M30S","#ショート動画 Cover")),true);
  assert.equal(likelyShort(make("PT3M1S","MV #Shorts")),false,"over three minutes cannot be classified by this heuristic");
  assert.equal(likelyShort(make("PT1H10M","long video", "#shorts")),false);
  assert.equal(likelyShort(make("PT1M45S","Regular song","Watch my latest #Shorts","")),true,"explicit description markers are honored");
  assert.equal(likelyShort({snippet:{title:"Missing duration #Shorts"}}),false,"unknown duration leaves the video eligible");
  assert.equal(likelyShort(make("not-ISO","Unknown")),false);
});
test("channel upload filtering removes live archives and inferred Shorts in one pass",()=>{
  const cases=[
    ["aaaaaaaaaaa","PT4M12S","Regular MV",null],
    ["bbbbbbbbbbb","PT36S","Short",null],
    ["ccccccccccc","PT2M46S","Music #Shorts",null],
    ["ddddddddddd","PT2M46S","Song",null],
    ["eeeeeeeeeee","PT10M","Live archive",{actualStartTime:"2026-10-22T07:00:00Z"}]
  ];
  const items=cases.map(([videoId])=>({videoId,title:"test",registered:false}));
  const metadata=cases.map(([id,duration,title,liveStreamingDetails])=>({id,contentDetails:{duration},snippet:{title,liveBroadcastContent:"none"},...(liveStreamingDetails?{liveStreamingDetails}:{})}));
  assert.deepEqual(onlyRegularVideos(items,metadata).map(x=>x.videoId),["aaaaaaaaaaa","ddddddddddd"]);
});
