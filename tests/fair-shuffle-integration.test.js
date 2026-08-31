const fs=require("fs");
const assert=require("assert");

const app=fs.readFileSync("app.js","utf8");
const shell=fs.readFileSync("site-shell.js","utf8");

assert(shell.includes('core/fair-shuffle.js?v=${VERSION}'),"site shell must load fair-shuffle before app.js");
assert(shell.indexOf('core/fair-shuffle.js?v=${VERSION}')<shell.indexOf('app.js?v=${VERSION}'),"fair-shuffle must load before app.js");
assert(app.includes("window.LyricTubeFairShuffle?.pickNext?.(queue,selectedSongId,Math.random)"),"shuffle path must use fair shuffle selector");
assert(!app.includes("choices[Math.floor(Math.random()*choices.length)]"),"legacy memoryless shuffle must not return");

console.log("fair shuffle integration guards passed");
