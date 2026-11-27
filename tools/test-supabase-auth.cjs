const assert=require('node:assert/strict');
const {create}=require('../supabase-auth');
const config={supabaseUrl:'https://roexzfpbvbmvhwzsycsw.supabase.co',supabasePublishableKey:'sb_publishable_test',redirectUrl:'https://grenthoxha.github.io/emma-space/',googleEnabled:true};
const uid='11111111-eeee-4000-8000-000000000001';
function fixture(){
  const saved=new Map(),calls=[],state={session:null,user:{id:uid,email:'synthetic@example.invalid',email_confirmed_at:'2026-01-01'},request:null,error:null};
  let options;
  const client={auth:{
    getSession:async()=>({data:{session:state.session}}),getUser:async()=>({data:{user:state.user}}),
    signInWithPassword:async payload=>{calls.push(['login',payload]);if(state.loginWait)await state.loginWait;state.session={};return {error:state.error};},
    signUp:async payload=>{calls.push(['signup',payload]);return {data:{session:null},error:state.error};},
    signInWithOAuth:async payload=>{calls.push(['oauth',payload]);return {data:{url:config.supabaseUrl+'/auth/v1/authorize?provider=google'}};},
    exchangeCodeForSession:async code=>{calls.push(['exchange',code]);state.session={};return {error:state.callbackError};},
    signOut:async payload=>{calls.push(['logout',payload]);state.session=null;return {error:state.logoutError};}
  },from:table=>{assert.equal(table,'emma_access_requests');return {select:columns=>({eq:(key,id)=>{assert.equal(key,'user_id');assert.equal(id,uid);return{maybeSingle:async()=>({data:state.request,error:state.queryError})};}}),insert:async payload=>{calls.push(['insert',payload]);state.request={...payload,status:'pending'};return {error:state.insertError};}};},storage:{from:bucket=>{assert.equal(bucket,'emma-registration');return {upload:async(path,photo,options)=>{calls.push(['upload',path,photo.size,options]);return {error:state.uploadError};}};}}};
  const location={href:config.redirectUrl,protocol:'https:',hostname:'grenthoxha.github.io'};
  const env={location,sdk:{createClient:(url,key,opts)=>{options=opts;return client;}},storage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},fetch:async(i,o)=>{calls.push(['fetch',o]);return {};},history:{replaceState:(a,b,url)=>calls.push(['history',url])}};
  return {state,calls,saved,env,service:()=>create(config,env),options:()=>options};
}
(async()=>{
  let f=fixture(),s=f.service();assert.equal((await s.session()).status,'anonymous');assert(!s.isAuthenticated());
  assert.equal((await s.register({email:'synthetic@example.invalid',password:'test-only-password'})).emailVerified,false);
  assert.equal(f.calls.filter(x=>x[0]==='upload').length,0,'No upload before email verification');
  assert.equal((await s.login('synthetic@example.invalid','test')).status,'photo_required');assert(!s.isAuthenticated());
  const photo={photo:new Blob(['synthetic JPEG fixture'],{type:'image/jpeg'}),capturedAt:'2026-11-27T10:00:00Z',consent:true};
  await assert.rejects(s.completeGoogleRegistration({...photo,consent:false}),{code:'VALIDATION'});
  assert.equal((await s.completeGoogleRegistration(photo)).status,'pending');assert(!s.isAuthenticated());
  f.state.request.status='approved';assert.equal((await s.session()).status,'approved');assert(s.isAuthenticated());
  f.state.request.status='revoked';assert.equal((await s.session()).status,'rejected');assert(!s.isAuthenticated());
  f.state.request.status='approved';f.state.user.email_confirmed_at=null;assert.equal((await s.session()).status,'pending');assert(!s.isAuthenticated());
  f.state.user.email_confirmed_at='2026-01-01';f.state.user.is_anonymous=true;await assert.rejects(s.session(),{code:'NOT_ALLOWED'});assert(!s.isAuthenticated());
  f.state.user.is_anonymous=false;f.state.queryError={code:'42501'};await assert.rejects(s.session(),{code:'SETUP_REQUIRED'});assert(!s.isAuthenticated());
  f=fixture();s=f.service();f.state.session={};f.state.user.user_metadata={role:'emma',status:'approved'};assert.equal((await s.session()).status,'photo_required');assert(!s.isAuthenticated(),'Metadata cannot approve');
  const options=f.options();assert.equal(options.auth.flowType,'pkce');assert.equal(options.auth.detectSessionInUrl,false);assert.equal(options.auth.storageKey,'emma-space-supabase-session');
  await options.global.fetch('https://example.invalid',{cache:'force-cache'});assert.equal(f.calls.at(-1)[1].cache,'no-store');
  const url=await s.beginGoogle();assert(url.startsWith(config.supabaseUrl+'/auth/v1/authorize'));
  assert.deepEqual(f.calls.find(x=>x[0]==='oauth')[1].options,{redirectTo:config.redirectUrl,skipBrowserRedirect:true,scopes:'openid email profile'});
  f.saved.set('emma-space-supabase-session','fixture');f.saved.set('emma-space-supabase-session-code-verifier','fixture');f.saved.set('real-device-data','kept');
  await s.logout();assert(!s.isAuthenticated());assert.equal(f.saved.size,1);assert.equal(f.saved.get('real-device-data'),'kept');
  f=fixture();f.env.location.href=config.redirectUrl+'?code=synthetic-code#home';s=f.service();await s.session();await s.session();assert.equal(f.calls.filter(x=>x[0]==='exchange').length,1);assert.equal(f.calls.find(x=>x[0]==='history')[1],config.redirectUrl+'#home');
  f=fixture();f.env.location.href=config.redirectUrl+'?code=expired';f.state.callbackError={message:'fixture'};s=f.service();await assert.rejects(s.session(),{code:'CALLBACK_FAILED'});assert.equal((await s.session()).status,'photo_required','Failed callback does not poison later sign-in checks');
  f=fixture();s=f.service();let resolve;f.state.loginWait=new Promise(r=>resolve=r);const pending=s.login('synthetic@example.invalid','test');s.forget();resolve();await assert.rejects(pending,{code:'SESSION_ENDED'});assert(!s.isAuthenticated());
  assert.throws(()=>create({...config,supabasePublishableKey:'sb_secret_never'},f.env),{code:'INVALID_CONFIG'});
  assert.throws(()=>create({...config,supabaseUrl:'https://evil.example'},f.env),{code:'INVALID_CONFIG'});
  console.log('PASS: Supabase verification, PKCE callback, consent/photo, owner approval, revocation, session isolation, logout and stale requests');
})().catch(e=>{console.error(e);process.exitCode=1;});
