(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./data.json'));else root.Judging=factory(root.EVENT_DATA);})(typeof window!=='undefined'?window:globalThis,function(DATA){
  const clone=x=>JSON.parse(JSON.stringify(x));
  const fail=(message,status=400)=>{const e=new Error(message);e.status=status;throw e;};
  const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
  function departmentData(id){
    const departmentId=Number(id);if(!Number.isInteger(departmentId)||departmentId<1||departmentId>5)fail('부서를 확인하세요.');
    const departmentName=`부서${departmentId}`;
    return {departmentId,departmentName,event:`${departmentName} 심사`,date:'',projects:Array.from({length:6},(_,i)=>({id:`p${i+1}`,name:`대상${i+1}`,category:'일반',presenter:'',field:'',description:'',url:''})),judges:Array.from({length:10},(_,i)=>({id:`j${i+1}`,name:`심사${i+1}`,affiliation:''})),criteria:DATA.criteria.map((c,i)=>({name:c.name,max:20,description:['내용의 독창성과 차별성','투입 대비 성과와 효과','적용 및 활용 가능한 범위','지속적인 운영과 발전 가능성','실행 가능성과 완성도'][i]}))};
  }
  function textField(value,label,max,required=false){
    if(typeof value!=='string'||value.length>max||(required&&!value.trim()))fail(`${label} 입력 내용을 확인하세요. (최대 ${max}자)`);
    return value.trim();
  }
  function validateConfig(config,departmentId){
    if(!config||typeof config!=='object'||Array.isArray(config))fail('심사 설정을 확인하세요.');
    if(!Number.isInteger(departmentId)||departmentId<1||departmentId>5||config.departmentId!==departmentId||config.departmentName!==`부서${departmentId}`)fail('다른 부서의 설정으로 변경할 수 없습니다.');
    if(!Array.isArray(config.projects)||config.projects.length<1||config.projects.length>30)fail('심사대상은 1~30개로 설정하세요.');
    if(!Array.isArray(config.judges)||config.judges.length<1||config.judges.length>10)fail('심사위원은 1~10명으로 설정하세요.');
    if(!Array.isArray(config.criteria)||config.criteria.length!==5)fail('평가항목은 5개로 설정하세요.');
    const projects=config.projects.map((p,i)=>{
      if(!p||typeof p!=='object'||Array.isArray(p)||p.id!==`p${i+1}`)fail('심사대상 번호를 확인하세요.');
      const url=textField(p.url??'','링크',2000);
      if(url){let parsed;try{parsed=new URL(url);}catch{fail('링크는 http 또는 https 주소로 입력하세요.');}if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)fail('링크는 http 또는 https 주소로 입력하세요.');}
      return {id:p.id,name:textField(p.name,'심사대상명',120,true),category:textField(p.category,'부문',40,true),presenter:textField(p.presenter??'','발표자',100),field:textField(p.field??'','분야',100),description:textField(p.description??'','설명',2000),url};
    });
    const criteria=config.criteria.map(c=>{
      if(!c||typeof c!=='object'||Array.isArray(c)||c.max!==20)fail('평가항목별 배점은 20점이어야 합니다.');
      return {name:textField(c.name,'평가항목명',40,true),max:20,description:textField(c.description??'','평가기준',1000)};
    });
    return {departmentId,departmentName:`부서${departmentId}`,event:textField(config.event,'심사명',100,true),date:textField(config.date??'','심사일',40),projects,criteria,judges:Array.from({length:config.judges.length},(_,i)=>({id:`j${i+1}`,name:`심사${i+1}`,affiliation:''}))};
  }
  function create(data){
    const D=data.departmentId!==undefined?validateConfig(data,data.departmentId):clone(data);
    const itemCount=D.projects.length*D.criteria.length;
    const blankScores=()=>Object.fromEntries(D.projects.map(p=>[p.id,Array(D.criteria.length).fill(null)]));
    const initial=()=>({schema:1,revision:0,finalized:false,finalizedAt:null,updatedAt:null,...(D.departmentId!==undefined?{config:clone(D)}:{}),ballots:Object.fromEntries(D.judges.map(j=>[j.id,{revision:0,scores:blankScores(),submitted:false,submittedAt:null,updatedAt:null}])),audit:[]});
    const valid=n=>typeof n==='number'&&Number.isInteger(n)&&n>=0&&n<=20;
    const filled=s=>D.projects.reduce((n,p)=>n+(Array.isArray(s?.[p.id])?s[p.id].filter(valid).length:0),0);
    const total=a=>Array.isArray(a)&&a.length===D.criteria.length&&a.every(valid)?a.reduce((x,y)=>x+y,0):null;
    function validate(scores){if(!scores||typeof scores!=='object'||Array.isArray(scores)||Object.keys(scores).length!==D.projects.length)fail(`${D.projects.length}개 심사대상의 평가점수가 필요합니다.`);for(const p of D.projects){const a=scores[p.id];if(!own(scores,p.id)||!Array.isArray(a)||a.length!==D.criteria.length||a.some(n=>n!==null&&!valid(n)))fail('점수는 0~20 사이의 정수 또는 빈칸이어야 합니다.');}}
    function mutate(state,role,action,now=new Date().toISOString()){
      if(!action||typeof action!=='object'||Array.isArray(action)||typeof action.type!=='string')fail('요청 내용을 확인하세요.');
      const s=clone(state);const admin=role==='admin';const b=own(s.ballots,role)?s.ballots[role]:null;
      if(!admin&&!b)fail('접근 권한이 없습니다.',403);
      if(['save','submit'].includes(action.type)){
        if(!b)fail('심사위원만 점수를 입력할 수 있습니다.',403);
        if(s.finalized||b.submitted)fail('제출된 심사표는 수정할 수 없습니다.',409);
        if(action.expectedRevision!==b.revision)fail('다른 화면에서 심사표가 변경되었습니다. 미저장 점수를 백업하고 최신 점수를 다시 불러오세요.',409);
        if(action.type==='save'){validate(action.scores);b.scores=clone(action.scores);}
        if(action.type==='submit'){if(filled(b.scores)!==itemCount)fail(`${D.projects.length}개 심사대상의 ${itemCount}개 항목을 모두 입력해야 합니다.`);b.submitted=true;b.submittedAt=now;}
        b.revision++;b.updatedAt=now;
      }else if(action.type==='configure'){
        if(!admin)fail('관리자만 심사를 설정할 수 있습니다.',403);
        if(D.departmentId===undefined||!s.config||s.config.departmentId!==D.departmentId)fail('부서별 심사에서만 설정할 수 있습니다.');
        if(action.expectedRevision!==s.revision)fail('심사 상태가 변경되었습니다. 최신 상태에서 다시 설정하세요.',409);
        if(s.finalized||Object.values(s.ballots).some(ballot=>ballot.submitted||filled(ballot.scores)>0))fail('입력된 점수가 있습니다. 점수를 백업하고 전체 초기화한 후 설정하세요.',409);
        const next=validateConfig(action.config,D.departmentId),nextCore=create(next);
        s.audit.push({at:now,role,type:'configuration_change',before:clone(s.config),after:clone(next)});
        const nextRevision=Math.max(s.revision,...Object.values(s.ballots).map(ballot=>ballot.revision))+1;
        s.config=next;s.ballots=nextCore.initial().ballots;
        for(const ballot of Object.values(s.ballots)){ballot.revision=nextRevision;ballot.updatedAt=now;}
        s.finalized=false;s.finalizedAt=null;
      }else if(action.type==='admin_save'||action.type==='reset'){
        if(!admin)fail('관리자만 점수를 수정하거나 초기화할 수 있습니다.',403);
        if(typeof action.reason!=='string'||action.reason.trim().length<2||action.reason.length>500)fail('사유를 2~500자로 입력하세요.');
        if(action.type==='reset'){
          if(action.confirmation!=='전체 초기화')fail('초기화 확인 문구가 일치하지 않습니다.');
          if(action.expectedRevision!==s.revision)fail('점수가 변경되었습니다. 최신 상태에서 다시 초기화하세요.',409);
          s.audit.push({at:now,role,type:'reset_snapshot',ballots:clone(s.ballots),finalized:s.finalized,finalizedAt:s.finalizedAt});
          for(const target of Object.values(s.ballots)){target.scores=blankScores();target.submitted=false;target.submittedAt=null;target.revision++;target.updatedAt=now;}
        }else{
          const target=own(s.ballots,action.judgeId)?s.ballots[action.judgeId]:null;if(!target)fail('심사위원을 확인하세요.');
          if(action.expectedRevision!==target.revision)fail('해당 위원의 점수가 변경되었습니다. 창을 닫고 다시 열어 수정하세요.',409);
          validate(action.scores);
          s.audit.push({at:now,role,type:'admin_score_change',judgeId:action.judgeId,before:clone(target.scores),after:clone(action.scores),reason:action.reason});
          target.scores=clone(action.scores);target.revision++;target.updatedAt=now;
          if(filled(target.scores)!==itemCount){target.submitted=false;target.submittedAt=null;}
        }
        s.finalized=false;s.finalizedAt=null;
      }else if(action.type==='finalize'){
        if(!admin)fail('운영자만 전체 심사를 완료할 수 있습니다.',403);
        if(s.finalized)fail('이미 완료된 심사입니다.',409);
        if(!D.judges.every(j=>s.ballots[j.id]?.submitted&&filled(s.ballots[j.id].scores)===itemCount))fail(`심사위원 ${D.judges.length}명 모두 심사표를 제출해야 합니다.`);
        s.finalized=true;s.finalizedAt=now;
      }else if(action.type==='reopen'){
        if(!admin)fail('운영자만 수정 요청을 처리할 수 있습니다.',403);
        if(typeof action.reason!=='string'||action.reason.trim().length<2||action.reason.length>500)fail('수정 사유를 2~500자로 입력하세요.');
        const target=own(s.ballots,action.judgeId)?s.ballots[action.judgeId]:null;if(!target)fail('심사위원을 확인하세요.');
        target.submitted=false;target.submittedAt=null;target.revision++;target.updatedAt=now;s.finalized=false;s.finalizedAt=null;
      }else fail('지원하지 않는 요청입니다.');
      s.revision++;s.updatedAt=now;
      s.audit.push({at:now,role,type:action.type,judgeId:action.judgeId||role,reason:action.reason||'',revision:s.revision});
      return s;
    }
    function visible(state,role){const s=clone(state);if(role!=='admin')for(const [id,b] of Object.entries(s.ballots))if(id!==role){b.filled=filled(b.scores);b.scores=null;}if(role!=='admin')s.audit=[];return s;}
    function ranking(state){if(!state.finalized)fail('전체 심사 완료 후 결과를 확인할 수 있습니다.');const result=[];
      for(const category of [...new Set(D.projects.map(p=>p.category))]){
        const list=D.projects.filter(p=>p.category===category).map(p=>{const scores=D.judges.map(j=>total(state.ballots[j.id]?.scores?.[p.id]));if(scores.some(x=>x===null))fail('미입력 점수가 있습니다.');const sum=scores.reduce((a,b)=>a+b,0);return {...p,scores,sum,average:sum/D.judges.length};}).sort((a,b)=>b.sum-a.sum);
        list.forEach(p=>{p.rank=1+list.filter(q=>q.sum>p.sum).length;p.tied=list.filter(q=>q.sum===p.sum).length>1;p.award=p.tied?'협의 필요':(['대상','최우수상','우수상'][p.rank-1]||'—');});result.push(...list);
      }return result;
    }
    return {DATA:D,clone,initial,blankScores,valid,filled,total,validate,mutate,visible,ranking,create,departmentData,validateConfig};
  }
  return create(DATA);
});
