(function(root){
  'use strict';
  const validId=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  function prefix(uid){if(!validId(uid))throw new Error('Llogaria nuk u identifikua.');return 'emma-space-user:'+uid+':';}
  function open(factory,name){return new Promise((resolve,reject)=>{const request=factory.open(name,1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('app-data'))request.result.createObjectStore('app-data',{keyPath:'key'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
  async function migrateLegacy({uid,target,indexedDB,storage,normalize}){
    const scope=prefix(uid);
    const existing=await new Promise((resolve,reject)=>{const q=target.transaction('app-data','readonly').objectStore('app-data').get('state');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
    if(existing)return false;
    const source=await open(indexedDB,'emma-space-db');
    let legacy;
    try{
      legacy=await new Promise((resolve,reject)=>{
        const tx=source.transaction('app-data','readwrite'),store=tx.objectStore('app-data');
        let permitted=false,value=null,recovery=null;
        const owner=store.get('account-migration-owner');
        owner.onsuccess=()=>{permitted=!owner.result||owner.result.value===uid;if(permitted){if(!owner.result)store.put({key:'account-migration-owner',value:uid});const q=store.get('state');q.onsuccess=()=>value=q.result?.value||null;const r=store.get('pre-import');r.onsuccess=()=>recovery=r.result?.value||null;}};
        tx.oncomplete=()=>resolve({permitted,value,recovery});tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
      });
    }finally{source.close();}
    if(!legacy.permitted)return false;
    let candidate=legacy.value;
    if(!candidate){for(const key of ['emma-tulip-garden-static','emma-tulip-garden-v2','emma-space-device-fallback']){try{const raw=storage.getItem(key);if(raw){candidate=JSON.parse(raw);break;}}catch{}}}
    if(candidate){await new Promise((resolve,reject)=>{const tx=target.transaction('app-data','readwrite'),store=tx.objectStore('app-data');store.put({key:'state',value:normalize(candidate)});if(legacy.recovery)store.put({key:'pre-import',value:normalize(legacy.recovery)});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
    // Copy the draft only for the account that claimed this device's legacy data.
    try{const draft=storage.getItem('emma-space-journal-draft-text');if(draft&&!storage.getItem(scope+'emma-space-journal-draft-text'))storage.setItem(scope+'emma-space-journal-draft-text',draft);}catch{}
    return !!candidate;
  }
  const api={validId,prefix,migrateLegacy};if(typeof module==='object'&&module.exports)module.exports=api;else root.EmmaAccountStorage=api;
})(globalThis);
