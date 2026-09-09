const {randomBytes,createHash}=require('node:crypto');
for(const role of ['admin','j1','j2','j3','j4','j5']){
 const code=randomBytes(24).toString('base64url');
 console.log(JSON.stringify({role,code,token_hash:createHash('sha256').update(code).digest('hex')}));
}
// Store hashes in hwaseong_judging_codes. Share each code with its owner only.
// Never commit this command's output.
