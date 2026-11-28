const assert=require('node:assert/strict'),{create}=require('../admin-service');
const owner='22222222-eeee-4000-8000-000000000001',applicant='22222222-eeee-4000-8000-000000000002';
const config={supabaseUrl:'https://project.supabase.co',supabasePublishableKey:'sb_publishable_fixture',redirectUrl:'https://example.com/emma/'};
function fixture(){
  const calls=[],saved=new Map([['emma-space-supabase-session','real-user-session'],['device-data','kept']]);
  const state={session:null,user:{id:owner,email:'owner@example.invalid',email_confirmed_at:'2026-01-01'},admin:false,requests:[{user_id:applicant,status:'pending',photo_path:applicant+'/capture.jpg',email:'applicant@example.invalid'}]};let options;
  const client={auth:{getSession:async()=>({data:{session:state.session}}),getUser:async()=>({data:{user:state.user}}),signInWithPassword:async payload=>{calls.push(['login',payload]);state.session={};return {};},signUp:async payload=>{calls.push(['signup',payload]);return {};},exchangeCodeForSession:async code=>{calls.push(['exchange',code]);state.session={};return {};},signOut:async()=>{state.session=null;return {error:state.logoutError};}},rpc:async name=>{assert.equal(name,'emma_am_i_administrator');if(state.rpcWait)await state.rpcWait;return{data:state.admin};},from:table=>{
    calls.push(['table',table]);let filters={};return{select:()=>({order:()=>({limit:async()=>({data:state.requests})})}),update:payload=>({eq:function(key,value){filters[key]=value;return this;},select:async()=>{calls.push(['update',payload,filters]);return {data:state.changed?[]:[{user_id:filters.user_id,status:payload.status}],error:state.updateError};}})};
  },storage:{from:bucket=>({download:async path=>{calls.push(['photo',bucket,path]);return {data:new Blob(['fixture'],{type:'image/jpeg'})};}})}};
  const env={sdk:{createClient:(url,key,opts)=>{options=opts;return client;}},storage:{getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)},location:{href:config.redirectUrl+'admin.html',protocol:'https:',hostname:'example.com'},fetch:async(input,init)=>{calls.push(['fetch',init]);return{};},history:{replaceState:(a,b,url)=>calls.push(['history',url])}};
  return {state,calls,saved,env,service:create(config,env),options};
}
(async()=>{
  let f=fixture(),s=f.service;assert.equal((await s.session()).status,'anonymous');
  assert.equal((await s.register('OWNER@example.invalid','fixture-long-password')).status,'verify_email');assert.equal(f.state.admin,false);assert(!f.calls.some(c=>c[0]==='table'));
  assert.equal(f.calls.find(c=>c[0]==='signup')[1].options.emailRedirectTo,config.redirectUrl+'admin.html');
  assert.equal((await s.login('owner@example.invalid','test')).status,'not_administrator');await assert.rejects(s.list(),{code:'FORBIDDEN'});assert(!f.calls.some(c=>c[0]==='table'));
  f.state.user.user_metadata={role:'admin'};await assert.rejects(s.list(),{code:'FORBIDDEN'},'Client-editable metadata must not grant access');
  f.state.admin=true;assert.equal((await s.session()).status,'administrator');assert.equal((await s.list()).requests.length,1);
  const picture=await s.photo(f.state.requests[0]);assert(picture instanceof Blob);assert.equal(f.calls.find(c=>c[0]==='photo')[1],'emma-registration');
  await assert.rejects(s.photo({...f.state.requests[0],photo_path:owner+'/capture.jpg'}),{code:'VALIDATION'});
  await s.review(applicant,'pending','approved');assert.deepEqual(f.calls.find(c=>c[0]==='update'),['update',{status:'approved'},{user_id:applicant,status:'pending'}]);
  await assert.rejects(s.review(owner,'pending','approved'),{code:'VALIDATION'});
  f.state.updateError={code:'23505'};await assert.rejects(s.review(applicant,'pending','approved'),{code:'ONE_USER'});f.state.updateError=null;f.state.changed=true;await assert.rejects(s.review(applicant,'pending','approved'),{code:'CHANGED'});f.state.changed=false;
  f.state.admin=false;await assert.rejects(s.review(applicant,'pending','approved'),{code:'FORBIDDEN'},'Re-check administrator membership on every decision');
  assert.equal(f.options.auth.storageKey,'emma-space-supabase-session');assert.equal(f.options.auth.flowType,'pkce');await f.options.global.fetch('https://example.invalid',{cache:'force-cache'});assert.equal(f.calls.at(-1)[1].cache,'no-store');
  f.saved.set('emma-space-admin-session','admin-fixture');f.saved.set('emma-space-admin-session-code-verifier','fixture');f.state.logoutError={code:'offline'};await assert.rejects(s.logout());assert(!f.saved.has('emma-space-supabase-session'));assert.equal(f.saved.get('device-data'),'kept');assert(!f.saved.has('emma-space-admin-session'));
  f=fixture();s=f.service;f.state.session={};f.state.admin=true;let resolve;f.state.rpcWait=new Promise(r=>resolve=r);const late=s.list();s.cancel();resolve();await assert.rejects(late,{code:'ENDED'});
  f=fixture();f.env.location.href=config.redirectUrl+'admin.html?code=synthetic';s=create(config,f.env);await s.session();await s.session();assert.equal(f.calls.filter(c=>c[0]==='exchange').length,1);assert.equal(f.calls.find(c=>c[0]==='history')[1],config.redirectUrl+'admin.html');
  assert.throws(()=>create({...config,supabasePublishableKey:'sb_secret_never'},f.env),{code:'CONFIG'});
  console.log('PASS: admin membership, private photos, one-user limit errors, status concurrency, no self-approval, separate sessions, callback cleanup and stale replies');
})().catch(e=>{console.error(e);process.exitCode=1;});
