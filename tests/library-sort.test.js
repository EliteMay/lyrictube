const assert=require("node:assert/strict");
const {sortSongs,MODES}=require("../core/library-sort.js");

const a={id:"a",title:"曲10",artist:"さくら",createdAt:"2026-10-01T12:00:00Z",lastPlayedAt:"2026-10-10T12:00:00Z"};
const b={id:"b",title:"曲2",artist:"あお",createdAt:"2026-10-02T12:00:00Z",lastPlayedAt:null};
const c={id:"c",title:"曲1",artist:"あお",createdAt:"2026-10-03T12:00:00Z",lastPlayedAt:"2026-10-11T12:00:00Z"};
const original=[a,b,c];
const ids=value=>value.map(song=>song.id).join(",");

assert.deepEqual(MODES,["default","title","artist","added","played"]);
assert.equal(ids(sortSongs(original,"default")),"a,b,c");
assert.equal(ids(sortSongs(original,"title")),"c,b,a","Japanese numeric collation must be natural");
assert.equal(ids(sortSongs(original,"artist")),"b,c,a","ties must retain original order");
assert.equal(ids(sortSongs(original,"added")),"c,b,a");
assert.equal(ids(sortSongs(original,"played")),"c,a,b","unplayed songs must remain last");
assert.equal(ids(sortSongs(original,"unexpected")),"a,b,c");
assert.equal(ids(original),"a,b,c","sort must not mutate library");
assert.equal(ids(sortSongs([{id:"no-date"},{id:"new",createdAt:"2026-10-02"}],"added")),"new,no-date");
assert.equal(ids(sortSongs([{id:"x"},{id:"y"}],"played")),"x,y","missing dates stable");
assert.deepEqual(sortSongs(null,"title"),[]);
console.log("library sort tests passed");
