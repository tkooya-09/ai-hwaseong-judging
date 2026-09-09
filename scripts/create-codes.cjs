const {randomBytes}=require('node:crypto');
const code=()=>randomBytes(24).toString('base64url');
const admin=code();const judges=Object.fromEntries([1,2,3,4,5].map(n=>['j'+n,code()]));
console.log('아래 값을 Vercel 환경변수에 등록하세요. 이 출력은 GitHub에 올리지 마세요.');
console.log('\nADMIN_TOKEN='+admin);
console.log('\nJUDGE_TOKENS='+JSON.stringify(judges));
console.log('\n심사위원에게는 본인의 코드 한 개만 전달하세요.');
for(const [id,name] of [['j1','정희석'],['j2','김규진'],['j3','홍아름'],['j4','서호성'],['j5','정원석']])console.log(id+' '+name+': '+judges[id]);
