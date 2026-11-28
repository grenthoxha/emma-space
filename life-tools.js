(function(root){
  'use strict';
  const copy=value=>JSON.parse(JSON.stringify(value));
  const dateKey=value=>{const d=new Date(value);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&dateKey(new Date(value+'T12:00:00'))===value;
  const validTime=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value||'');
  function exceptions(value,lessons){
    const ids=new Set();return (Array.isArray(value)?value:[]).filter(e=>e&&typeof e.id==='string'&&!ids.has(e.id)&&ids.add(e.id)&&validDate(e.date)&&['day_off','cancel','replace','extra'].includes(e.kind)&&(e.kind==='day_off'||e.kind==='extra'||lessons.some(l=>l.id===e.lessonId))&&(e.kind==='cancel'||e.kind==='day_off'||e.lesson&&typeof e.lesson.subject==='string'&&e.lesson.subject.trim()&&e.lesson.subject.length<=120&&validTime(e.lesson.startTime)&&validTime(e.lesson.endTime)&&e.lesson.startTime<e.lesson.endTime)).map(e=>({id:e.id,date:e.date,kind:e.kind,lessonId:e.lessonId||'',lesson:e.lesson?{subject:e.lesson.subject.trim(),startTime:e.lesson.startTime,endTime:e.lesson.endTime,room:String(e.lesson.room||'').slice(0,80)}:null}));
  }
  function lessonsOn(schedule,date){
    const d=new Date(date),key=dateKey(d),changes=(schedule.exceptions||[]).filter(e=>e.date===key);
    if(changes.some(e=>e.kind==='day_off'))return [];
    const result=(schedule.lessons||[]).filter(l=>l.day===d.getDay()).flatMap(l=>{const change=changes.filter(e=>e.lessonId===l.id&&['cancel','replace'].includes(e.kind)).at(-1);if(change?.kind==='cancel')return [];return [{...l,...(change?.lesson||{}),exceptionId:change?.id||''}];});
    for(const change of changes.filter(e=>e.kind==='extra'))result.push({id:change.id,day:d.getDay(),...change.lesson,exceptionId:change.id,isExample:false});
    return result.sort((a,b)=>a.startTime.localeCompare(b.startTime));
  }
  const fold=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('sq');
  function search(state,query,defaults=[]){
    const words=fold(query).trim().split(/\s+/).filter(Boolean);if(!words.length)return [];
    const results=[],add=(type,id,title,text,route,extra={})=>{const content=fold(title+' '+text);if(words.every(w=>content.includes(w)))results.push({type,id,title:String(title),text:String(text).slice(0,160),route,...extra});};
    for(const t of state.studyTasks||[])add('Detyrë',t.id,t.title,(t.dueDate||'')+' '+((state.subjects||[]).find(s=>s.id===t.subjectId)?.name||''),'study',{tab:'plan'});
    for(const e of state.exams||[])add('Provim',e.id,e.title,(e.notes||'')+' '+e.dateTime,'study',{tab:'exams'});
    for(const s of state.subjects||[])add('Lëndë',s.id,s.name,'','study',{tab:'subjects',subjectId:s.id});
    for(const [subjectId,notes] of Object.entries(state.subjectNotes||{}))for(const [date,note] of Object.entries(notes||{}))add('Shënim',subjectId+':'+date,(state.subjects||[]).find(s=>s.id===subjectId)?.name||'Shënim',note.content||'','study',{tab:'subjects',subjectId,date});
    for(const c of state.flashcards||[])add('Kartelë',c.id,c.question,c.answer,'study',{tab:'subjects',subjectId:c.subjectId});
    for(const p of state.journalPages||[])add('Ditar',p.id,p.title,p.body||'','journal');
    for(const [index,r] of defaults.entries())if(!(state.removedDefaultRoutines||[]).includes(index))add('Rutinë','d:'+index,state.routineSettings?.['d:'+index]?.label||r.label,'','life');
    for(const r of state.customRoutines||[])add('Rutinë',r.id,state.routineSettings?.['c:'+r.id]?.label||r.label,'','life');
    for(const l of state.schoolSchedule?.lessons||[])add('Orë mësimi',l.id,l.subject,l.startTime+' '+l.room,'study',{tab:'schedule',day:l.day});
    return results.slice(0,60);
  }
  const paths=['studyTasks','journalPages','exams','subjects','flashcards','customRoutines','priorities','schoolSchedule.lessons','schoolSchedule.exceptions'];
  const get=(object,path)=>path.split('.').reduce((v,k)=>v?.[k],object);
  function deletion(before,after){
    const removed=[];
    for(const path of paths){const old=get(before,path)||[],current=get(after,path)||[];old.forEach((item,index)=>{if(item.id&&!current.some(v=>v.id===item.id))removed.push({path,item:copy(item),index});});}
    const links=[];for(const key of ['studyTasks','exams'])for(const item of before[key]||[]){const next=(after[key]||[]).find(v=>v.id===item.id);if(next)for(const field of ['subjectId','examId'])if(item[field]&&!next[field])links.push({key,id:item.id,field,value:item[field],expected:next[field]});}
    const notes={};for(const [key,value] of Object.entries(before.subjectNotes||{}))if(!Object.hasOwn(after.subjectNotes||{},key))notes[key]=copy(value);
    const hidden=(after.removedDefaultRoutines||[]).filter(i=>!(before.removedDefaultRoutines||[]).includes(i));
    return {removed,links,notes,hidden};
  }
  function restore(state,change){
    let count=0;
    for(const {path,item,index} of change.removed){let target=get(state,path);if(!Array.isArray(target)){if(path==='schoolSchedule.exceptions')target=state.schoolSchedule.exceptions=[];else continue;}if(!target.some(v=>v.id===item.id)){target.splice(Math.min(index,target.length),0,copy(item));count++;}}
    for(const link of change.links){const item=(state[link.key]||[]).find(v=>v.id===link.id);if(item&&item[link.field]===link.expected)item[link.field]=link.value;}
    for(const [key,note] of Object.entries(change.notes))if(!Object.hasOwn(state.subjectNotes,key))state.subjectNotes[key]=copy(note);
    if(change.hidden.length){state.removedDefaultRoutines=state.removedDefaultRoutines.filter(i=>!change.hidden.includes(i));count+=change.hidden.length;}
    return count;
  }
  function jobs(state,now=new Date(),preferences={}){
    const result=[],end=new Date(now.getTime()+7*86400000),add=(kind,id,at,lead)=>{const due=new Date(at).getTime()-lead*60000;if(Number.isFinite(due)&&due>now.getTime()&&due<=end.getTime())result.push({event_key:kind+':'+id+':'+due,kind,due_at:new Date(due).toISOString(),expires_at:new Date(due+3600000).toISOString()});};
    for(const t of state.studyTasks||[])if(!t.completed&&validDate(t.dueDate)&&validTime(t.dueTime))add('task',t.id,t.dueDate+'T'+t.dueTime,Number(preferences.taskLead)||0);
    for(const e of state.exams||[])if(!e.completed)add('exam',e.id,e.dateTime,Number(preferences.examLead??30));
    for(let i=0;i<8;i++){const d=new Date(now);d.setDate(d.getDate()+i);for(const l of lessonsOn(state.schoolSchedule||{},d))if(!l.isExample)add('lesson',l.id,dateKey(d)+'T'+l.startTime,Number(preferences.lessonLead??5));}
    const seen=new Set();return result.sort((a,b)=>a.due_at.localeCompare(b.due_at)).filter(j=>!seen.has(j.event_key)&&seen.add(j.event_key)).slice(0,200);
  }
  function counts(state){return {pages:(state.journalPages||[]).length,photos:(state.journalPages||[]).reduce((sum,p)=>sum+(p.photos||[]).length,0)+(state.journalDraft?.photos||[]).length,tasks:(state.studyTasks||[]).length,bytes:new Blob([JSON.stringify(state)]).size};}
  function backupDue(meta,now=Date.now()){const last=Number(meta.lastBackupAt||meta.firstUsedAt||now);return meta.backupReminder!==false&&now-last>=7*86400000&&meta.backupDismissedDate!==dateKey(now);}
  const api={dateKey,validDate,validTime,exceptions,lessonsOn,search,deletion,restore,jobs,counts,backupDue};if(typeof module==='object'&&module.exports)module.exports=api;else root.EmmaLifeTools=api;
})(globalThis);
