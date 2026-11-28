const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const clean=value=>value.replace(/\r\n/g,'\n');
(async()=>{
  const shell=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  const files=[...new Set(['sw.js',...[...shell.matchAll(/"\.\/([^"\n]*)"/g)].map(m=>m[1].split('?')[0]||'index.html')])];
  for(const file of files){
    const source=path.join(root,file),mirror=path.join(root,'dist',file);
    if(!fs.existsSync(source)||!fs.existsSync(mirror))throw Error('Missing offline asset: '+file);
    if(!fs.readFileSync(source).equals(fs.readFileSync(mirror)))throw Error('Dist differs: '+file);
  }
  console.log('PASS: '+files.length+' offline assets exist and match dist');
  if(process.argv.includes('--published'))for(const file of ['index.html','sw.js','app-improvements.js','improvements.css','auth-ui.js','account-storage.js','reminders.js']){
    const response=await fetch('https://grenthoxha.github.io/emma-space/'+file+'?release-check='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok||clean(await response.text())!==clean(fs.readFileSync(path.join(root,file),'utf8')))throw Error('Published mismatch: '+file);
    console.log('PASS: published '+file);
  }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
