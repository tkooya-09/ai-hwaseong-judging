const ENDPOINT='https://sbnjodqxvwgqgdnzcziz.supabase.co/functions/v1/judging-state';
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store, max-age=0');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'허용되지 않는 요청입니다.'});
 try{
  let body;
  if(req.method==='POST'){
   if(!String(req.headers['content-type']||'').startsWith('application/json'))return res.status(415).json({error:'JSON 형식이 필요합니다.'});
   body=typeof req.body==='string'?req.body:JSON.stringify(req.body);
   if(!body||Buffer.byteLength(body)>16000)return res.status(413).json({error:'요청이 너무 큽니다.'});
  }
  const response=await fetch(ENDPOINT,{method:req.method,headers:{Authorization:req.headers.authorization||'','Content-Type':'application/json'},...(body?{body}:{}),signal:AbortSignal.timeout(14000)});
  return res.status(response.status).json(await response.json());
 }catch{return res.status(503).json({error:'공동 집계 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'});}
};
