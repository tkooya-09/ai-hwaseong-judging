(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./data.json'));else root.Judging=factory(root.EVENT_DATA);})(typeof window!=='undefined'?window:globalThis,function(DATA){
  const clone=x=>JSON.parse(JSON.stringify(x));
  const fail=(message,status=400)=>{const e=new Error(message);e.status=status;throw e;};
  const blankScores=()=>Object.fromEntries(DATA.projects.map(p=>[p.id,Array(5).fill(null)]));
  const initial=()=>({schema:1,revision:0,finalized:false,finalizedAt:null,updatedAt:null,ballots:Object.fromEntries(DATA.judges.map(j=>[j.id,{revision:0,scores:blankScores(),submitted:false,submittedAt:null,updatedAt:null}])),audit:[]});
  const valid=n=>typeof n==='number'&&Number.isInteger(n)&&n>=0&&n<=20;
  const filled=s=>DATA.projects.reduce((n,p)=>n+s[p.id].filter(valid).length,0);
  const total=a=>a.every(valid)?a.reduce((x,y)=>x+y,0):null;
  function validate(scores){if(!scores||typeof scores!=='object'||Array.isArray(scores)||Object.keys(scores).length!==6)fail('6개 작품의 평가점수가 필요합니다.');for(const p of DATA.projects){const a=scores[p.id];if(!Array.isArray(a)||a.length!==5||a.some(n=>n!==null&&!valid(n)))fail('점수는 0~20 사이의 정수 또는 빈칸이어야 합니다.');}}
  function mutate(state,role,action,now=new Date().toISOString()){
    const s=clone(state);const admin=role==='admin';const b=s.ballots[role];
    if(!admin&&!b)fail('접근 권한이 없습니다.',403);
    if(['save','submit'].includes(action.type)){
      if(!b)fail('심사위원만 점수를 입력할 수 있습니다.',403);
      if(s.finalized||b.submitted)fail('제출된 심사표는 수정할 수 없습니다.',409);
      if(action.expectedRevision!==b.revision)fail('다른 화면에서 심사표가 변경되었습니다. 미저장 점수를 백업하고 최신 점수를 다시 불러오세요.',409);
      if(action.type==='save'){validate(action.scores);b.scores=clone(action.scores);}
      if(action.type==='submit'){if(filled(b.scores)!==30)fail('6개 작품의 30개 항목을 모두 입력해야 합니다.');b.submitted=true;b.submittedAt=now;}
      b.revision++;b.updatedAt=now;
    }else if(action.type==='admin_save'||action.type==='reset'){
      if(!admin)fail('관리자만 점수를 수정하거나 초기화할 수 있습니다.',403);
      if(typeof action.reason!=='string'||action.reason.trim().length<2||action.reason.length>500)fail('사유를 2~500자로 입력하세요.');
      if(action.type==='reset'){
        if(action.confirmation!=='전체 초기화')fail('초기화 확인 문구가 일치하지 않습니다.');
        if(action.expectedRevision!==s.revision)fail('점수가 변경되었습니다. 최신 상태에서 다시 초기화하세요.',409);
        s.audit.push({at:now,role,type:'reset_snapshot',ballots:clone(s.ballots),finalized:s.finalized,finalizedAt:s.finalizedAt});
        for(const target of Object.values(s.ballots)){target.scores=blankScores();target.submitted=false;target.submittedAt=null;target.revision++;target.updatedAt=now;}
      }else{
        const target=s.ballots[action.judgeId];if(!target)fail('심사위원을 확인하세요.');
        if(action.expectedRevision!==target.revision)fail('해당 위원의 점수가 변경되었습니다. 창을 닫고 다시 열어 수정하세요.',409);
        validate(action.scores);
        s.audit.push({at:now,role,type:'admin_score_change',judgeId:action.judgeId,before:clone(target.scores),after:clone(action.scores),reason:action.reason});
        target.scores=clone(action.scores);target.revision++;target.updatedAt=now;
        if(filled(target.scores)!==30){target.submitted=false;target.submittedAt=null;}
      }
      s.finalized=false;s.finalizedAt=null;
    }else if(action.type==='finalize'){
      if(!admin)fail('운영자만 전체 심사를 완료할 수 있습니다.',403);
      if(s.finalized)fail('이미 완료된 심사입니다.',409);
      if(!Object.values(s.ballots).every(b=>b.submitted&&filled(b.scores)===30))fail('심사위원 5명 모두 심사표를 제출해야 합니다.');
      s.finalized=true;s.finalizedAt=now;
    }else if(action.type==='reopen'){
      if(!admin)fail('운영자만 수정 요청을 처리할 수 있습니다.',403);
      if(typeof action.reason!=='string'||action.reason.trim().length<2||action.reason.length>500)fail('수정 사유를 2~500자로 입력하세요.');
      const target=s.ballots[action.judgeId];if(!target)fail('심사위원을 확인하세요.');
      target.submitted=false;target.submittedAt=null;target.revision++;target.updatedAt=now;s.finalized=false;s.finalizedAt=null;
    }else fail('지원하지 않는 요청입니다.');
    s.revision++;s.updatedAt=now;
    s.audit.push({at:now,role,type:action.type,judgeId:action.judgeId||role,reason:action.reason||'',revision:s.revision});
    return s;
  }
  function visible(state,role){const s=clone(state);if(role!=='admin')for(const [id,b] of Object.entries(s.ballots))if(id!==role){b.filled=filled(b.scores);b.scores=null;}if(role!=='admin')s.audit=[];return s;}
  function ranking(state){if(!state.finalized)fail('전체 심사 완료 후 결과를 확인할 수 있습니다.');const result=[];
    for(const category of ['시민','공무원']){
      const list=DATA.projects.filter(p=>p.category===category).map(p=>{const scores=DATA.judges.map(j=>total(state.ballots[j.id].scores[p.id]));if(scores.some(x=>x===null))fail('미입력 점수가 있습니다.');const sum=scores.reduce((a,b)=>a+b,0);return {...p,scores,sum,average:sum/5};}).sort((a,b)=>b.sum-a.sum);
      list.forEach((p,i)=>{p.rank=1+list.filter(q=>q.sum>p.sum).length;p.tied=list.filter(q=>q.sum===p.sum).length>1;p.award=p.tied?'협의 필요':['대상','최우수상','우수상'][p.rank-1];});result.push(...list);
    }return result;
  }
  return {DATA,clone,initial,blankScores,valid,filled,total,validate,mutate,visible,ranking};
});
