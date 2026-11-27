const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'..'),editor=require('../journal-editor'),model=require('../space-model');
const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
const script=[...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('  bootstrapApp();')).replace('  bootstrapApp();','  globalThis.api={blankState,initialWorkspaceState,save,DEV_DEMO_AVAILABLE,DEV_DEMO_ACTIVE,DB_NAME,STORAGE_KEY,LEGACY_KEY,FALLBACK_KEY,DRAFT_TEXT_KEY,SIGNED_OUT_KEY,hasWorkspaceAccess,logOut,render,tryUnlock,getState:()=>state,getExited:()=>sessionExited,getLocked:()=>appLocked,setState:s=>state=s,setDraft:d=>journalDraft=d};');
function app(storage=new Map(),initiallyApproved=true,env={}) {
  const dom={innerHTML:''},handlers={},windowHandlers={};let authenticated=initiallyApproved,onApproved=null;
  // The real auth transport is mocked only in this isolated test.
  const client={configured:true,isAuthenticated:()=>authenticated,forget(){authenticated=false;},async logout(){authenticated=false;}};
  const context={EmmaJournalEditor:editor,EmmaSpaceModel:model,EmmaAuthService:{create:()=>client},EmmaAuthUI:{mount:(element,options)=>{onApproved=options.onAuthenticated;element.innerHTML='<h1 id="auth-heading">Kyçu</h1><form id="auth-login-form"></form>'+options.message;return{destroy(){}};}},crypto:webcrypto,console,TextEncoder,Date,location:{hash:'#profile'},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},document:{getElementById:id=>id==='app'?dom:null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(key,fn)=>(handlers[key] ||= []).push(fn)},window:{scrollTo(){},addEventListener:(key,fn)=>(windowHandlers[key] ||= []).push(fn)},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}};
  context.window.EMMA_AUTH_CONFIG=env.config||{};
  Object.assign(context.location,env.location||{});
  context.URL=URL;
  const destinations=[];context.window.location={assign:url=>destinations.push(url)};
  vm.runInNewContext(script,context);
  const login=()=>{authenticated=true;onApproved();};
  return {...context,api:context.api,dom,storage,login,windowHandlers,handlers,client,destinations};
}
(async()=>{
  const first=app(),data=first.api.blankState();data.journalPages=[{id:'kept',title:'Kujtim privat',body:'Mos e fshi',date:new Date().toISOString(),photos:[]}];first.api.setState(data);first.api.setDraft({title:'Draft i ruajtur',content:[{type:'text',text:'Mos e humb këtë shkrim.'}]});
  await first.api.logOut();assert(first.api.getExited());assert(first.api.getLocked());assert.equal(first.storage.get('emma-space-signed-out'),'1');assert(first.dom.innerHTML.includes('auth-login-form'));assert(!first.dom.innerHTML.includes('Kujtim privat'));assert(!first.dom.innerHTML.includes('glass-nav'));assert.equal(first.api.getState().journalPages.length,1);assert.equal(JSON.parse(first.storage.get('emma-space-device-fallback')).journalDraft.title,'Draft i ruajtur');
  first.location.hash='#journal';first.api.render();assert(first.dom.innerHTML.includes('auth-login-form'));
  first.storage.delete('emma-space-signed-out');first.api.render();assert(first.dom.innerHTML.includes('auth-login-form'),'Deleting a local flag cannot authenticate');
  const reloaded=app(first.storage,false);reloaded.api.render();assert(reloaded.dom.innerHTML.includes('auth-login-form'));assert.equal((await reloaded.api.tryUnlock('123456')).ok,false,'PIN cannot bypass online login');
  first.location.hash='#profile';first.login();assert(!first.api.getExited());assert(!first.api.getLocked());assert(first.dom.innerHTML.includes('btn-log-out'));
  const pinApp=app(),protectedData=pinApp.api.blankState();const salt='test-only-salt';const digest=await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(salt+':123456'));protectedData.pin={enabled:true,salt,hash:Buffer.from(digest).toString('hex'),autoLockMinutes:5};pinApp.api.setState(protectedData);await pinApp.api.logOut();pinApp.login();assert(pinApp.api.getLocked());assert(pinApp.dom.innerHTML.includes('unlock-form'));assert.equal((await pinApp.api.tryUnlock('000000')).ok,false);assert.equal((await pinApp.api.tryUnlock('123456')).ok,true);assert(!pinApp.api.getLocked());
  const other=app();other.windowHandlers.storage[0]({key:'emma-space-signed-out',newValue:'1'});assert(other.api.getExited());assert(other.dom.innerHTML.includes('auth-login-form'));
  const demoEnv={config:{developmentDemo:true,apiBaseUrl:''},location:{protocol:'http:',hostname:'localhost',search:'?demo=1',href:'http://localhost/index.html?demo=1#profile'}};
  for(const config of [{...demoEnv,config:{}},{...demoEnv,config:{developmentDemo:true,apiBaseUrl:'/api/auth'}},{...demoEnv,location:{...demoEnv.location,protocol:'https:',hostname:'emma.example'}}]){
    const blocked=app(new Map(),false,config);assert(!blocked.api.DEV_DEMO_ACTIVE);assert(!blocked.api.hasWorkspaceAccess());
  }
  const realContent='REAL DATA SENTINEL',sharedStorage=new Map([['emma-space-device-fallback',realContent],['emma-space-journal-draft-text',realContent],['emma-space-signed-out','1']]);
  const demo=app(sharedStorage,false,demoEnv);assert(demo.api.DEV_DEMO_AVAILABLE);assert(demo.api.DEV_DEMO_ACTIVE);assert(demo.api.hasWorkspaceAccess());assert(!demo.client.isAuthenticated());
  for(const key of ['DB_NAME','STORAGE_KEY','LEGACY_KEY','FALLBACK_KEY','DRAFT_TEXT_KEY','SIGNED_OUT_KEY'])assert(demo.api[key].startsWith('emma-space-demo:'),key+' must be isolated');
  demo.api.setState(demo.api.initialWorkspaceState());demo.api.render();assert(demo.dom.innerHTML.includes('demo-notice'));assert(demo.dom.innerHTML.includes('Dil nga demo'));assert(!demo.dom.innerHTML.includes('auth-login-form'));
  demo.api.setDraft({title:'DEMO DRAFT',content:[{type:'text',text:'Test only'}]});await demo.api.logOut();assert.equal(demo.destinations[0],'http://localhost/index.html#home');
  assert.equal(sharedStorage.get('emma-space-device-fallback'),realContent);assert.equal(sharedStorage.get('emma-space-journal-draft-text'),realContent);assert.equal(sharedStorage.get('emma-space-signed-out'),'1');
  assert.equal(JSON.parse(sharedStorage.get(demo.api.FALLBACK_KEY)).journalDraft.title,'DEMO DRAFT');assert(!demo.client.isAuthenticated());
  const fileDemo=app(new Map(),false,{...demoEnv,location:{...demoEnv.location,protocol:'file:',hostname:''}});assert(fileDemo.api.DEV_DEMO_ACTIVE);
  const publishedDemo={config:{developmentDemo:true,apiBaseUrl:'',publicDemoUrl:'https://grenthoxha.github.io/emma-space/'},location:{protocol:'https:',hostname:'grenthoxha.github.io',href:'https://grenthoxha.github.io/emma-space/?demo=1#profile',search:'?demo=1'}};
  const previewEntry=app(new Map(),false,{...publishedDemo,location:{...publishedDemo.location,href:'https://grenthoxha.github.io/emma-space/',search:''}});assert(previewEntry.api.DEV_DEMO_AVAILABLE);assert(!previewEntry.api.DEV_DEMO_ACTIVE);assert(!previewEntry.api.hasWorkspaceAccess());
  for(const change of [{config:{...publishedDemo.config,apiBaseUrl:'/api/auth'}},{config:{...publishedDemo.config,developmentDemo:false}},{config:{...publishedDemo.config,publicDemoUrl:''}},{location:{...publishedDemo.location,href:'https://grenthoxha.github.io/other-app/?demo=1'}},{location:{...publishedDemo.location,href:'https://grenthoxha.github.io.evil.example/emma-space/?demo=1'}},{location:{...publishedDemo.location,href:'http://grenthoxha.github.io/emma-space/?demo=1'}}]){
    const blocked=app(new Map(),false,{...publishedDemo,...change});assert(!blocked.api.DEV_DEMO_AVAILABLE);assert(!blocked.api.hasWorkspaceAccess());
  }
  const hosted=app(sharedStorage,false,publishedDemo);assert(hosted.api.DEV_DEMO_ACTIVE);assert(!hosted.client.isAuthenticated());
  for(const key of ['DB_NAME','STORAGE_KEY','LEGACY_KEY','FALLBACK_KEY','DRAFT_TEXT_KEY','SIGNED_OUT_KEY'])assert(hosted.api[key].startsWith('emma-space-demo:'));
  hosted.api.setState(hosted.api.initialWorkspaceState());hosted.api.setDraft({title:'HOSTED DEMO DRAFT',content:[{type:'text',text:'Preview only'}]});await hosted.api.logOut();assert.equal(hosted.destinations[0],'https://grenthoxha.github.io/emma-space/#home');assert.equal(sharedStorage.get('emma-space-device-fallback'),realContent);assert.equal(sharedStorage.get('emma-space-journal-draft-text'),realContent);assert.equal(sharedStorage.get('emma-space-signed-out'),'1');
  const explicitIndex=app(new Map(),false,{...publishedDemo,location:{...publishedDemo.location,href:'https://grenthoxha.github.io/emma-space/index.html?demo=1'}});assert(explicitIndex.api.DEV_DEMO_ACTIVE);
  console.log('PASS: real auth gate, logout/PIN/cross-tab, scoped local/hosted demo and separate demo storage/drafts/exit');
})().catch(error=>{console.error(error);process.exitCode=1;});
