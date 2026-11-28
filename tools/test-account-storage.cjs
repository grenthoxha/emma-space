const assert=require('node:assert/strict'),{IDBFactory}=require('../tmp/test-idb/package/build/cjs'),model=require('../account-storage');
const a='11111111-eeee-4000-8000-000000000001',b='11111111-eeee-4000-8000-000000000002';
function open(factory,name){return new Promise((resolve,reject)=>{const q=factory.open(name,1);q.onupgradeneeded=()=>q.result.createObjectStore('app-data',{keyPath:'key'});q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});}
function put(db,key,value){return new Promise((resolve,reject)=>{const tx=db.transaction('app-data','readwrite');tx.objectStore('app-data').put({key,value});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
function get(db,key){return new Promise((resolve,reject)=>{const q=db.transaction('app-data','readonly').objectStore('app-data').get(key);q.onsuccess=()=>resolve(q.result?.value);q.onerror=()=>reject(q.error);});}
(async()=>{
 const indexedDB=new IDBFactory(),legacy=await open(indexedDB,'emma-space-db'),first=await open(indexedDB,model.prefix(a)+'emma-space-db'),second=await open(indexedDB,model.prefix(b)+'emma-space-db');
 const photo={id:'image',data:'data:image/jpeg;base64,cGhvdG8='},original={journalPages:[{id:'original',body:'Kujtim privat',photos:[photo]}],theme:'midnight-velvet',pin:{enabled:true}};
 await put(legacy,'state',original);await put(legacy,'pre-import',{journalPages:[{body:'Recovery'}]});
 const values=new Map([['emma-space-journal-draft-text',JSON.stringify({title:'Draft i vjetër'})],['emma-space-device-fallback',JSON.stringify(original)]]),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 const migrate=(uid,target)=>model.migrateLegacy({uid,target,indexedDB,storage,normalize:value=>({...value,schemaVersion:8})});
 assert(await migrate(a,first));assert.deepEqual((await get(first,'state')).journalPages,original.journalPages);assert((await get(first,'state')).pin.enabled);assert.equal((await get(first,'pre-import')).journalPages[0].body,'Recovery');assert(values.has(model.prefix(a)+'emma-space-journal-draft-text'));
 assert.equal(await migrate(b,second),false);assert.equal(await get(second,'state'),undefined);assert(!values.has(model.prefix(b)+'emma-space-journal-draft-text'));
 assert.deepEqual(await get(legacy,'state'),original,'Source must remain recoverable');assert.equal(values.get('emma-space-journal-draft-text'),JSON.stringify({title:'Draft i vjetër'}));
 await put(first,'state',{journalPages:[{id:'newer'}]});assert.equal(await migrate(a,first),false);assert.equal((await get(first,'state')).journalPages[0].id,'newer','Migration cannot replace newer account data');
 assert.throws(()=>model.prefix('unverified'),/identifikua/);assert.notEqual(model.prefix(a),model.prefix(b));
 const factory=new IDBFactory(),fallback=await open(factory,model.prefix(a)+'emma-space-db');assert(await model.migrateLegacy({uid:a,target:fallback,indexedDB:factory,storage,normalize:v=>v}));assert.equal((await get(fallback,'state')).journalPages[0].body,'Kujtim privat');
 console.log('PASS: account-isolated databases, atomic legacy claim, photos/PIN/themes/drafts/recovery preserved, no source deletion and no overwriting newer data');
})().catch(error=>{console.error(error);process.exitCode=1;});
