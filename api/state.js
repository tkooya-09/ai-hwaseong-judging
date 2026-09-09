const {timingSafeEqual}=require('node:crypto');
const C=require('../lib/core.cjs');
const CAS="local current=redis.call('GET',KEYS[1]); if (current or '')~=ARGV[1] then return 0 end; redis.call('SET',KEYS[1],ARGV[2]); return 1";
function config(){
  const url=process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL;
  const token=process.env.UPSTASH_REDIS_REST_TOKEN||process.env.KV_REST_API_TOKEN;
  let judges;try{judges=JSON.parse(process.env.JUDGE_TOKENS||'{}');}catch{}
  const admin=process.env.ADMIN_TOKEN;
  const codes=[admin,...C.DATA.judges.map(j=>judges?.[j.id])];
  if(!url||!url.startsWith('https://')||!token||codes.some(t=>typeof t!=='string'||t.length<24)||new Set(codes).size!==6)throw Object.assign(new Error('공동 집계 설정이 필요합니다. 운영자가 서버 환경변수를 확인해 주세요.'),{status:503});
  return {url,token,judges,admin,key:'ai-judging:'+(process.env.EVENT_ID||'hwaseong-2026-final')};
}
function equal(a,b){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
function roleFor(req,c){const token=(req.headers.authorization||'').replace(/^Bearer /,'');if(equal(token,c.admin))return 'admin';for(const [id,t] of Object.entries(c.judges))if(C.DATA.judges.some(j=>j.id===id)&&equal(token,t))return id;throw Object.assign(new Error('접속 코드가 일치하지 않습니다.'),{status:401});}
async function redis(c,command){const r=await fetch(c.url,{method:'POST',headers:{Authorization:'Bearer '+c.token,'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(8000)});if(!r.ok)throw new Error('Storage request failed');const data=await r.json();if(data.error)throw new Error('Storage command failed');return data.result;}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');res.setHeader('X-Content-Type-Options','nosniff');
  try{
    if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'허용되지 않는 요청입니다.'});
    const c=config();const role=roleFor(req,c);
    let action;if(req.method==='POST'){
      if(!String(req.headers['content-type']||'').startsWith('application/json'))return res.status(415).json({error:'JSON 형식이 필요합니다.'});
      if(Number(req.headers['content-length']||0)>16000)return res.status(413).json({error:'요청이 너무 큽니다.'});
      try{action=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{return res.status(400).json({error:'잘못된 JSON입니다.'});}
      if(!action||JSON.stringify(action).length>16000)return res.status(400).json({error:'잘못된 요청입니다.'});
    }
    for(let i=0;i<8;i++){
      const raw=await redis(c,['GET',c.key]);const state=raw?JSON.parse(raw):C.initial();
      if(req.method==='GET')return res.status(200).json({role,state:C.visible(state,role)});
      const next=C.mutate(state,role,action);
      if(await redis(c,['EVAL',CAS,1,c.key,raw||'',JSON.stringify(next)]))return res.status(200).json({role,state:C.visible(next,role)});
    }
    return res.status(409).json({error:'동시 저장 요청이 많습니다. 잠시 후 다시 저장하세요.'});
  }catch(e){return res.status(e.status||503).json({error:e.status?e.message:'공동 집계 서버에 연결하지 못했습니다. 입력 내용을 유지하고 다시 시도해 주세요.'});}
};
