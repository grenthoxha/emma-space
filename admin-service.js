(function(root){
  'use strict';
  const KEY='emma-space-supabase-session';
  class AdminError extends Error{constructor(code,message){super(message);this.code=code;}}
  function create(config={},env={}){
    const sdk=env.sdk||root.supabase,location=env.location||root.location;
    const base=new URL(config.supabaseUrl),redirect=new URL('admin.html',config.redirectUrl);
    if(base.protocol!=='https:'||!/^[-a-z0-9]+\.supabase\.co$/.test(base.hostname)||base.port||base.username||base.password||base.search||base.hash||base.pathname!=='/'||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.supabasePublishableKey||'')||redirect.protocol!=='https:'||redirect.username||redirect.password||redirect.search||redirect.hash)throw new AdminError('CONFIG','Konfigurimi i panelit nuk është i vlefshëm.');
    if(location.protocol!=='file:'&&!['localhost','127.0.0.1','[::1]'].includes(location.hostname)&&new URL(location.href).origin!==redirect.origin)throw new AdminError('CONFIG','Adresa e panelit nuk përputhet.');
    const backing=env.storage||root.sessionStorage,fetcher=env.fetch||root.fetch.bind(root);
    const storage={getItem:key=>backing.getItem(key),setItem:(key,value)=>backing.setItem(key,value),removeItem:key=>backing.removeItem(key)};
    const client=sdk.createClient(base.origin,config.supabasePublishableKey,{auth:{storageKey:KEY,storage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,flowType:'pkce'},global:{fetch:(input,init={})=>fetcher(input,{...init,cache:'no-store',referrerPolicy:'no-referrer'})}});
    let epoch=0,callbackDone=false;
    function unchanged(start){if(start!==epoch)throw new AdminError('ENDED','Sesioni u mbyll.');}
    function failure(error){
      if(error?.code==='23505')return new AdminError('ONE_USER','Një përdorues është tashmë i pranuar. Hiq qasjen e tij përpara se të pranosh një tjetër.');
      if(['42501','PGRST301'].includes(error?.code))return new AdminError('FORBIDDEN','Nuk ke të drejtë ta kryesh këtë veprim.');
      if(['42883','PGRST202','PGRST205'].includes(error?.code))return new AdminError('SETUP','Paneli pret aktivizimin në Supabase.');
      if(error?.code==='invalid_credentials')return new AdminError('LOGIN','Emaili ose fjalëkalimi nuk është i saktë.');
      if(error?.code==='email_not_confirmed')return new AdminError('EMAIL','Konfirmo emailin, pastaj hyr përsëri.');
      if(error?.code==='email_address_not_authorized')return new AdminError('SMTP','Dërgimi i emailit ende duhet të konfigurohet në Supabase.');
      if(error?.status===429)return new AdminError('LIMIT','Prit pak përpara se të provosh përsëri.');
      return new AdminError('NETWORK','Veprimi nuk u krye. Kontrollo lidhjen dhe provo përsëri.');
    }
    async function identity(start){
      if(!storage.getItem(KEY)&&client.auth.setSession){try{const old=JSON.parse(storage.getItem('emma-space-admin-session')||'null');if(old?.access_token&&old?.refresh_token){const migrated=await client.auth.setSession({access_token:old.access_token,refresh_token:old.refresh_token});if(!migrated.error)storage.removeItem('emma-space-admin-session');}}catch{}}
      const local=await client.auth.getSession();unchanged(start);if(local.error)throw failure(local.error);
      if(!local.data?.session)return null;
      const result=await client.auth.getUser();unchanged(start);if(result.error)throw failure(result.error);
      const user=result.data?.user;if(!user?.id||!user.email_confirmed_at||user.is_anonymous)throw new AdminError('FORBIDDEN','Kërkohet llogari e verifikuar.');
      return {id:user.id,email:user.email};
    }
    async function administrator(start){
      const user=await identity(start);if(!user)throw new AdminError('LOGIN','Hyr për të vazhduar.');
      const result=await client.rpc('emma_am_i_administrator');unchanged(start);if(result.error)throw failure(result.error);
      if(result.data!==true)throw new AdminError('FORBIDDEN','Kjo llogari nuk është aktivizuar si administrator.');
      return user;
    }
    async function session(){
      const start=epoch;
      if(!callbackDone){
        callbackDone=true;const url=new URL(location.href),code=url.searchParams.get('code'),error=url.searchParams.get('error');
        if(code||error){for(const key of ['code','error','error_code','error_description','sb_flow_id'])url.searchParams.delete(key);(env.history||root.history)?.replaceState(null,'',url.href);if(error)throw new AdminError('CALLBACK','Verifikimi u anulua. Provo përsëri.');const result=await client.auth.exchangeCodeForSession(code);unchanged(start);if(result.error)throw new AdminError('CALLBACK','Nëse emaili u konfirmua, hyr me fjalëkalimin tënd.');}
      }
      const user=await identity(start);if(!user)return {status:'anonymous'};
      const result=await client.rpc('emma_am_i_administrator');unchanged(start);if(result.error)throw failure(result.error);
      return {status:result.data===true?'administrator':'not_administrator',user};
    }
    function credentials(email,password,register=false){email=String(email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||typeof password!=='string'||!password||(register&&(password.length<12||password.length>128)))throw new AdminError('VALIDATION','Vendos email të vlefshëm dhe fjalëkalim'+(register?' me 12–128 shenja.':'.'));return {email,password};}
    return {session,
      async login(email,password){const start=++epoch;const result=await client.auth.signInWithPassword(credentials(email,password));unchanged(start);if(result.error)throw failure(result.error);return session();},
      async register(email,password){const start=++epoch;const result=await client.auth.signUp({...credentials(email,password,true),options:{emailRedirectTo:redirect.href}});unchanged(start);if(result.error)throw failure(result.error);return {status:'verify_email'};},
      async list(){const start=epoch;const user=await administrator(start);const result=await client.from('emma_access_requests').select('user_id,email,status,photo_path,created_at,reviewed_at').order('created_at',{ascending:false}).limit(200);unchanged(start);if(result.error)throw failure(result.error);return {user,requests:result.data||[]};},
      async photo(request){const start=epoch;await administrator(start);if(!request||request.photo_path!==request.user_id+'/capture.jpg'||!/^[a-f0-9-]{36}$/.test(request.user_id))throw new AdminError('VALIDATION','Fotografia nuk u identifikua.');const result=await client.storage.from('emma-registration').download(request.photo_path);unchanged(start);if(result.error)throw failure(result.error);if(!(result.data instanceof Blob)||result.data.type!=='image/jpeg'||result.data.size>1048576)throw new AdminError('PHOTO','Fotografia nuk u hap.');return result.data;},
      async review(userId,previousStatus,status){
        const start=epoch,user=await administrator(start);
        if(!/^[a-f0-9-]{36}$/.test(userId)||userId===user.id||!['pending','approved','rejected','revoked'].includes(previousStatus)||!['approved','rejected','revoked'].includes(status)||status===previousStatus)throw new AdminError('VALIDATION','Zgjedhje e pavlefshme për miratim.');
        const result=await client.from('emma_access_requests').update({status}).eq('user_id',userId).eq('status',previousStatus).select('user_id,status');unchanged(start);if(result.error)throw failure(result.error);
        if(result.data?.length!==1||result.data[0].status!==status)throw new AdminError('CHANGED','Kërkesa ka ndryshuar. Rifresko listën dhe shikoje përsëri.');return result.data[0];
      },
      async logout(){++epoch;try{const result=await client.auth.signOut({scope:'local'});if(result.error)throw failure(result.error);}finally{for(const base of [KEY,'emma-space-admin-session'])for(const suffix of ['','-code-verifier','-user'])storage.removeItem(base+suffix);++epoch;}},
      cancel(){++epoch;}
    };
  }
  const api={create,AdminError};if(typeof module==='object'&&module.exports)module.exports=api;else root.EmmaAdminService=api;
})(globalThis);
