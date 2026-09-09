const {test}=require('node:test');const assert=require('node:assert/strict');const handler=require('../api/state.js');const C=require('../lib/core.cjs');
test('API auth, parallel five-judge writes, visibility, lock and storage failure',async()=>{
 const original=global.fetch,env={...process.env};let stored=null;
 process.env.UPSTASH_REDIS_REST_URL='https://test.invalid';process.env.UPSTASH_REDIS_REST_TOKEN='test-store';process.env.ADMIN_TOKEN='admin-'+('x'.repeat(30));
 const codes=Object.fromEntries(C.DATA.judges.map(j=>[j.id,j.id+'-'+('x'.repeat(30))]));process.env.JUDGE_TOKENS=JSON.stringify(codes);
 global.fetch=async(url,opt)=>{const cmd=JSON.parse(opt.body);if(cmd[0]==='GET')return {ok:true,json:async()=>({result:stored})};if(cmd[0]==='EVAL'){const match=(stored||'')===cmd[4];if(match)stored=cmd[5];return {ok:true,json:async()=>({result:match?1:0})};}throw Error('Unexpected Redis command');};
 async function call(role,body,customToken){const req={method:body?'POST':'GET',headers:{authorization:'Bearer '+(customToken??(role==='admin'?process.env.ADMIN_TOKEN:codes[role])),'content-type':'application/json'},body};const res={setHeader(){},status(n){this.code=n;return this;},json(data){this.data=data;return this;}};await handler(req,res);return res;}
 try{
  assert.equal((await call('admin',undefined,'wrong')).code,401);
  const unauthorized=await call('j1',{type:'finalize'});assert.equal(unauthorized.code,403);
  const out=await Promise.all(C.DATA.judges.map((j,i)=>call(j.id,{type:'save',expectedRevision:0,scores:Object.fromEntries(C.DATA.projects.map(p=>[p.id,Array(5).fill(20-i)]))})));
  assert.deepEqual(out.map(x=>x.code),[200,200,200,200,200]);
  const admin=await call('admin');assert.deepEqual(C.DATA.judges.map(j=>admin.data.state.ballots[j.id].scores.p1[0]),[20,19,18,17,16]);
  assert.equal((await call('j1')).data.state.ballots.j2.scores,null);
  const stale=await call('j1',{type:'save',expectedRevision:0,scores:C.blankScores()});assert.equal(stale.code,409);
  assert.equal((await call('admin',{type:'finalize'})).code,400);
  assert.deepEqual((await Promise.all(C.DATA.judges.map(j=>call(j.id,{type:'submit',expectedRevision:1})))).map(x=>x.code),[200,200,200,200,200]);
  const final=await call('admin',{type:'finalize'});assert.equal(final.code,200);assert.equal(C.ranking(final.data.state)[0].sum,450);
  assert.equal((await call('j1',{type:'save',expectedRevision:2,scores:C.blankScores()})).code,409);
  global.fetch=async()=>{throw Error('offline');};assert.equal((await call('admin')).code,503);
 }finally{global.fetch=original;for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env);}
});
