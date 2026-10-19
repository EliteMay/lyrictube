const assert=require("node:assert/strict");
const {normalizedResults,buildSearchUrl,searchVideos}=require("../core/youtube-search.js");
const apiKey="test-key-not-real";

const items=normalizedResults({items:[
 {id:{kind:"youtube#video",videoId:"abcdefghijk"},snippet:{title:"Song &amp; Artist",channelTitle:"Official"}},
 {id:{kind:"youtube#channel",videoId:"lmnopqrstuv"},snippet:{title:"channel"}},
 {id:{kind:"youtube#video",videoId:"bad"},snippet:{title:"invalid"}},
 {id:{kind:"youtube#video",videoId:"ABCDEFGHIJK"},snippet:{title:"Cover"}}
]});
assert.deepEqual(items,[
 {videoId:"abcdefghijk",title:"Song &amp; Artist",channel:"Official"},
 {videoId:"ABCDEFGHIJK",title:"Cover",channel:""}
]);
assert.deepEqual(normalizedResults(null),[]);
assert.deepEqual(normalizedResults({items:{}}),[]);
const url=buildSearchUrl("  スパークル RADWIMPS  ",apiKey);
assert.equal(url.origin,"https://www.googleapis.com");
assert.equal(url.pathname,"/youtube/v3/search");
assert.equal(url.searchParams.get("q"),"スパークル RADWIMPS");
assert.equal(url.searchParams.get("key"),apiKey);
assert.equal(url.searchParams.get("type"),"video");
assert.equal(url.searchParams.get("videoEmbeddable"),"true");
assert.equal(url.searchParams.get("maxResults"),"12");
assert.equal(buildSearchUrl("a".repeat(150),apiKey).searchParams.get("q").length,100);
assert.throws(()=>buildSearchUrl("","any"));
assert.throws(()=>buildSearchUrl("song",""));

(async()=>{
 let called=false;
 const matches=await searchVideos("test",apiKey,{request:async (url,opts)=>{
  called=true;
  assert.match(url,/q=test/);
  assert.equal(opts.referrerPolicy,"origin");
  return {ok:true,json:async()=>({items:[{id:{kind:"youtube#video",videoId:"abcdefghijk"},snippet:{title:"Test",channelTitle:"channel"}}]})};
 }});
 assert(called);
 assert.equal(matches.length,1);
 await assert.rejects(()=>searchVideos("test",apiKey,{request:async()=>({ok:false,status:403})}),/APIキー/);
 await assert.rejects(()=>searchVideos("test",apiKey,{request:async()=>({ok:false,status:429})}),/制限/);
 console.log("YouTube search tests passed");
})().catch(err=>{console.error(err);process.exitCode=1});
