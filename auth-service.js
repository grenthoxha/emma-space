(function(root) {
  'use strict';
  class AuthError extends Error {
    constructor(code,message){super(message);this.name='AuthError';this.code=code;}
  }
  const messages={NOT_CONFIGURED:'Hyrja online ende nuk është aktivizuar. Duhet të lidhet serveri i autentikimit.',NETWORK:'Nuk u lidhëm me serverin. Kontrollo lidhjen dhe provo përsëri.',INVALID_CREDENTIALS:'Emaili ose fjalëkalimi nuk është i saktë.',PENDING_APPROVAL:'Kërkesa jote ende pret miratimin.',REJECTED:'Kërkesa nuk është miratuar.',RATE_LIMITED:'Shumë tentativa. Prit pak dhe provo përsëri.',CSRF_REQUIRED:'Serveri i hyrjes nuk është konfiguruar plotësisht.',INVALID_RESPONSE:'Serveri i hyrjes ktheu një përgjigje të papritur.',NOT_ALLOWED:'Kjo llogari nuk ka leje të hapë hapësirën e Emmës.'};
  const email=value=>String(value || '').trim().toLowerCase();
  const validEmail=value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)&&value.length<=254;
  const approved=user=>!!(user&&typeof user.id==='string'&&user.id&&validEmail(email(user.email))&&user.role==='emma'&&user.status==='approved'&&user.emailVerified===true&&user.registrationComplete!==false&&(user.provider!=='google'||user.registrationComplete===true));
  function create(config={},env={}) {
    if(config.provider==='supabase'){
      if(!root.EmmaSupabaseAuth)throw new AuthError('NOT_CONFIGURED','Biblioteka e hyrjes nuk u ngarkua.');
      return root.EmmaSupabaseAuth.create(config,env);
    }
    const location=env.location || root.location || {},fetcher=env.fetch || root.fetch?.bind(root);
    let base='',csrf='',user=null,generation=0;
    if(config.apiBaseUrl) {
      const url=new URL(config.apiBaseUrl,location.origin);
      const local=url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname);
      if(url.origin!==location.origin||!(url.protocol==='https:'||local)||url.search||url.hash||url.username||url.password)throw new AuthError('INVALID_CONFIG','API-ja duhet të jetë në të njëjtën origjinë HTTPS (localhost lejohet për zhvillim).');
      base=url.href.replace(/\/$/,'');
    }
    const configured=!!base&&!!fetcher;
    const googleConfigured=configured&&config.googleEnabled===true;
    const credentials=env.credentials||root.navigator?.credentials;
    const passkeySupported=env.passkeySupported??!!(root.isSecureContext&&root.PublicKeyCredential&&credentials?.get);
    const passkeyConfigured=configured&&config.passkeyEnabled===true&&passkeySupported;
    let passkeyController=null;
    function cancelPasskey(){passkeyController?.abort();passkeyController=null;}
    function decode(value){
      if(typeof value!=='string'||!/^[A-Za-z0-9_-]+$/.test(value)||value.length>8192)throw fail('INVALID_RESPONSE');
      try{return Uint8Array.from(root.atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}catch{throw fail('INVALID_RESPONSE');}
    }
    function encode(value){
      if(!(value instanceof ArrayBuffer)||!value.byteLength||value.byteLength>65536)throw fail('INVALID_RESPONSE');
      return root.btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    }
    function fail(code){return new AuthError(code,messages[code]||'Kërkesa nuk u krye. Provo përsëri.');}
    async function request(path,{method='GET',body}={}) {
      if(!configured)throw fail('NOT_CONFIGURED');
      const epoch=generation;
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.min(30000,Math.max(1000,Number(config.timeoutMs)||15000)));
      const headers={Accept:'application/json'};
      if(method!=='GET'){if(!csrf){clearTimeout(timer);throw fail('CSRF_REQUIRED');}headers['X-CSRF-Token']=csrf;}
      const multipart=typeof FormData!=='undefined'&&body instanceof FormData;
      if(body&&!multipart)headers['Content-Type']='application/json';
      try {
        const response=await fetcher(base+path,{method,headers,body:body?(multipart?body:JSON.stringify(body)):undefined,credentials:'same-origin',mode:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal});
        let data;try{data=await response.json();}catch{throw fail('INVALID_RESPONSE');}
        if(epoch===generation&&data&&typeof data.csrfToken==='string')csrf=data.csrfToken;
        if(!response.ok){if(epoch===generation&&response.status===401)user=null;throw fail(response.status===429?'RATE_LIMITED':data?.code || 'INVALID_RESPONSE');}
        return data;
      }catch(error){if(error instanceof AuthError)throw error;throw fail('NETWORK');}
      finally{clearTimeout(timer);}
    }
    function acceptSession(data) {
      if(!data||!Object.hasOwn(data,'user'))throw fail('INVALID_RESPONSE');
      user=null;
      if(data.user===null)return {user:null,status:'anonymous'};
      const candidate=data.user;
      if(!candidate||typeof candidate.id!=='string'||!validEmail(email(candidate.email)))throw fail('INVALID_RESPONSE');
      if(approved(candidate)){user={id:candidate.id,email:email(candidate.email),role:'emma',status:'approved',emailVerified:true};return {user,status:'approved'};}
      if(candidate.status==='pending'&&candidate.provider==='google'&&candidate.registrationComplete===false&&candidate.emailVerified===true){
        return {user:null,status:'photo_required',email:email(candidate.email),emailVerified:true};
      }
      if(candidate.status==='pending')return {user:null,status:'pending',emailVerified:candidate.emailVerified===true};
      if(candidate.status==='rejected')return {user:null,status:'rejected'};
      throw fail('NOT_ALLOWED');
    }
    const unchanged=epoch=>{if(epoch!==generation)throw new AuthError('SESSION_ENDED','Sesioni ndryshoi. Kyçu përsëri.');};
    async function session(){const epoch=generation;const data=await request('/session');unchanged(epoch);return acceptSession(data);}
    async function ensureCsrf(){if(!csrf)await request('/session');if(!csrf)throw fail('CSRF_REQUIRED');}
    function photoForm({photo,capturedAt,consent}){
      if(!consent||!(photo instanceof Blob)||photo.type!=='image/jpeg'||photo.size>1024*1024||!photo.size)throw new AuthError('VALIDATION','Duhet fotografi nga kamera dhe pëlqimi yt për dërgimin.');
      const data=new FormData();data.set('photo',photo,'capture.jpg');data.set('capturedAt',String(capturedAt||''));data.set('photoConsent','true');return data;
    }
    return {configured,googleConfigured,passkeyConfigured,passkeySupported,cancelPasskey,approved,AuthError,
      session,
      async loginPasskey(){
        if(!passkeyConfigured)throw new AuthError('PASSKEY_NOT_CONFIGURED','Hyrja me passkey ende nuk është aktivizuar. Përdor emailin ose Google.');
        cancelPasskey();const controller=new AbortController();passkeyController=controller;
        const epoch=++generation;user=null;
        try{
          await ensureCsrf();unchanged(epoch);
          const options=await request('/passkeys/login/options',{method:'POST',body:{}});unchanged(epoch);
          if(controller.signal.aborted)throw new DOMException('Canceled','AbortError');
          const key=options?.publicKey,host=new URL(base).hostname;
          if(!key||key.rpId!==host)throw fail('INVALID_RESPONSE');
          const challenge=decode(key.challenge);if(challenge.byteLength<16||challenge.byteLength>512)throw fail('INVALID_RESPONSE');
          if(key.allowCredentials!==undefined&&(!Array.isArray(key.allowCredentials)||key.allowCredentials.length>64))throw fail('INVALID_RESPONSE');
          const allowCredentials=(key.allowCredentials||[]).map(item=>{if(item?.type!=='public-key')throw fail('INVALID_RESPONSE');return {type:'public-key',id:decode(item.id)};});
          const credential=await credentials.get({publicKey:{challenge,rpId:host,allowCredentials,userVerification:'required',timeout:60000},signal:controller.signal});
          unchanged(epoch);if(controller.signal.aborted)throw new DOMException('Canceled','AbortError');
          if(!credential||credential.type!=='public-key'||typeof credential.id!=='string'||!credential.response)throw fail('INVALID_RESPONSE');
          const reply=credential.response;
          const data=await request('/passkeys/login/verify',{method:'POST',body:{id:credential.id,rawId:encode(credential.rawId),type:'public-key',response:{clientDataJSON:encode(reply.clientDataJSON),authenticatorData:encode(reply.authenticatorData),signature:encode(reply.signature),userHandle:reply.userHandle===null?null:encode(reply.userHandle)}}});
          unchanged(epoch);if(controller.signal.aborted)throw new DOMException('Canceled','AbortError');return acceptSession(data);
        }catch(error){
          if(error instanceof AuthError)throw error;
          if(['NotAllowedError','AbortError'].includes(error?.name))throw new AuthError('PASSKEY_CANCELED','Hyrja u anulua. Mund të provosh përsëri ose të përdorësh emailin.');
          throw new AuthError('PASSKEY_FAILED','Passkey nuk u përdor. Provo përsëri ose hyr me email.');
        }finally{if(passkeyController===controller)passkeyController=null;}
      },
      async beginGoogle(intent='register'){
        if(!googleConfigured)throw new AuthError('GOOGLE_NOT_CONFIGURED','Hyrja me Google ende nuk është konfiguruar.');
        if(!['login','register'].includes(intent))throw new AuthError('VALIDATION','Zgjedhje e pavlefshme.');
        const epoch=++generation;user=null;await ensureCsrf();const result=await request('/google/start',{method:'POST',body:{intent}});unchanged(epoch);
        let url,callback;try{url=new URL(result.authorizationUrl);callback=new URL(url.searchParams.get('redirect_uri'));}catch{throw fail('INVALID_RESPONSE');}
        const scope=new Set((url.searchParams.get('scope')||'').trim().split(/\s+/));
        if(url.protocol!=='https:'||url.hostname!=='accounts.google.com'||url.port||url.pathname!=='/o/oauth2/v2/auth'||url.hash||url.username||url.password||url.searchParams.get('response_type')!=='code'||!url.searchParams.get('client_id')||!url.searchParams.get('state')||!url.searchParams.get('nonce')||url.searchParams.get('code_challenge_method')!=='S256'||!/^[A-Za-z0-9_-]{43,128}$/.test(url.searchParams.get('code_challenge')||'')||callback.href!==base+'/google/callback'||!scope.has('openid')||!scope.has('email')||[...scope].some(value=>!['openid','email','profile'].includes(value)))throw fail('INVALID_RESPONSE');
        return url.href;
      },
      async completeGoogleRegistration(payload){
        const data=photoForm(payload),epoch=++generation;user=null;await ensureCsrf();const result=await request('/google/complete',{method:'POST',body:data});unchanged(epoch);
        if(result?.status!=='pending')throw fail('INVALID_RESPONSE');return {user:null,status:'pending',emailVerified:true};
      },
      async login(address,password){if(!validEmail(email(address))||!password)throw new AuthError('VALIDATION','Vendos emailin dhe fjalëkalimin.');const epoch=++generation;user=null;await ensureCsrf();const data=await request('/login',{method:'POST',body:{email:email(address),password}});unchanged(epoch);return acceptSession(data);},
      async register({email:address,password,photo,capturedAt,consent}){
        if(!validEmail(email(address))||typeof password!=='string'||password.length<12||password.length>128)throw new AuthError('VALIDATION','Përdor email të vlefshëm dhe fjalëkalim me 12–128 shenja.');
        const data=photoForm({photo,capturedAt,consent}),epoch=++generation;user=null;await ensureCsrf();data.set('email',email(address));data.set('password',password);
        const result=await request('/register',{method:'POST',body:data});
        unchanged(epoch);
        if(result?.status!=='pending')throw fail('INVALID_RESPONSE');user=null;return {user:null,status:'pending',emailVerified:result.emailVerified===true};
      },
      async logout(){cancelPasskey();generation++;user=null;try{if(!csrf)await request('/session');await request('/logout',{method:'POST',body:{}});}finally{user=null;csrf='';generation++;}},
      forget(){cancelPasskey();generation++;user=null;csrf='';},isAuthenticated:()=>approved(user)
    };
  }
  const api={create,approved,validEmail,AuthError};if(typeof module==='object'&&module.exports)module.exports=api;else root.EmmaAuthService=api;
})(globalThis);
