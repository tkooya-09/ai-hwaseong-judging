const {test}=require('node:test');const assert=require('node:assert/strict');const {createHash}=require('node:crypto');const C=require('../lib/core.cjs');
test('Supabase API auth, parallel five-judge writes, visibility, lock and storage failure',async()=>{
 const {createHandler}=await import('../supabase/functions/judging-state/handler.mjs');
 let stored=C.initial();
 const adminCode='admin-'+('x'.repeat(30));
 const codes=Object.fromEntries(C.DATA.judges.map(j=>[j.id,j.id+'-'+('x'.repeat(30))]));
 const hashes=Object.fromEntries(Object.entries({admin:adminCode,...codes}).map(([role,token])=>[createHash('sha256').update(token).digest('hex'),role]));
 let offline=false;
 const request=async(url,opt)=>{
  if(offline)throw Error('offline');
  const u=new URL(url);
  if(u.pathname.endsWith('hwaseong_judging_codes')){const role=u.searchParams.has('token_hash')?hashes[u.searchParams.get('token_hash').slice(3)]:u.searchParams.get('role')?.slice(3);return Response.json(role?[{role,event_id:'test'}]:[]);}
  if(opt.method==='GET')return Response.json([{state:structuredClone(stored),revision:stored.revision}]);
  const expected=Number(u.searchParams.get('revision').slice(3));
  if(stored.revision!==expected)return Response.json([]);
  const next=JSON.parse(opt.body);stored=next.state;return Response.json([next]);
 };
 const handler=createHandler(C,k=>({SUPABASE_URL:'https://test.invalid',SUPABASE_SECRET_KEYS:'{"default":"sb_secret_test"}'}[k]),request);
 async function call(role,body,customToken){
  const req=new Request('https://test.invalid',{method:body?'POST':'GET',headers:{authorization:'Bearer '+(customToken??(role==='admin'?adminCode:codes[role])),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const res=await handler(req);return {code:res.status,data:await res.json()};
 }
 try{
  assert.equal((await call('admin',undefined,'wrong')).code,401);
  for(const j of C.DATA.judges){const r=await call(j.id,undefined,'name:'+encodeURIComponent(j.name));assert.equal(r.code,200);assert.equal(r.data.role,j.id);assert.equal(r.data.state.ballots[C.DATA.judges.find(x=>x.id!==j.id).id].scores,null);}
  assert.equal((await call('admin',undefined,'name:'+encodeURIComponent('운영자'))).code,401);
  const namedAdmin=await call('admin',undefined,'name:'+encodeURIComponent('전명구'));assert.equal(namedAdmin.code,200);assert.equal(namedAdmin.data.role,'admin');assert.ok(namedAdmin.data.state.ballots.j1.scores);
  assert.equal((await call('admin',undefined,'name:%ZZ')).code,401);
  assert.equal((await call('j1',{type:'finalize'},'name:'+encodeURIComponent(C.DATA.judges[0].name))).code,403);
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
  offline=true;assert.equal((await call('admin')).code,503);
 }finally{}
});
