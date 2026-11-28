const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const listeners=[],nodes=new Map(),state={studyTasks:[{id:'task',title:'Detyrë'}],journalPages:[],exams:[],subjects:[],flashcards:[],customRoutines:[],priorities:[],subjectNotes:{},removedDefaultRoutines:[],schoolSchedule:{lessons:[],exceptions:[]},maintenance:{reminders:{enabled:false}}};
const document={addEventListener:(name,fn,capture)=>listeners.push({name,fn,capture}),getElementById:id=>nodes.get(id),createElement:()=>({setAttribute(){},remove(){nodes.delete(this.id);}}),body:{append:node=>nodes.set(node.id,node)},querySelectorAll:()=>[],querySelector:()=>null};
const context={document,navigator:{onLine:true},EmmaLifeTools:require('../life-tools'),EmmaReminders:{create:()=>({reset(){}})},addEventListener(){},setTimeout,clearTimeout,Date,JSON};
vm.runInNewContext(fs.readFileSync('app-improvements.js','utf8'),context);
const ui=context.EmmaImprovements.create({getState:()=>state,save:async()=>{},render(){},toast(){},canAccess:()=>true,key:x=>x});
const capture=listeners.find(l=>l.name==='click'&&l.capture),delay=()=>new Promise(resolve=>setTimeout(resolve,10));
const event=kind=>({target:{closest:selector=>selector.includes(kind)?{}:null}});
(async()=>{
  capture.fn(event('data-delete-task'));
  // Browsers can run a microtask checkpoint between capture and target listeners.
  await Promise.resolve();state.studyTasks=[];await delay();assert(nodes.has('app-undo-toast'),'Undo must be created after the complete click dispatch');
  state.studyTasks.push({id:'new',title:'Newer work'});
  const action=listeners.filter(l=>l.name==='click').at(-1);await action.fn({target:{closest:()=>({hasAttribute:name=>name==='data-undo-delete'})},preventDefault(){},stopImmediatePropagation(){}});
  assert(state.studyTasks.some(t=>t.id==='task'));assert(state.studyTasks.some(t=>t.id==='new'),'Undo must preserve later work');
  ui.reset();capture.fn(event('data-delete-task'));await delay();assert(!nodes.has('app-undo-toast'),'Opening confirmation is not a deletion');
  capture.fn(event('#confirm-yes'));await Promise.resolve();state.studyTasks=[];await delay();assert(nodes.has('app-undo-toast'),'Confirmed deletion must offer undo');ui.reset();
  console.log('PASS: real event-dispatch ordering for direct/confirmed deletion, undo availability and preservation of later work');
})().catch(e=>{ui.reset();console.error(e);process.exitCode=1;});
