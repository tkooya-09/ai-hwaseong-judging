export function createHandler(C, env, request = fetch) {
  const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  return async function handler(req) {
    try {
      if(!['GET','POST'].includes(req.method))return json({error:'허용되지 않는 요청입니다.'},405);
      const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
      const departmentToken=/^dept:([1-5]):(admin|j(?:[1-9]|10))$/.exec(token);
      if((token.startsWith('dept:')&&!departmentToken)||(!departmentToken&&!token.startsWith('name:')&&token.length<24)||token.length>256)return json({error:'접속 정보가 일치하지 않습니다.'},401);
      const departmentId=departmentToken?Number(departmentToken[1]):null;
      const url=env('SUPABASE_URL');
      const secretKeys=JSON.parse(env('SUPABASE_SECRET_KEYS')||'{}');
      const key=secretKeys.default||Object.values(secretKeys)[0]||env('SUPABASE_SERVICE_ROLE_KEY');
      if(!url||!key)throw Error('Missing database configuration');
      async function db(path,method='GET',body,prefer){
        const headers={apikey:key,'Content-Type':'application/json'};
        if(!key.startsWith('sb_secret_'))headers.Authorization='Bearer '+key;
        if(prefer)headers.Prefer=prefer;
        const r=await request(url+'/rest/v1/'+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(8000)});
        if(!r.ok)throw Error('Database request failed');
        return r.status===204?null:await r.json();
      }
      let credentials;
      if(departmentToken){
        credentials=[{role:departmentToken[2],event_id:'hwaseong-dept-'+departmentId}];
      }else if(token.startsWith('name:')){
        let name;try{name=decodeURIComponent(token.slice(5)).trim().normalize('NFC');}catch{return json({error:'심사위원 이름을 확인해 주세요.'},401);}
        const judge=name==='전명구'?{id:'admin'}:C.DATA.judges.find(j=>j.name===name);
        if(!judge)return json({error:'등록된 이름을 정확히 입력해 주세요.'},401);
        credentials=await db('hwaseong_judging_codes?role=eq.'+judge.id+'&event_id=eq.hwaseong-2026-final&active=eq.true&select=role,event_id&limit=1');
      }else{
        const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),x=>x.toString(16).padStart(2,'0')).join('');
        credentials=await db('hwaseong_judging_codes?token_hash=eq.'+hash+'&active=eq.true&select=role,event_id&limit=1');
      }
      if(!credentials.length)return json({error:'이름 또는 접속 코드를 확인해 주세요.'},401);
      const {role,event_id}=credentials[0];
      let action;
      if(req.method==='POST'){
        if(!(req.headers.get('content-type')||'').startsWith('application/json'))return json({error:'JSON 형식이 필요합니다.'},415);
        if(Number(req.headers.get('content-length')||0)>64000)return json({error:'요청이 너무 큽니다.'},413);
        const reader=req.body?.getReader();let size=0,chunks=[];
        if(reader){while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>64000){await reader.cancel();return json({error:'요청이 너무 큽니다.'},413);}chunks.push(value);}}
        const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
        try{action=JSON.parse(new TextDecoder().decode(bytes));}catch{return json({error:'잘못된 JSON입니다.'},400);}
        if(!action||typeof action!=='object'||Array.isArray(action))return json({error:'잘못된 요청입니다.'},400);
        if(['event_id','eventId','departmentId'].some(k=>Object.hasOwn(action,k)))return json({error:'접속한 부서에서만 변경할 수 있습니다.'},400);
        if(departmentId&&action.config&&((Object.hasOwn(action.config,'departmentId')&&action.config.departmentId!==departmentId)||(Object.hasOwn(action.config,'departmentName')&&action.config.departmentName!=='부서'+departmentId)))return json({error:'다른 부서의 설정으로 변경할 수 없습니다.'},400);
      }
      const path='hwaseong_judging_events?event_id=eq.'+encodeURIComponent(event_id);
      for(let i=0;i<16;i++){
        let rows=await db(path+'&select=state,revision');
        if(!rows.length&&departmentId&&req.method==='GET'){
          const initial=C.create(C.departmentData(departmentId)).initial();
          // Two first visitors may race. Insert only if absent, then read the winner.
          await db('hwaseong_judging_events?on_conflict=event_id','POST',{event_id,state:initial,revision:initial.revision,updated_at:new Date().toISOString()},'resolution=ignore-duplicates,return=representation');
          rows=await db(path+'&select=state,revision');
        }
        if(!rows.length)throw Error('Event not configured');
        const state=rows[0].state;
        if(departmentId&&(!state.config||state.config.departmentId!==departmentId||state.config.departmentName!=='부서'+departmentId))throw Error('Department configuration mismatch');
        const core=C.create?C.create(state.config||C.DATA):C;
        if(role!=='admin'&&!core.DATA.judges.some(j=>j.id===role))return json({error:'현재 부서에서 사용 중인 심사위원을 선택해 주세요.'},403);
        if(req.method==='GET')return json({role,departmentId,state:core.visible(state,role)});
        const next=core.mutate(state,role,action);
        if(departmentId&&(!next.config||next.config.departmentId!==departmentId||next.config.departmentName!=='부서'+departmentId))throw Error('Department configuration mismatch');
        const saved=await db(path+'&revision=eq.'+rows[0].revision,'PATCH',{state:next,revision:next.revision,updated_at:next.updatedAt},'return=representation');
        if(saved.length){const nextCore=C.create?C.create(next.config||C.DATA):C;return json({role,departmentId,state:nextCore.visible(next,role)});}
      }
      return json({error:'동시 저장 요청이 많습니다. 잠시 후 다시 저장하세요.'},409);
    }catch(e){return json({error:e.status?e.message:'공동 집계 서버에 연결하지 못했습니다. 입력 내용을 유지하고 다시 시도해 주세요.'},e.status||503);}
  };
}

