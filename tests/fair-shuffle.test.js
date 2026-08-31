const assert=require("assert");
const {candidatePool,pickNext}=require("../core/fair-shuffle.js");

const song=(id,lastPlayedAt=null,playCount=0)=>({id,lastPlayedAt,playCount});

{
  const queue=[song("current","2026-08-31T09:00:00Z"),song("never-a"),song("played","2026-08-30T09:00:00Z"),song("never-b")];
  const pool=candidatePool(queue,"current");
  assert.deepStrictEqual(pool.map(x=>x.id),["never-a","never-b"],"never-played tracks must be selected before repeated tracks");
  assert.strictEqual(pickNext(queue,"current",()=>0).id,"never-a");
  assert.strictEqual(pickNext(queue,"current",()=>0.999).id,"never-b");
}

{
  const queue=[
    song("current","2026-08-31T10:00:00Z"),
    song("a","2026-08-20T10:00:00Z"),
    song("b","2026-08-21T10:00:00Z"),
    song("c","2026-08-22T10:00:00Z"),
    song("d","2026-08-29T10:00:00Z"),
    song("e","2026-08-30T10:00:00Z"),
    song("f","2026-08-31T08:00:00Z")
  ];
  const pool=candidatePool(queue,"current");
  assert.deepStrictEqual(pool.map(x=>x.id),["a","b","c"],"shuffle should randomize inside the least-recently-played window");
  assert(!pool.some(x=>x.id==="current"),"current track must never be a shuffle candidate");
}

{
  assert.strictEqual(pickNext([song("only")],"only",()=>0.5),null,"single-track queue must not invent another candidate");
}

console.log("fair shuffle tests passed");
