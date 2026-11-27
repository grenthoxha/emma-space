const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {create,approved}=require('../auth-service');
const location={origin:'https://emma.example',protocol:'https:'};
const account={id:'emma-test',email:'emma@example.test',role:'emma',status:'approved',emailVerified:true};
const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
const failure=code=>error=>error.code===code;
(async()=>{
  let calls=[],mode='anonymous';
  const fetch=async(url,options)=>{
    calls.push({url,options});assert.equal(options.credentials,'same-origin');assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');assert.equal(options.mode,'same-origin');
    if(url.endsWith('/session'))return response({user:mode==='approved'?account:null,csrfToken:'csrf-test-only'});
    assert.equal(options.headers['X-CSRF-Token'],'csrf-test-only');
    if(url.endsWith('/login')){
      const data=JSON.parse(options.body);assert.equal(data.email,'emma@example.test');assert(!url.includes(data.password));
      if(mode==='invalid')return response({code:'INVALID_CREDENTIALS'},401);
      return response({user:mode==='pending'?{...account,role:'applicant',status:'pending',emailVerified:false}:mode==='admin'?{...account,role:'admin'}:mode==='unverified'?{...account,emailVerified:false}:account,csrfToken:'csrf-test-only'});
    }
    if(url.endsWith('/register')){assert(options.body instanceof FormData);assert.equal(options.body.get('email'),'emma@example.test');assert.equal(options.body.get('photo').type,'image/jpeg');assert(!options.headers['Content-Type']);return response({status:'pending',emailVerified:false,csrfToken:'csrf-test-only'},202);}
    if(url.endsWith('/logout'))return response({ok:true});throw Error('Unexpected URL');
  };
  const unconfigured=create({}, {location,fetch});assert.equal(unconfigured.configured,false);await assert.rejects(()=>unconfigured.login('emma@example.test','test-only-password'),failure('NOT_CONFIGURED'));assert.equal(calls.length,0);
  for(const url of ['https://elsewhere.example/api','http://emma.example/api','/api/auth?secret=bad','//elsewhere.example/api'])assert.throws(()=>create({apiBaseUrl:url},{location,fetch}));
  const client=create({apiBaseUrl:'/api/auth'},{location,fetch});assert(client.configured);assert.equal((await client.session()).status,'anonymous');assert(!client.isAuthenticated());
  mode='pending';assert.equal((await client.login(' Emma@Example.Test ','test-only-password')).status,'pending');assert(!client.isAuthenticated());
  mode='invalid';await assert.rejects(()=>client.login('emma@example.test','wrong-test-only'),failure('INVALID_CREDENTIALS'));assert(!client.isAuthenticated());
  mode='admin';await assert.rejects(()=>client.login('emma@example.test','test-only-password'),failure('NOT_ALLOWED'));assert(!client.isAuthenticated());
  mode='unverified';await assert.rejects(()=>client.login('emma@example.test','test-only-password'),failure('NOT_ALLOWED'));assert(!client.isAuthenticated());
  mode='approved';assert.equal((await client.login('emma@example.test','test-only-password')).status,'approved');assert(client.isAuthenticated());await client.logout();assert(!client.isAuthenticated());
  mode='anonymous';assert.equal((await client.register({email:'emma@example.test',password:'test-only-password',photo:new Blob(['jpeg-test-only'],{type:'image/jpeg'}),capturedAt:new Date().toISOString(),consent:true})).status,'pending');assert(!client.isAuthenticated());
  await assert.rejects(()=>client.register({email:'emma@example.test',password:'short',photo:null,consent:false}),failure('VALIDATION'));
  const noCsrf=create({apiBaseUrl:'/api/auth'},{location,fetch:async()=>response({user:null})});await assert.rejects(()=>noCsrf.login('emma@example.test','test-only-password'),failure('CSRF_REQUIRED'));
  const rate=create({apiBaseUrl:'/api/auth'},{location,fetch:async()=>response({},429)});await assert.rejects(()=>rate.session(),failure('RATE_LIMITED'));
  const broken=create({apiBaseUrl:'/api/auth'},{location,fetch:async()=>{throw Error('offline');}});await assert.rejects(()=>broken.session(),failure('NETWORK'));
  let finish;const stale=create({apiBaseUrl:'/api/auth'},{location,fetch:()=>new Promise(resolve=>finish=resolve)});const request=stale.session();stale.forget();finish(response({user:account,csrfToken:'old'}));await assert.rejects(()=>request,failure('SESSION_ENDED'));assert(!stale.isAuthenticated());
  const googleUrl=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  for(const [key,value] of Object.entries({client_id:'test-client.apps.googleusercontent.com',redirect_uri:location.origin+'/api/auth/google/callback',response_type:'code',scope:'openid email profile',state:'test-state-only',nonce:'test-nonce-only',code_challenge:'c'.repeat(43),code_challenge_method:'S256'}))googleUrl.searchParams.set(key,value);
  let redirect=googleUrl.href,googlePosts=0;
  const googleFetch=async(url,options)=>{
    if(url.endsWith('/session'))return response({user:{...account,role:'applicant',status:'pending',provider:'google',registrationComplete:false},csrfToken:'google-csrf'});
    assert.equal(options.headers['X-CSRF-Token'],'google-csrf');googlePosts++;
    if(url.endsWith('/google/start')){assert(['register','login'].includes(JSON.parse(options.body).intent));return response({authorizationUrl:redirect});}
    if(url.endsWith('/google/complete')){assert(options.body instanceof FormData);assert.equal(options.body.get('email'),null);assert.equal(options.body.get('password'),null);return response({status:'pending'},202);}
    throw Error('Unexpected Google URL');
  };
  const disabledGoogle=create({apiBaseUrl:'/api/auth'},{location,fetch:googleFetch});await assert.rejects(()=>disabledGoogle.beginGoogle(),failure('GOOGLE_NOT_CONFIGURED'));assert.equal(googlePosts,0);
  const google=create({apiBaseUrl:'/api/auth',googleEnabled:true},{location,fetch:googleFetch});assert.equal((await google.session()).status,'photo_required');assert(!google.isAuthenticated());assert.equal(await google.beginGoogle('register'),googleUrl.href);assert(!google.isAuthenticated());
  assert.equal((await google.completeGoogleRegistration({photo:new Blob(['synthetic'],{type:'image/jpeg'}),capturedAt:new Date().toISOString(),consent:true})).status,'pending');assert(!google.isAuthenticated());
  await assert.rejects(()=>google.completeGoogleRegistration({photo:null,consent:false}),failure('VALIDATION'));
  const malicious=new URL(googleUrl);malicious.hostname='evil.example';redirect=malicious.href;await assert.rejects(()=>google.beginGoogle(),failure('INVALID_RESPONSE'));
  const extraScope=new URL(googleUrl);extraScope.searchParams.set('scope','openid email https://www.googleapis.com/auth/gmail.readonly');redirect=extraScope.href;await assert.rejects(()=>google.beginGoogle(),failure('INVALID_RESPONSE'));
  const wrongCallback=new URL(googleUrl);wrongCallback.searchParams.set('redirect_uri','https://elsewhere.example/callback');redirect=wrongCallback.href;await assert.rejects(()=>google.beginGoogle(),failure('INVALID_RESPONSE'));
  assert(!approved({...account,provider:'google',registrationComplete:false}));
  assert(!approved({...account,provider:'google'}));assert(approved({...account,provider:'google',registrationComplete:true}));
  assert(!approved({...account,role:'applicant'}));assert(!approved({...account,status:'pending'}));assert(!approved({...account,emailVerified:false}));
  let passkeyMode='approved',passkeyCalls=[],credentialCalls=0,credentialError=null,credentialFinish;
  const binary=()=>new Uint8Array([1,2,3,4]).buffer;
  const assertion={id:'test-credential',type:'public-key',rawId:binary(),response:{clientDataJSON:binary(),authenticatorData:binary(),signature:binary(),userHandle:null}};
  const credentialProvider={async get(options){credentialCalls++;assert.equal(options.publicKey.userVerification,'required');assert.equal(options.publicKey.rpId,'emma.example');assert(options.publicKey.challenge instanceof Uint8Array);assert(options.signal);if(credentialError)throw credentialError;if(passkeyMode==='wait')return new Promise(resolve=>credentialFinish=resolve);return assertion;}};
  const passkeyFetch=async(url,options)=>{
    passkeyCalls.push(url);
    if(url.endsWith('/session'))return response({user:null,csrfToken:'pk-csrf'});
    assert.equal(options.headers['X-CSRF-Token'],'pk-csrf');
    if(url.endsWith('/options'))return response({publicKey:{challenge:Buffer.alloc(32,1).toString('base64url'),rpId:passkeyMode==='wrong-rp'?'elsewhere.example':'emma.example',userVerification:'discouraged'}});
    const body=JSON.parse(options.body);assert.equal(body.rawId,'AQIDBA');assert.equal(body.response.userHandle,null);assert(!options.body.includes('password'));
    return response({user:passkeyMode==='pending'?{...account,status:'pending',role:'applicant'}:passkeyMode==='admin'?{...account,role:'admin'}:account});
  };
  const pk=create({apiBaseUrl:'/api/auth',passkeyEnabled:true},{location,fetch:passkeyFetch,passkeySupported:true,credentials:credentialProvider});
  const noPk=create({apiBaseUrl:'/api/auth'},{location,fetch:passkeyFetch,passkeySupported:true,credentials:credentialProvider});
  await assert.rejects(()=>noPk.loginPasskey(),failure('PASSKEY_NOT_CONFIGURED'));assert.equal(passkeyCalls.length,0);
  assert.equal((await pk.loginPasskey()).status,'approved');assert(pk.isAuthenticated());pk.forget();
  passkeyMode='pending';assert.equal((await pk.loginPasskey()).status,'pending');assert(!pk.isAuthenticated());
  passkeyMode='admin';await assert.rejects(()=>pk.loginPasskey(),failure('NOT_ALLOWED'));assert(!pk.isAuthenticated());
  passkeyMode='wrong-rp';const previous=credentialCalls;await assert.rejects(()=>pk.loginPasskey(),failure('INVALID_RESPONSE'));assert.equal(credentialCalls,previous);
  passkeyMode='approved';credentialError={name:'NotAllowedError'};await assert.rejects(()=>pk.loginPasskey(),failure('PASSKEY_CANCELED'));credentialError=null;
  passkeyMode='wait';const waiting=pk.loginPasskey();while(!credentialFinish)await new Promise(resolve=>setImmediate(resolve));
  const verifyCount=passkeyCalls.filter(url=>url.endsWith('/verify')).length;pk.cancelPasskey();credentialFinish(assertion);await assert.rejects(()=>waiting,failure('PASSKEY_CANCELED'));assert(!pk.isAuthenticated());assert.equal(passkeyCalls.filter(url=>url.endsWith('/verify')).length,verifyCount);
  passkeyMode='approved';let verifyFinish;
  const late=create({apiBaseUrl:'/api/auth',passkeyEnabled:true},{location,passkeySupported:true,credentials:credentialProvider,fetch:(url,options)=>url.endsWith('/verify')?new Promise(resolve=>verifyFinish=resolve):passkeyFetch(url,options)});
  const lateRequest=late.loginPasskey();while(!verifyFinish)await new Promise(resolve=>setImmediate(resolve));late.cancelPasskey();verifyFinish(response({user:account}));await assert.rejects(()=>lateRequest,failure('PASSKEY_CANCELED'));assert(!late.isAuthenticated());
  const root=path.resolve(__dirname,'..');for(const name of ['auth-config.js','auth-service.js','auth-ui.js'])new vm.Script(fs.readFileSync(path.join(root,name),'utf8'),{filename:name});
  const source=fs.readFileSync(path.join(root,'index.html'),'utf8');assert(!source.includes('btn-return-session'));assert(!source.includes('Vazhdo si Emma'));assert(source.includes('!hasWorkspaceAccess() || sessionExited'));
  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');assert(sw.includes("event.request.cache === 'no-store'"));assert(sw.includes('"./auth-service.js"'));
  assert(sw.includes("response.headers.get('Cache-Control')"));assert(sw.includes('no-store|private'));
  const workerHandlers={};vm.runInNewContext(sw,{URL,self:{location:{origin:location.origin},addEventListener:(type,fn)=>workerHandlers[type]=fn}});
  for(const request of [{url:location.origin+'/api/auth/session',method:'GET',cache:'default'},{url:location.origin+'/custom-session',method:'GET',cache:'no-store'},{url:location.origin+'/api/auth/login',method:'POST',cache:'default'}]){
    let intercepted=false;workerHandlers.fetch({request,respondWith(){intercepted=true;}});assert(!intercepted,'Auth traffic must bypass the service worker entirely');
  }
  assert(!fs.readFileSync(path.join(root,'auth-service.js'),'utf8').includes('localStorage'));
  console.log('PASS: auth gates, Google validation, passkey server verification/cancel/RP checks, CSRF, photo payload, logout, stale responses and API cache bypass');
})().catch(error=>{console.error(error);process.exitCode=1;});
