(function(root){
  'use strict';
  const KEY='emma-space-supabase-session';
  const validEmail=value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)&&value.length<=254;
  class AuthError extends Error{constructor(code,message){super(message);this.name='AuthError';this.code=code;}}
  function create(config={},env={}){
    const location=env.location||root.location, sdk=env.sdk||root.supabase;
    let endpoint,redirect;
    try{endpoint=new URL(config.supabaseUrl);redirect=new URL(config.redirectUrl);}catch{throw new AuthError('INVALID_CONFIG','Konfigurimi i Supabase mungon.');}
    if(endpoint.protocol!=='https:'||!/^[-a-z0-9]+\.supabase\.co$/.test(endpoint.hostname)||endpoint.port||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||endpoint.pathname!=='/'||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.supabasePublishableKey||'')||redirect.protocol!=='https:'||redirect.username||redirect.password||redirect.search||redirect.hash)throw new AuthError('INVALID_CONFIG','Konfigurimi i Supabase nuk është i vlefshëm.');
    const local=location?.protocol==='file:'||['localhost','127.0.0.1','[::1]'].includes(location?.hostname);
    if(!local&&new URL(location.href).origin!==redirect.origin)throw new AuthError('INVALID_CONFIG','Adresa e aplikacionit nuk përputhet me hyrjen.');
    if(!sdk?.createClient)throw new AuthError('NOT_CONFIGURED','Biblioteka e hyrjes nuk u ngarkua. Rifresko aplikacionin.');
    const backing=env.storage||root.sessionStorage;
    // Session and PKCE verifier live only in this browser tab, never app backups.
    const storage={getItem:key=>backing.getItem(key),setItem:(key,value)=>backing.setItem(key,value),removeItem:key=>backing.removeItem(key)};
    const fetcher=env.fetch||root.fetch.bind(root);
    const client=sdk.createClient(endpoint.origin,config.supabasePublishableKey,{auth:{storageKey:KEY,storage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,flowType:'pkce'},global:{fetch:(input,init={})=>fetcher(input,{...init,cache:'no-store',referrerPolicy:'no-referrer'})}});
    let approvedUser=null,generation=0,callbackPromise=null,locallyEnded=false,recoverySession=false;
    client.auth.onAuthStateChange?.(event=>{if(event==='PASSWORD_RECOVERY')recoverySession=true;if(event==='SIGNED_OUT'){approvedUser=null;recoverySession=false;}});
    const migrateAdminSession=async()=>{
      if(storage.getItem(KEY)||!client.auth.setSession)return;
      const legacy=storage.getItem('emma-space-admin-session');if(!legacy)return;
      try{const value=JSON.parse(legacy);if(value.access_token&&value.refresh_token){const result=await client.auth.setSession({access_token:value.access_token,refresh_token:value.refresh_token});if(!result.error)storage.removeItem('emma-space-admin-session');}}catch{}
    };
    function fail(error){
      const code=error?.code||'';
      if(code==='invalid_credentials')return new AuthError(code,'Emaili ose fjalëkalimi nuk është i saktë.');
      if(code==='email_not_confirmed')return new AuthError(code,'Konfirmo emailin nga mesazhi i verifikimit, pastaj hyr përsëri.');
      if(code==='email_address_not_authorized')return new AuthError(code,'Dërgimi i emailit të verifikimit ende duhet të konfigurohet nga pronari.');
      if(error?.status===429||code.includes('rate_limit'))return new AuthError('RATE_LIMITED','Shumë tentativa. Prit pak dhe provo përsëri.');
      if(code==='signup_disabled')return new AuthError(code,'Regjistrimet janë të mbyllura.');
      if(code==='weak_password')return new AuthError(code,'Përdor një fjalëkalim më të fortë me së paku 12 shenja.');
      if(['PGRST205','42P01','42501'].includes(code))return new AuthError('SETUP_REQUIRED','Konfigurimi i hyrjes nuk është përfunduar. Kontakto pronarin.');
      return new AuthError('AUTH_FAILED','Hyrja nuk u krye. Kontrollo lidhjen dhe provo përsëri.');
    }
    function current(epoch){if(epoch!==generation){if(locallyEnded)clearStorage();throw new AuthError('SESSION_ENDED','Sesioni ndryshoi. Kyçu përsëri.');}}
    function clearStorage(){for(const base of [KEY,'emma-space-admin-session'])for(const suffix of ['', '-code-verifier','-user'])storage.removeItem(base+suffix);}
    async function callback(){
      if(callbackPromise)return callbackPromise;
      callbackPromise=(async()=>{
        const url=new URL(location.href),code=url.searchParams.get('code'),error=url.searchParams.get('error'),tokenHash=url.searchParams.get('token_hash'),type=url.searchParams.get('type');
        if(!code&&!error&&!tokenHash)return;
        // Remove single-use auth parameters before any app rendering or caching.
        for(const key of ['code','error','error_code','error_description','sb_flow_id','token_hash','type'])url.searchParams.delete(key);
        (env.history||root.history)?.replaceState(null,'',url.href);
        if(error)throw new AuthError('CALLBACK_FAILED','Verifikimi nuk përfundoi. Provo të hysh përsëri.');
        if(tokenHash&&(!['recovery','signup'].includes(type)||!/^[A-Za-z0-9_-]{20,256}$/.test(tokenHash)))throw new AuthError('CALLBACK_FAILED','Lidhja e verifikimit nuk është e vlefshme.');
        const result=tokenHash?await client.auth.verifyOtp({token_hash:tokenHash,type}):await client.auth.exchangeCodeForSession(code);
        if(result.error)throw new AuthError('CALLBACK_FAILED','Nëse e konfirmove emailin, zgjidh “Hyr” dhe përdor fjalëkalimin. Për Google, nise përsëri nga kjo faqe.');
        if(tokenHash&&type==='recovery'&&result.data?.session)recoverySession=true;
      })();
      try{return await callbackPromise;}finally{callbackPromise=Promise.resolve();}
    }
    async function readSession(epoch){
      approvedUser=null;
      await migrateAdminSession();current(epoch);
      const {data:localSession,error:sessionError}=await client.auth.getSession();current(epoch);
      if(sessionError)throw fail(sessionError);
      if(!localSession.session)return {user:null,status:'anonymous'};
      // getUser verifies against Auth; neither local JWT claims nor metadata approve access.
      const {data,error}=await client.auth.getUser();current(epoch);
      if(error)throw fail(error);
      const user=data?.user;
      if(!user?.id||!validEmail(user.email||'')||user.is_anonymous)throw new AuthError('NOT_ALLOWED','Kjo llogari nuk ka leje të hapë hapësirën e Emmës.');
      if(!user.email_confirmed_at)return {user:null,status:'pending',emailVerified:false};
      if(recoverySession)return {user:null,status:'password_recovery',email:user.email,emailVerified:true};
      const administrator=await client.rpc('emma_am_i_administrator');current(epoch);
      if(administrator.error)throw fail(administrator.error);
      if(administrator.data===true)return {status:'administrator',user:{id:user.id,email:user.email,role:'administrator'},emailVerified:true};
      const request=await client.from('emma_access_requests').select('user_id,status,photo_path').eq('user_id',user.id).maybeSingle();current(epoch);
      if(request.error)throw fail(request.error);
      if(!request.data)return {user:null,status:'photo_required',email:user.email,emailVerified:true};
      if(request.data.user_id!==user.id)throw new AuthError('NOT_ALLOWED','Llogaria nuk u verifikua.');
      if(request.data.status==='approved'&&request.data.photo_path===user.id+'/capture.jpg'){
        approvedUser={id:user.id,email:user.email,role:'emma',status:'approved',emailVerified:true,registrationComplete:true};
        return {user:approvedUser,status:'approved',email:user.email,emailVerified:true};
      }
      if(request.data.status==='pending')return {user:null,status:'pending',emailVerified:true};
      if(['rejected','revoked'].includes(request.data.status))return {user:null,status:'rejected',emailVerified:true};
      throw new AuthError('NOT_ALLOWED','Kjo llogari nuk ka leje të hapë hapësirën e Emmës.');
    }
    const service={configured:true,emailVerificationFirst:true,googleConfigured:config.googleEnabled===true,passkeyConfigured:false,passkeySupported:false,AuthError,
      cancelPasskey(){},
      async session(){const epoch=generation;await callback();current(epoch);return readSession(epoch);},
      async login(address,password){
        const email=String(address||'').trim().toLowerCase();if(!validEmail(email)||!password)throw new AuthError('VALIDATION','Vendos emailin dhe fjalëkalimin.');
        const epoch=++generation;locallyEnded=false;approvedUser=null;const {error}=await client.auth.signInWithPassword({email,password});current(epoch);if(error)throw fail(error);return readSession(epoch);
      },
      async register({email:address,password}){
        const email=String(address||'').trim().toLowerCase();if(!validEmail(email)||typeof password!=='string'||password.length<12||password.length>128)throw new AuthError('VALIDATION','Përdor email të vlefshëm dhe fjalëkalim me 12–128 shenja.');
        const epoch=++generation;locallyEnded=false;approvedUser=null;
        const {data,error}=await client.auth.signUp({email,password,options:{emailRedirectTo:redirect.href}});current(epoch);if(error)throw fail(error);
        if(data?.session)return readSession(epoch);
        return {user:null,status:'pending',email,emailVerified:false};
      },
      async beginGoogle(){
        if(!service.googleConfigured)throw new AuthError('GOOGLE_NOT_CONFIGURED','Hyrja me Google ende nuk është konfiguruar.');
        const epoch=++generation;locallyEnded=false;approvedUser=null;
        const {data,error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:redirect.href,skipBrowserRedirect:true,scopes:'openid email profile'}});
        current(epoch);if(error)throw fail(error);
        const target=new URL(data?.url||'');if(target.origin!==endpoint.origin||target.pathname!=='/auth/v1/authorize')throw new AuthError('INVALID_RESPONSE','Adresa e Google nuk u verifikua.');
        return target.href;
      },
      async completeGoogleRegistration({photo,capturedAt,consent}){
        if(consent!==true||!(photo instanceof Blob)||photo.type!=='image/jpeg'||!photo.size||photo.size>1048576||!Number.isFinite(Date.parse(capturedAt)))throw new AuthError('VALIDATION','Shkrep fotografinë dhe jep pëlqimin për dërgimin.');
        const epoch=++generation;approvedUser=null;
        const before=await readSession(epoch);
        if(before.status!=='photo_required')throw new AuthError('NOT_ALLOWED','Hyr përsëri për të përfunduar regjistrimin.');
        const {data,error}=await client.auth.getUser();current(epoch);if(error)throw fail(error);
        const path=data.user.id+'/capture.jpg';
        const upload=await client.storage.from('emma-registration').upload(path,photo,{upsert:true,contentType:'image/jpeg',cacheControl:'0'});current(epoch);if(upload.error)throw fail(upload.error);
        const saved=await client.from('emma_access_requests').insert({user_id:data.user.id,photo_path:path,captured_at:capturedAt});current(epoch);if(saved.error)throw fail(saved.error);
        return {user:null,status:'pending',emailVerified:true};
      },
      async resendConfirmation(address){
        const email=String(address||'').trim().toLowerCase();if(!validEmail(email))throw new AuthError('VALIDATION','Vendos email të vlefshëm.');
        const {error}=await client.auth.resend({type:'signup',email,options:{emailRedirectTo:redirect.href}});if(error)throw fail(error);
      },
      async forgotPassword(address){
        const email=String(address||'').trim().toLowerCase();if(!validEmail(email))throw new AuthError('VALIDATION','Vendos email të vlefshëm.');
        const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:redirect.href});if(error)throw fail(error);
      },
      async updatePassword(password){
        if(!recoverySession||typeof password!=='string'||password.length<12||password.length>128)throw new AuthError('VALIDATION','Hap lidhjen e rikthimit dhe vendos fjalëkalim me 12–128 shenja.');
        const epoch=++generation;const {error}=await client.auth.updateUser({password});current(epoch);if(error)throw fail(error);recoverySession=false;await service.logout();return {status:'login'};
      },
      getIdentity:()=>approvedUser?{...approvedUser}:null,
      async notificationData(operation,payload){
        const epoch=generation;const result=await readSession(epoch);if(result.status!=='approved')throw new AuthError('NOT_ALLOWED','Kërkohet llogaria e miratuar.');
        let response;
        if(operation==='subscribe')response=await client.from('emma_push_devices').upsert({...payload,user_id:approvedUser.id},{onConflict:'id'}).select('id').single();
        else if(operation==='jobs')response=await client.rpc('emma_replace_push_jobs',{p_device_id:payload.deviceId,p_jobs:payload.jobs});
        else if(operation==='disable')response=await client.from('emma_push_devices').delete().eq('id',payload.deviceId).eq('user_id',approvedUser.id);
        else if(operation==='test')response=await client.functions.invoke('emma-reminders',{body:{action:'test',deviceId:payload.deviceId}});
        else throw new AuthError('VALIDATION','Veprim i pavlefshëm.');
        current(epoch);if(response.error)throw fail(response.error);return response.data;
      },
      async logout(){++generation;locallyEnded=true;approvedUser=null;try{const {error}=await client.auth.signOut({scope:'local'});if(error)throw fail(error);}finally{clearStorage();approvedUser=null;++generation;}},
      forget(){++generation;locallyEnded=true;approvedUser=null;clearStorage();},
      isAuthenticated:()=>approvedUser!==null
    };
    return service;
  }
  const api={create,AuthError};if(typeof module==='object'&&module.exports)module.exports=api;else root.EmmaSupabaseAuth=api;
})(globalThis);
