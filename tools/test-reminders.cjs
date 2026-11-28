const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const life=require('../life-tools');
function fixture({subscription=true,permission='granted',stored=true}={}){
  const calls=[],storage=new Map(stored?[['scope:push-device','device-id']]:[]);
  const state={maintenance:{reminders:{enabled:true}},studyTasks:[{id:'t',dueDate:life.dateKey(new Date(Date.now()+86400000)),dueTime:'12:00'}]};
  const context={EmmaLifeTools:life,navigator:{onLine:true,serviceWorker:{getRegistration:async()=>({pushManager:{getSubscription:async()=>subscription?{}:null}})}},Notification:{permission},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout,Date,Intl,JSON};
  vm.runInNewContext(fs.readFileSync('reminders.js','utf8'),context);
  const api=context.EmmaReminders.create({service:{isAuthenticated:()=>true,notificationData:async(...args)=>calls.push(args)},getState:()=>state,save:async()=>calls.push(['save']),key:k=>'scope:'+k,demo:false});
  return {api,state,calls,context};
}
(async()=>{
  const active=fixture();await active.api.sync();assert.equal(active.calls[0][0],'jobs');assert.equal(active.calls[0][1].deviceId,'device-id');await active.api.sync();assert.equal(active.calls.length,1,'Unchanged jobs are not repeatedly uploaded');
  for(const settings of [{subscription:false},{permission:'denied'},{stored:false}]){const f=fixture(settings);await f.api.sync();assert.equal(f.state.maintenance.reminders.enabled,false);assert.deepEqual(f.calls,[['save']],'A missing browser subscription must not leave a misleading active switch');}
  const offline=fixture();offline.context.navigator.onLine=false;await offline.api.sync();assert.equal(offline.calls.length,0);
  const stale=fixture();let release;stale.context.navigator.serviceWorker.getRegistration=()=>new Promise(resolve=>release=resolve);const pending=stale.api.sync();stale.api.reset();release({pushManager:{getSubscription:async()=>({})}});await pending;assert.equal(stale.calls.length,0,'A stale account must not upload jobs after reset');
  const handlers={},shown=[],opened=[],sw={addEventListener:(name,callback)=>handlers[name]=callback,registration:{scope:'https://example.com/emma/',showNotification:async(...args)=>shown.push(args)},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)}};
  vm.runInNewContext(fs.readFileSync('sw.js','utf8'),{self:sw,URL,console});
  let work;handlers.push({data:{json:()=>({url:'https://evil.example/',body:'Kujtesë'})},waitUntil:p=>work=p});await work;assert.equal(shown[0][1].data.url,'https://example.com/emma/#study');
  handlers.notificationclick({notification:{data:{url:'https://evil.example/'},close(){}},waitUntil:p=>work=p});await work;assert.deepEqual(opened,['https://example.com/emma/#study']);
  console.log('PASS: reminder reconciliation, account-switch race, offline behavior, deduplicated synchronization and safe push links');
})().catch(e=>{console.error(e);process.exitCode=1;});
