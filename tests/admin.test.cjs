const {test}=require('node:test');const assert=require('node:assert/strict');const C=require('../lib/core.cjs');const P=require('../lib/print.cjs');
const scores=()=>Object.fromEntries(C.DATA.projects.map(p=>[p.id,Array(5).fill(20)]));
test('admin correction and reset preserve audit, invalidate finalization and reject stale drafts',()=>{
 let s=C.initial();for(const j of C.DATA.judges){s=C.mutate(s,j.id,{type:'save',scores:scores(),expectedRevision:0});s=C.mutate(s,j.id,{type:'submit',expectedRevision:1});}s=C.mutate(s,'admin',{type:'finalize'});
 const changed=scores();changed.p1[0]=10;
 assert.throws(()=>C.mutate(s,'j2',{type:'admin_save',judgeId:'j1',scores:changed,expectedRevision:2,reason:'정정'}));
 const edited=C.mutate(s,'admin',{type:'admin_save',judgeId:'j1',scores:changed,expectedRevision:2,reason:'오입력 정정'});assert.equal(edited.finalized,false);assert.equal(edited.ballots.j1.submitted,true);assert.equal(edited.audit.at(-2).before.p1[0],20);
 assert.throws(()=>C.mutate(edited,'admin',{type:'admin_save',judgeId:'j1',scores:changed,expectedRevision:2,reason:'정정'}));
 const final=C.mutate(edited,'admin',{type:'finalize'});assert.equal(C.ranking(final).find(p=>p.id==='p1').sum,490);
 assert(!P.render(final).includes('대강당'));assert(!P.ballot(final,'j1').includes('대강당'));
 const action={type:'reset',reason:'연습 종료',confirmation:'전체 초기화',expectedRevision:final.revision};
 assert.throws(()=>C.mutate(final,'j1',action));assert.throws(()=>C.mutate(final,'admin',{...action,expectedRevision:0}));assert.throws(()=>C.mutate(final,'admin',{...action,confirmation:'예'}));
 const reset=C.mutate(final,'admin',action);for(const j of C.DATA.judges){assert.equal(C.filled(reset.ballots[j.id].scores),0);assert.equal(reset.ballots[j.id].submitted,false);assert(reset.ballots[j.id].revision>final.ballots[j.id].revision);}assert.equal(reset.finalized,false);assert.equal(reset.audit.at(-2).type,'reset_snapshot');
 assert.throws(()=>C.mutate(reset,'j1',{type:'save',scores:changed,expectedRevision:final.ballots.j1.revision}));
});
