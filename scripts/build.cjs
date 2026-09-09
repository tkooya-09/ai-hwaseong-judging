const fs=require('node:fs');const path=require('node:path');const root=path.join(__dirname,'..');
const data=fs.readFileSync(path.join(root,'lib/data.json'),'utf8').replace(/</g,'\\u003c');
const core=fs.readFileSync(path.join(root,'lib/core.cjs'),'utf8');
const print=fs.readFileSync(path.join(root,'lib/print.cjs'),'utf8');
const template=fs.readFileSync(path.join(root,'index.template.html'),'utf8');
const html=template.replace('/*__DATA__*/',()=>data).replace('/*__CORE__*/',()=>core).replace('/*__PRINT__*/',()=>print);
fs.mkdirSync(path.join(root,'dist'),{recursive:true});fs.writeFileSync(path.join(root,'dist/index.html'),html);
console.log('Built dist/index.html (standalone HTML)');
