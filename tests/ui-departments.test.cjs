const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const Judging=require('../lib/core.cjs'),JudgingPrint=require('../lib/print.cjs');
function harness(){
 const html=fs.readFileSync(path.join(__dirname,'../index.template.html'),'utf8');
 const start=html.indexOf("'use strict';"),end=html.indexOf('(async()=>{if(token)');
 assert(start>=0&&end>start);
 const memory=new Map(),elements=new Map(),intervals=[],listeners={};
 const node=()=>({innerHTML:'',textContent:'',value:'',dataset:{},files:[],classList:{add(){},remove(){},toggle(){}},setAttribute(){},querySelectorAll:()=>[],querySelector:()=>node(),showModal(){},close(){},click(){},after(){}});
 const select=s=>{if(!elements.has(s))elements.set(s,node());return elements.get(s);};
 const ctx=vm.createContext({Judging,JudgingPrint,location:{protocol:'https:'},document:{querySelector:select,querySelectorAll:()=>[],createElement:node,body:node(),hidden:false},window:{addEventListener:(name,fn)=>listeners[name]=fn,print(){}},localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},setTimeout:()=>1,clearTimeout(){},setInterval:fn=>intervals.push(fn),console,AbortSignal,URL,Blob,Response,confirm:()=>true,prompt:()=>null});
 vm.runInContext(html.slice(start,end),ctx);
 return {run:s=>vm.runInContext(s,ctx),memory,elements,ctx,poll:()=>intervals[0]()};
}

test('browser drafts remain separate across department1 through department5 and legacy event',()=>{
 const h=harness();
 for(let id=1;id<=5;id++){
  h.ctx.id=id;h.run("adopt(Judging.create(Judging.departmentData(id)).initial());role='j1';setDraft();draft.p1[0]=id;dirty=true;persistDraft();");
 }
 assert.equal(h.memory.size,5);
 for(let id=1;id<=5;id++){
  h.ctx.id=id;h.run("adopt(Judging.create(Judging.departmentData(id)).initial());role='j1';setDraft();recoverDraft();");
  assert.equal(h.run('draft.p1[0]'),id);assert.equal(h.run('dirty'),true);
 }
 h.run("adopt(Judging.initial());role='j1';setDraft();recoverDraft();");
 assert.equal(h.run('draft.p1[0]'),null);assert.equal(h.run('dirty'),false);
});

test('monitor, scoring and final results support ten judges, thirty targets and escaped custom labels',()=>{
 const h=harness();
 h.run(`let config=Judging.departmentData(3);config.event='<img src=x onerror=alert(1)>';
 config.projects=Array.from({length:30},(_,i)=>({...config.projects[0],id:'p'+(i+1),name:i?'대상'+(i+1):'<script>alert(1)</script>',category:'일반 <분야>'}));
 adopt(Judging.create(config).initial());role='admin';connected=true;`);
 const monitor=h.run('monitor()');
 assert.equal((monitor.match(/data-admin-edit=/g)||[]).length,10);assert.match(monitor,/1500개 평가항목/);assert.match(monitor,/&lt;script&gt;/);assert.doesNotMatch(monitor,/<script>/);assert.doesNotMatch(monitor,/<img/);
 h.run("role='j10';setDraft();selected='p30';");const scoring=h.run('scoring()');
 assert.equal((scoring.match(/data-project=/g)||[]).length,30);assert.equal((scoring.match(/data-score=/g)||[]).length,5);assert.match(scoring,/150항목/);assert.match(scoring,/심사10/);
 h.run(`role='admin';for(const j of D.judges){state=C.mutate(state,j.id,{type:'save',expectedRevision:0,scores:Object.fromEntries(D.projects.map(p=>[p.id,Array(5).fill(20)]))});state=C.mutate(state,j.id,{type:'submit',expectedRevision:1});}state=C.mutate(state,'admin',{type:'finalize'});`);
 const results=h.run('results()');assert.match(results,/합계 \/ 1000/);assert.match(results,/합계 ÷ 10/);assert.match(results,/심사위원 10명 · 30개 대상/);assert.match(results,/100\.00/);assert.doesNotMatch(results,/<script>/);
});

test('configuration refresh retains obsolete dirty scores as a backup and adopts the new target list',async()=>{
 const h=harness();
 h.run(`adopt(Judging.create(Judging.departmentData(1)).initial());role='j1';token='dept:1:j1';connected=true;view='score';selected='p6';setDraft();draft.p6[0]=17;dirty=true;persistDraft();
 let changed=C.clone(D);changed.projects=changed.projects.slice(0,2);let configured=C.mutate(state,'admin',{type:'configure',config:changed,expectedRevision:0});api=async()=>({role:'j1',departmentId:1,state:configured});`);
 await h.poll();
 assert.equal(h.run('dirty'),false);assert.equal(h.run('selected'),'p1');assert.deepEqual(Array.from(h.run('Object.keys(draft)')),['p1','p2']);
 assert.equal(h.run('recoveryCandidate.scores.p6[0]'),17);assert.equal(h.run('draft.p1[0]'),null);assert.match(h.run('scoring()'),/복구 백업 다운로드/);
});

test('late server response from a prior department cannot replace the newly selected room',async()=>{
 const h=harness();
 h.run(`adopt(Judging.create(Judging.departmentData(1)).initial());role='admin';token='dept:1:admin';connected=true;
 const staleState=C.clone(state);staleState.revision=20;let resolveGet;fetch=()=>new Promise(resolve=>resolveGet=resolve);`);
 const pending=h.poll();
 h.run("token='dept:2:admin';adopt(Judging.create(Judging.departmentData(2)).initial());role='admin';connected=true;resolveGet(Response.json({role:'admin',departmentId:1,state:staleState}));");
 await pending;
 assert.equal(h.run('departmentId'),2);assert.equal(h.run('state.config.departmentId'),2);assert.equal(h.run('token'),'dept:2:admin');assert.equal(h.run('connected'),true);
});

test('printing after a clean configuration change also refreshes the underlying scoring form',async()=>{
 const h=harness();
 h.run(`adopt(Judging.create(Judging.departmentData(1)).initial());role='j1';token='dept:1:j1';connected=true;view='score';selected='p6';setDraft();render();
 let revisedConfig=C.clone(D);revisedConfig.projects=revisedConfig.projects.slice(0,2);let revised=C.mutate(state,'admin',{type:'configure',config:revisedConfig,expectedRevision:0});api=async()=>({role:'j1',departmentId:1,state:revised});`);
 await h.run("printBallot('j1')");
 assert.deepEqual(Array.from(h.run('Object.keys(draft)')),['p1','p2']);assert.equal(h.run('selected'),'p1');
 assert.equal((h.elements.get('#main').innerHTML.match(/data-project=/g)||[]).length,2);
});

test('removed judge with unsaved input returns to role selection with a recoverable backup',async()=>{
 const h=harness();
 h.run(`adopt(Judging.create(Judging.departmentData(1)).initial());role='j10';token='dept:1:j10';connected=true;view='score';setDraft();draft.p1[0]=19;dirty=true;persistDraft();api=async()=>{const e=Error('현재 사용 중인 심사위원을 선택해 주세요.');e.status=403;throw e;};`);
 await h.poll();
 assert.equal(h.run('token'),'');assert.equal(h.run('dirty'),false);assert.equal(h.run('role'),'admin');assert.equal(h.run('recoveryCandidate.judge'),'j10');assert.equal(h.run('recoveryCandidate.scores.p1[0]'),19);assert.match(h.elements.get('#main').innerHTML,/homeRecovery/);
});
