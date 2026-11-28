import { createClient } from 'npm:@supabase/supabase-js@2.119.2';
import * as webpush from 'npm:web-push@4.0.0';

const APP='https://grenthoxha.github.io/emma-space/';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const cors={'Access-Control-Allow-Origin':new URL(APP).origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Cache-Control':'no-store','Vary':'Origin'};
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json'}});
function endpointAllowed(value:string){try{const u=new URL(value);return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&(u.hostname==='fcm.googleapis.com'||u.hostname.endsWith('.push.apple.com')||u.hostname==='updates.push.services.mozilla.com'||u.hostname.endsWith('.notify.windows.com'));}catch{return false;}}
function quiet(device:any){try{const now=new Intl.DateTimeFormat('en-GB',{timeZone:device.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date()),start=device.quiet_start.slice(0,5),end=device.quiet_end.slice(0,5);return start!==end&&(start<end?now>=start&&now<end:now>=start||now<end);}catch{return true;}}
async function equalSecret(a:string,b:string){const digest=async(v:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)));const [x,y]=await Promise.all([digest(a),digest(b)]);let difference=0;for(let i=0;i<x.length;i++)difference|=x[i]^y[i];return difference===0;}
async function settings(){
 const existing=await db.from('emma_push_settings').select('*').eq('id',true).single();if(existing.error)throw new Error('Configuration unavailable');
 if(existing.data.public_key&&existing.data.private_key)return existing.data;
 const keys=webpush.generateVAPIDKeys();const saved=await db.from('emma_push_settings').update({public_key:keys.publicKey,private_key:keys.privateKey}).eq('id',true).is('public_key',null).select('*').maybeSingle();
 if(saved.error)throw new Error('Key setup failed');if(saved.data)return saved.data;
 const winner=await db.from('emma_push_settings').select('*').eq('id',true).single();if(winner.error||!winner.data.public_key)throw new Error('Key setup incomplete');return winner.data;
}
async function approved(userId:string){const r=await db.from('emma_access_requests').select('status').eq('user_id',userId).maybeSingle();if(r.error||r.data?.status!=='approved')return false;const u=await db.auth.admin.getUserById(userId);return !u.error&&!!u.data.user?.email_confirmed_at&&!u.data.user.is_anonymous;}
async function send(device:any,kind:string,key:string,configuration:any,test=false){
 if(!endpointAllowed(device.endpoint))throw Object.assign(new Error('Unsupported push endpoint'),{statusCode:410});
 const body=test?'Kujtesat e tua janë gati.':kind==='exam'?'Po afrohet orari i provimit.':kind==='lesson'?'Po afrohet ora e mësimit.':'Koha për detyrën tënde.';
 await webpush.sendNotification({endpoint:device.endpoint,keys:{p256dh:device.p256dh,auth:device.auth_key}},JSON.stringify({title:'Emma’s Space',body,tag:key,url:APP+'#study'}),{TTL:3600,urgency:'normal',timeout:12000,vapidDetails:{subject:APP,publicKey:configuration.public_key,privateKey:configuration.private_key}});
}
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(!['GET','POST'].includes(request.method))return reply({error:'Method not allowed'},405);
 try{
  const configuration=await settings();
  if(request.method==='GET')return reply({ready:true,publicKey:configuration.public_key});
  const secret=request.headers.get('X-Emma-Scheduler-Secret')||'';
  if(secret&&await equalSecret(secret,configuration.scheduler_secret)){
   const claimed=await db.rpc('emma_claim_push_jobs');if(claimed.error)throw new Error('Queue unavailable');let sent=0;
   for(const job of claimed.data||[]){
    const found=await db.from('emma_push_devices').select('*').eq('id',job.device_id).eq('user_id',job.user_id).maybeSingle(),device=found.data;
    if(found.error||!device?.enabled||!await approved(job.user_id)||quiet(device)){await db.from('emma_push_jobs').update({status:'skipped'}).eq('id',job.id);continue;}
    try{await send(device,job.kind,job.event_key,configuration);await db.from('emma_push_jobs').update({status:'sent'}).eq('id',job.id);sent++;}
    catch(error:any){if(error.statusCode===404||error.statusCode===410)await db.from('emma_push_devices').delete().eq('id',device.id);else await db.from('emma_push_jobs').update({status:job.attempts>=3?'failed':'sending',lease_until:new Date(Date.now()+120000).toISOString()}).eq('id',job.id);}
   }
   return reply({sent});
  }
  const token=request.headers.get('Authorization')?.replace(/^Bearer /i,'');if(!token)return reply({error:'Authentication required'},401);
  const identity=await db.auth.getUser(token);if(identity.error||!identity.data.user||!await approved(identity.data.user.id))return reply({error:'Approved account required'},403);
  const body=await request.json();if(body.action!=='test'||typeof body.deviceId!=='string')return reply({error:'Invalid request'},400);
  const found=await db.from('emma_push_devices').select('*').eq('id',body.deviceId).eq('user_id',identity.data.user.id).maybeSingle();if(found.error||!found.data?.enabled)return reply({error:'Device unavailable'},404);
  // An explicit test ignores quiet hours; scheduled reminders always respect them.
  await send(found.data,'task','emma-test-'+Date.now(),configuration,true);return reply({sent:true});
 }catch{return reply({error:'Reminder service unavailable'},503);}
});
