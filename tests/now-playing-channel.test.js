"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const {channelFromVideo}=require("../core/youtube-channels.js");
const channelId="UC"+"a".repeat(22),videoId="abcdefghijk";
const video={id:videoId,snippet:{channelId}};
const owner={id:channelId,snippet:{title:"公式音楽チャンネル",thumbnails:{high:{url:"https://yt3.googleusercontent.com/icon"}}},contentDetails:{relatedPlaylists:{uploads:"UU"+"a".repeat(22)}}};

test("resolves only the actual uploader of the current video",()=>{
  assert.equal(channelFromVideo(video,owner).title,"公式音楽チャンネル");
  assert.equal(channelFromVideo(video,owner).uploadsId,"UU"+"a".repeat(22));
  assert.equal(channelFromVideo({...video,id:"invalid"},owner),null);
  assert.equal(channelFromVideo(video,{...owner,id:"UC"+"b".repeat(22)}),null);
  assert.equal(channelFromVideo({...video,snippet:{channelId:"not-channel"}},owner),null);
});
test("current song entry uses existing channel browser and a real song/version render hook",()=>{
  const html=fs.readFileSync("index.html","utf8");
  const app=fs.readFileSync("app.js","utf8");
  const script=fs.readFileSync("core/youtube-channels.js","utf8");
  const css=fs.readFileSync("youtube-channels.css","utf8");
  assert.match(html,/id="nowChannelBtn"[^>]*hidden/);
  assert.match(html,/id="nowChannelIcon"/);
  assert.match(html,/id="nowChannelLabel"/);
  assert.match(app,/render:selected-song:done/);
  assert.match(script,/render:selected-song:done/);
  assert.match(script,/openCurrentFromVideo\(nowVideoId\)/);
  assert.match(script,/resolveVideoChannel\(id,ctx\)/);
  assert.match(script,/part:"snippet,contentDetails,liveStreamingDetails"/);
  assert.match(css,/\.now-channel-entry\[hidden\]\{display:none!important\}/);
});
test("registered channel video uses existing playback path instead of duplicate registration",()=>{
  const app=fs.readFileSync("app.js","utf8");
  const script=fs.readFileSync("core/youtube-channels.js","utf8");
  assert.match(app,/function playRegisteredVideo\(videoId\)/);
  assert.match(app,/playRegisteredVideo: videoId => playRegisteredVideo\(videoId\)/);
  assert.match(script,/item\.registered\?"この曲を再生":"この動画を追加"/);
  assert.match(script,/LyricTubeCore\.playRegisteredVideo\?\.\(item\.videoId\)/);
});
