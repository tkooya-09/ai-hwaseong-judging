const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const C=require('../lib/core.cjs'),P=require('../lib/print.cjs');
function harness(){
 const html=fs.readFileSync(require('node:path').join(__dirname,'../index.template.html'),'utf8');
 const source=html.slice(html.indexOf("'use strict';"),html.indexOf('function updateSave()'));
 const memory=new Map(),element={classList:{add(){},remove(){}}};
 const ctx=vm.createContext({Judging:C,location:{protocol:'https:'},document:{querySelector:()=>element},localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},sessionStorage:{getItem:()=>null},setTimeout:()=>0,clearTimeout(){},console,AbortSignal});
 vm.runInContext(source+'\nfunction updateSave(){}; role="j1";setDraft();',ctx);
 return {run:s=>vm.runInContext(s,ctx),memory,ctx};
}
test('reload recovers only matching unsubmitted draft; stale input never overwrites server',()=>{
 const h=harness();
 h.run('draft.p1[0]=0;dirty=true;persistDraft();setDraft();recoverDraft();');
 assert.equal(h.run('draft.p1[0]'),0);assert.equal(h.run('dirty'),true);
 h.run('state.ballots.j1.revision=1;state.ballots.j1.scores.p1[0]=19;setDraft();recoverDraft();');
 assert.equal(h.run('draft.p1[0]'),19);assert.equal(h.run('dirty'),false);assert.equal(h.run('recoveryCandidate.scores.p1[0]'),0);
});
test('failed request keeps pending input and retry clears it only on success',async()=>{
 const h=harness();h.run('draft.p1[0]=18;dirty=true;persistDraft();api=async()=>{throw Error("offline")};');
 await assert.rejects(h.run('flush()'),/offline/);assert.equal(h.run('dirty'),true);assert.equal(h.memory.size,1);
 h.run('api=async action=>({role,state:C.mutate(state,role,action)});');
 await h.run('flush()');assert.equal(h.run('dirty'),false);assert.equal(h.memory.size,0);assert.equal(h.run('state.ballots.j1.scores.p1[0]'),18);
});
test('input edited during a save is retained and sent in the next revision',async()=>{
 const h=harness();h.run('draft.p1[0]=10;dirty=true;persistDraft();let resolveSave;let calls=0;api=action=>{calls++;if(calls===1)return new Promise(resolve=>{resolveSave=()=>resolve({role,state:C.mutate(state,role,action)})});return Promise.resolve({role,state:C.mutate(state,role,action)});};');
 const pending=h.run('flush()');h.run('draft.p1[0]=20;editVersion++;persistDraft();resolveSave();');await pending;
 assert.equal(h.run('state.ballots.j1.scores.p1[0]'),20);assert.equal(h.run('draftRevision'),2);assert.equal(h.run('dirty'),false);
});
test('individual print differentiates blank and zero; final results keep all five signatures',()=>{
 let s=C.initial();s.ballots.j1.scores.p1[0]=0;
 const draft=P.ballot(s,'j1');assert.match(draft,/미제출 · 확인용/);assert.match(draft,/<td>0<\/td>/);assert.match(draft,/<td>미입력<\/td>/);
 for(const j of C.DATA.judges){s=C.mutate(s,j.id,{type:'save',expectedRevision:0,scores:Object.fromEntries(C.DATA.projects.map(p=>[p.id,Array(5).fill(20)]))});s=C.mutate(s,j.id,{type:'submit',expectedRevision:1});}
 assert.match(P.ballot(s,'j1'),/제출 완료/);
 s=C.mutate(s,'admin',{type:'finalize'});
 assert.equal((P.render(s).match(/자필 서명란/g)||[]).length,5);
 assert.throws(()=>P.ballot(C.visible(s,'j1'),'j2'),/출력할 심사표/);
});

