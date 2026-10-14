const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../lib/core.cjs'),P=require('../lib/print.cjs');
const complete=(core,value=20)=>Object.fromEntries(core.DATA.projects.map(p=>[p.id,core.DATA.criteria.map(()=>value)]));
function configured(core,state,change){const config=core.clone(state.config);change(config);return core.mutate(state,'admin',{type:'configure',config,expectedRevision:state.revision});}
test('department templates isolate their identities and contain ten generic judges',()=>{
 for(let id=1;id<=5;id++){
  const d=C.departmentData(String(id)),core=C.create(d),state=core.initial();
  assert.equal(d.departmentId,id);assert.equal(d.departmentName,`부서${id}`);assert.equal(d.event,`부서${id} 심사`);assert.equal(d.date,'');
  assert.equal(d.judges.length,10);assert.equal(d.judges[9].name,'심사10');assert.equal(Object.keys(state.ballots).length,10);
  assert.equal(d.projects[5].name,'대상6');assert.deepEqual(state.config,d);assert.equal(state.ballots.j10.scores.p6.length,5);
 }
 assert.equal(C.initial().config,undefined);assert.equal(C.DATA.judges.length,5);
 assert.throws(()=>C.departmentData(6));assert.throws(()=>C.departmentData('x'));
});
test('configuration follows revisions, protects scored ballots and rejects stale removed/readded judges',()=>{
 let core=C.create(C.departmentData(2)),state=core.initial();
 const old=core.clone(state.config);
 assert.throws(()=>core.mutate(state,'j1',{type:'configure',config:old,expectedRevision:0}),/관리자/);
 assert.throws(()=>core.mutate(state,'admin',{type:'configure',config:C.departmentData(3),expectedRevision:0}),/다른 부서/);
 state=configured(core,state,d=>{d.event='부서 공통 심사';d.judges=d.judges.slice(0,2);d.projects=d.projects.slice(0,1);});core=C.create(state.config);
 assert.equal(state.ballots.j1.revision,1);assert.equal(state.ballots.j10,undefined);assert.equal(state.audit[0].type,'configuration_change');assert.equal(state.audit[0].before.judges.length,10);
 assert.throws(()=>core.mutate(state,'j1',{type:'save',expectedRevision:0,scores:complete(core)}),/다른 화면/);
 state=core.mutate(state,'j1',{type:'save',expectedRevision:1,scores:complete(core,0)});
 assert.throws(()=>configured(core,state,d=>{d.event='새 심사';}),/입력된 점수/);
 state=core.mutate(state,'admin',{type:'reset',expectedRevision:state.revision,confirmation:'전체 초기화',reason:'다음 심사 준비'});
 state=configured(core,state,d=>{d.judges=C.departmentData(2).judges;});core=C.create(state.config);
 assert.equal(state.ballots.j10.revision,state.revision);assert(state.ballots.j10.revision>0);
 assert.throws(()=>core.mutate(state,'j10',{type:'save',expectedRevision:0,scores:complete(core)}),/다른 화면/);
 assert.throws(()=>core.mutate(state,'admin',{type:'configure',config:state.config,expectedRevision:0}),/최신 상태/);
 for(const action of [undefined,null,[],42,{}])assert.throws(()=>core.mutate(state,'admin',action));
});
test('configuration validates counts, limits, identity, URL schemes and generates judge labels',()=>{
 const base=C.departmentData(1),core=C.create(base);
 const invalid=[d=>{d.projects=[];},d=>{d.projects[0].id='p2';},d=>{d.projects[0].url='javascript:alert(1)';},d=>{d.projects[0].url='https://user:password@example.com';},d=>{d.criteria[0].max=100;},d=>{d.criteria=[];},d=>{d.judges=[];},d=>{d.judges.push({});},d=>{d.event=' ';},d=>{d.date='a'.repeat(41);},d=>{d.departmentName='타부서';}];
 for(const change of invalid){const d=core.clone(base);change(d);assert.throws(()=>core.mutate(core.initial(),'admin',{type:'configure',config:d,expectedRevision:0}));}
 const d=core.clone(base);d.judges[0].name='사람 이름';d.projects[0].url='https://example.com/path';
 const state=core.mutate(core.initial(),'admin',{type:'configure',config:d,expectedRevision:0});assert.equal(state.config.judges[0].name,'심사1');
 assert.throws(()=>C.mutate(C.initial(),'admin',{type:'configure',config:d,expectedRevision:0}),/부서별/);
});
test('ten judges aggregate 1000 points, masking includes j10 and print keeps all signatures',()=>{
 const core=C.create(C.departmentData(5));let state=core.initial();
 for(const j of core.DATA.judges){state=core.mutate(state,j.id,{type:'save',scores:complete(core),expectedRevision:0});state=core.mutate(state,j.id,{type:'submit',expectedRevision:1});}
 const view=core.visible(state,'j1');assert.equal(view.ballots.j10.scores,null);assert.equal(view.ballots.j10.filled,30);
 state=core.mutate(state,'admin',{type:'finalize'});for(const row of core.ranking(state)){assert.equal(row.sum,1000);assert.equal(row.average,100);assert.equal(row.award,'협의 필요');}
 const html=P.render(state);assert.match(html,/1000점/);assert.equal((html.match(/자필 서명란/g)||[]).length,10);assert(!html.includes('정희석'));assert(!html.includes('시민·공무원 최종 발표심사'));
 assert.match(P.ballot(state,'j10'),/심사10/);assert(!P.ballot(state,'j10').includes('2026년 9월 17일'));
 assert.equal((P.signatures(state).match(/자필 서명란/g)||[]).length,10);
});
test('custom counts and categories rank independently with safe lower awards and multiple print pages',()=>{
 const d=C.departmentData(1);d.judges=d.judges.slice(0,3);d.projects=Array.from({length:30},(_,i)=>({...d.projects[0],id:`p${i+1}`,name:`심사대상${i+1}`,category:i<20?'제안':'평가'}));d.event='<script>alert(1)</script>';
 const core=C.create(d);let state=core.initial();
 for(const j of d.judges){const scores=complete(core,10);scores.p1.fill(20);scores.p2.fill(19);scores.p3.fill(18);scores.p4.fill(17);for(let i=5;i<=20;i++)scores[`p${i}`].fill(i%10);state=core.mutate(state,j.id,{type:'save',scores,expectedRevision:0});state=core.mutate(state,j.id,{type:'submit',expectedRevision:1});}
 state=core.mutate(state,'admin',{type:'finalize'});const rows=core.ranking(state);assert.equal(rows.find(r=>r.id==='p1').sum,300);assert.equal(rows.find(r=>r.id==='p1').average,100);assert.equal(rows.find(r=>r.id==='p4').award,'—');assert.equal(rows.find(r=>r.id==='p21').rank,1);
 const result=P.render(state),ballot=P.ballot(state,'j1');assert.equal((result.match(/<article /g)||[]).length,5);assert.equal((ballot.match(/<article /g)||[]).length,3);assert(!result.includes('<script>'));assert(result.includes('&lt;script&gt;'));assert(!result.includes('undefined'));assert.match(ballot,/심사대상30/);
});
