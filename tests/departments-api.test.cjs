const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../lib/core.cjs');
const clone=x=>structuredClone(x);

async function fixture(){
 const {createHandler}=await import('../supabase/functions/judging-state/handler.mjs');
 const rows=new Map([['hwaseong-2026-final',C.initial()]]);
 const operations=[];
 const request=async(url,opt)=>{
  const u=new URL(url);operations.push({url,method:opt.method,body:opt.body&&JSON.parse(opt.body),prefer:opt.headers.Prefer});
  if(u.pathname.endsWith('hwaseong_judging_codes')){
   const role=u.searchParams.get('role')?.slice(3);
   return Response.json(role==='admin'||C.DATA.judges.some(j=>j.id===role)?[{role,event_id:'hwaseong-2026-final'}]:[]);
  }
  assert(u.pathname.endsWith('hwaseong_judging_events'));
  if(opt.method==='POST'){
   const body=JSON.parse(opt.body);
   assert.equal(u.searchParams.get('on_conflict'),'event_id');
   assert.equal(opt.headers.Prefer,'resolution=ignore-duplicates,return=representation');
   if(rows.has(body.event_id))return Response.json([]);
   rows.set(body.event_id,clone(body.state));return Response.json([body]);
  }
  const eventId=u.searchParams.get('event_id')?.slice(3);
  const state=rows.get(eventId);
  if(opt.method==='GET')return Response.json(state?[{state:clone(state),revision:state.revision}]:[]);
  assert.equal(opt.method,'PATCH');
  if(!state||state.revision!==Number(u.searchParams.get('revision')?.slice(3)))return Response.json([]);
  const body=JSON.parse(opt.body);rows.set(eventId,clone(body.state));return Response.json([body]);
 };
 const handler=createHandler(C,k=>({SUPABASE_URL:'https://test.invalid',SUPABASE_SECRET_KEYS:'{"default":"sb_secret_test"}'}[k]),request);
 async function tokenCall(token,body){
  const res=await handler(new Request('https://test.invalid',{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
  return {code:res.status,data:await res.json()};
 }
 const call=(department,role='admin',body)=>tokenCall('dept:'+department+':'+role,body);
 return {rows,operations,call,tokenCall};
}
function scores(config,value=20){return Object.fromEntries(config.projects.map(p=>[p.id,config.criteria.map(()=>value)]));}

test('five department rooms initialize independently, race safely, and only accept explicit room/role selectors',async()=>{
 const f=await fixture();
 const started=await Promise.all([f.call(1),f.call(1),...Array.from({length:4},(_,i)=>f.call(i+2))]);
 assert(started.every(x=>x.code===200));
 assert.equal(f.rows.size,6);
 for(let id=1;id<=5;id++){
  const result=await f.call(id,'j10');assert.equal(result.code,200);assert.equal(result.data.departmentId,id);assert.equal(result.data.role,'j10');
  assert.equal(result.data.state.config.departmentId,id);assert.equal(result.data.state.config.departmentName,'부서'+id);
  assert.equal(result.data.state.config.judges.length,10);assert.equal(result.data.state.config.judges[9].name,'심사10');
  assert.equal(result.data.state.ballots.j1.scores,null);assert.ok(result.data.state.ballots.j10.scores);
  assert.deepEqual(result.data.state.audit,[]);
 }
 const before=clone(f.rows.get('hwaseong-dept-1'));
 await Promise.all([f.call(1),f.call(1)]);
 assert.deepEqual(f.rows.get('hwaseong-dept-1'),before);
 for(const token of ['dept:0:admin','dept:6:admin','dept:01:admin','dept:1:j0','dept:1:j11','dept:1:owner','dept:1:admin:extra','dept:1:j1:2'])assert.equal((await f.tokenCall(token)).code,401,token);
 assert.equal(f.operations.filter(x=>x.url.includes('hwaseong_judging_codes')).length,0);
});

test('ten simultaneous saves, admin edits and resets stay in their department with stale-draft checks',async()=>{
 const f=await fixture();await Promise.all([f.call(1),f.call(2)]);
 const other=clone(f.rows.get('hwaseong-dept-2'));const legacy=clone(f.rows.get('hwaseong-2026-final'));
 const config=f.rows.get('hwaseong-dept-1').config;
 const saved=await Promise.all(config.judges.map((j,i)=>f.call(1,j.id,{type:'save',expectedRevision:0,scores:scores(config,20-i)})));
 assert(saved.every(x=>x.code===200),JSON.stringify(saved));
 const admin=await f.call(1);assert.deepEqual(config.judges.map(j=>admin.data.state.ballots[j.id].scores[config.projects[0].id][0]),[20,19,18,17,16,15,14,13,12,11]);
 assert.equal((await f.call(1,'j1',{type:'save',expectedRevision:0,scores:scores(config)})).code,409);
 assert.equal((await f.call(1,'j1',{type:'admin_save',judgeId:'j10',expectedRevision:1,reason:'오입력 수정',scores:scores(config,8)})).code,403);
 const edited=await f.call(1,'admin',{type:'admin_save',judgeId:'j10',expectedRevision:1,reason:'오입력 수정',scores:scores(config,8)});
 assert.equal(edited.code,200);assert.equal(edited.data.state.ballots.j10.scores[config.projects[0].id][0],8);
 assert.equal((await f.call(1,'j10',{type:'save',expectedRevision:1,scores:scores(config)})).code,409);
 const reset={type:'reset',expectedRevision:edited.data.state.revision,reason:'연습 종료',confirmation:'전체 초기화'};
 assert.equal((await f.call(1,'j2',reset)).code,403);
 const resetResult=await f.call(1,'admin',reset);assert.equal(resetResult.code,200);
 assert.equal((await f.call(1,'admin',reset)).code,409);
 for(const ballot of Object.values(resetResult.data.state.ballots))assert.equal(C.create(config).filled(ballot.scores),0);
 assert(resetResult.data.state.audit.some(x=>x.type==='admin_score_change'));
 assert(resetResult.data.state.audit.some(x=>x.type==='reset_snapshot'));
 assert.deepEqual(f.rows.get('hwaseong-dept-2'),other);assert.deepEqual(f.rows.get('hwaseong-2026-final'),legacy);
});

test('department configuration and legacy name access preserve their scopes and reject inactive judges',async()=>{
 const f=await fixture();await Promise.all([f.call(1),f.call(2)]);
 const initial=clone(f.rows.get('hwaseong-dept-1'));
 const other=clone(f.rows.get('hwaseong-dept-2'));
 for(const selector of [{event_id:'hwaseong-dept-2'},{eventId:'hwaseong-dept-2'},{departmentId:2}]){
  const r=await f.call(1,'admin',{type:'reset',expectedRevision:0,reason:'연습 종료',confirmation:'전체 초기화',...selector});assert.equal(r.code,400);
 }
 const mismatch=clone(initial.config);mismatch.departmentId=2;mismatch.departmentName='부서2';
 assert.equal((await f.call(1,'admin',{type:'configure',config:mismatch,expectedRevision:0})).code,400);
 assert.deepEqual(f.rows.get('hwaseong-dept-1'),initial);assert.deepEqual(f.rows.get('hwaseong-dept-2'),other);
 const config=clone(initial.config);config.event='부서1 자체 심사';config.judges=config.judges.slice(0,4);
 const configured=await f.call(1,'admin',{type:'configure',config,expectedRevision:0});
 assert.equal(configured.code,200,JSON.stringify(configured));assert.equal(configured.data.state.config.judges.length,4);
 assert.equal((await f.call(1,'j10')).code,403);assert.equal((await f.call(2,'j10')).code,200);
 assert.equal((await f.call(1,'admin',{type:'configure',config,expectedRevision:0})).code,409);
 assert.deepEqual(f.rows.get('hwaseong-dept-2'),other);
 const legacy=await f.tokenCall('name:'+encodeURIComponent('전명구'));assert.equal(legacy.code,200);assert.equal(legacy.data.role,'admin');assert.equal(legacy.data.departmentId,null);assert.equal(Object.keys(legacy.data.state.ballots).length,5);
 const legacyJudge=await f.tokenCall('name:'+encodeURIComponent(C.DATA.judges[0].name));assert.equal(legacyJudge.code,200);assert.equal(legacyJudge.data.state.ballots.j2.scores,null);
 const corrupted=clone(f.rows.get('hwaseong-dept-1'));corrupted.config.departmentId=2;f.rows.set('hwaseong-dept-1',corrupted);
 assert.equal((await f.call(1)).code,503);
});
