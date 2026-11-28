(function(root){
  'use strict';
  function create({service,getState,save,key,demo,canAccess=()=>true}){
    let pending=null,deviceId='',lastSignature='',generation=0;
    function identity(){if(deviceId)return deviceId;const name=key('push-device');deviceId=localStorage.getItem(name)||crypto.randomUUID();localStorage.setItem(name,deviceId);return deviceId;}
    function supported(){return root.isSecureContext&&'serviceWorker' in navigator&&'PushManager' in root&&'Notification' in root;}
    function standalone(){return root.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true;}
    async function sync(){
      if(demo||!canAccess()||!getState().maintenance?.reminders?.enabled||!service.isAuthenticated()||navigator.onLine===false)return;
      const version=generation,current=getState(),storedDevice=localStorage.getItem(key('push-device'));
      const registration=await navigator.serviceWorker?.getRegistration();
      const subscription=await registration?.pushManager?.getSubscription();
      if(version!==generation||!canAccess()||getState()!==current)return;
      if(!subscription||!storedDevice||root.Notification?.permission!=='granted'){
        current.maintenance.reminders.enabled=false;lastSignature='';await save();return;
      }
      const preferences=getState().maintenance.reminders,jobs=EmmaLifeTools.jobs(getState(),new Date(),preferences),signature=JSON.stringify(jobs)+JSON.stringify(preferences);
      if(signature===lastSignature)return;
      await service.notificationData('jobs',{deviceId:identity(),jobs});lastSignature=signature;
    }
    return {supported,standalone,
      async enable(){
        if(demo)throw new Error('Kujtesat reale aktivizohen vetëm në llogarinë e miratuar.');
        if(!supported())throw new Error('Kjo pajisje nuk i mbështet njoftimet. Në iPhone, shtoje aplikacionin në Home Screen dhe hape nga ikona e tij.');
        // Permission is requested only following the user's explicit tap.
        const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('Leja për njoftime nuk u dha. Mund ta ndryshosh te cilësimet e pajisjes.');
        const config=root.EMMA_AUTH_CONFIG,endpoint=config.supabaseUrl+'/functions/v1/emma-reminders';
        const response=await fetch(endpoint,{headers:{apikey:config.supabasePublishableKey},cache:'no-store',referrerPolicy:'no-referrer'});
        if(!response.ok)throw new Error('Shërbimi i kujtesave ende nuk është aktivizuar.');
        const data=await response.json();if(!/^[A-Za-z0-9_-]{87}$/.test(data.publicKey||''))throw new Error('Çelësi i njoftimeve nuk u verifikua.');
        const bytes=Uint8Array.from(atob(data.publicKey.replace(/-/g,'+').replace(/_/g,'/')+'='),c=>c.charCodeAt(0));
        const registration=await navigator.serviceWorker.ready;
        let subscription=await registration.pushManager.getSubscription();
        if(subscription&&JSON.stringify([...new Uint8Array(subscription.options.applicationServerKey||[])])!==JSON.stringify([...bytes])){await subscription.unsubscribe();subscription=null;}
        if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
        const current=getState(),prefs=current.maintenance.reminders||{},serialized=subscription.toJSON();
        await service.notificationData('subscribe',{id:identity(),endpoint:serialized.endpoint,p256dh:serialized.keys.p256dh,auth_key:serialized.keys.auth,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,quiet_start:prefs.quietStart||'22:00',quiet_end:prefs.quietEnd||'08:00',enabled:true});
        current.maintenance.reminders={...prefs,enabled:true};await save();lastSignature='';await sync();
      },
      async disable(){
        clearTimeout(pending);getState().maintenance.reminders.enabled=false;await save();lastSignature='';
        const registration=await navigator.serviceWorker?.getRegistration();const subscription=await registration?.pushManager?.getSubscription();
        await subscription?.unsubscribe();
        if(!demo&&service.isAuthenticated()&&navigator.onLine!==false)await service.notificationData('disable',{deviceId:identity()});
      },
      async preferences(){
        const prefs=getState().maintenance.reminders;if(!prefs.enabled)return;
        const registration=await navigator.serviceWorker.ready,subscription=await registration.pushManager.getSubscription();
        if(!subscription)throw new Error('Aktivizo përsëri njoftimet për këtë pajisje.');const value=subscription.toJSON();
        await service.notificationData('subscribe',{id:identity(),endpoint:value.endpoint,p256dh:value.keys.p256dh,auth_key:value.keys.auth,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,quiet_start:prefs.quietStart,quiet_end:prefs.quietEnd,enabled:true});lastSignature='';await sync();
      },
      test:()=>service.notificationData('test',{deviceId:identity()}),
      changed(){clearTimeout(pending);pending=setTimeout(()=>sync().catch(()=>{}),1500);},
      sync,
      reset(){generation++;clearTimeout(pending);deviceId='';lastSignature='';}
    };
  }
  root.EmmaReminders={create};
})(globalThis);
