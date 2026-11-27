(function(root) {
  'use strict';
  const dayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const days = values => Array.isArray(values) ? [...new Set(values.filter(v=>Number.isInteger(v)&&v>=0&&v<=6))] : [1,2,3,4,5,6,0];
  const schedule = (value={}) => ({period:['morning','afternoon','evening'].includes(value.period)?value.period:'morning',days:days(value.days),label:typeof value.label==='string'?value.label.slice(0,180):''});
  function rollover(state,key=dayKey()) {
    if (!state.routineDate) {state.routineDate=key;return false;}
    if (state.routineDate===key) return false;
    state.routineHistory ||= {};
    state.routineHistory[state.routineDate]={completed:[...state.completed],customDone:[...state.customRoutineDone]};
    state.completed=[];state.customRoutineDone=[];state.routineDate=key;return true;
  }
  function home(state,key=dayKey()) {
    const all=[...state.studyTasks.filter(t=>t.dueDate===key).map(t=>({...t,key:'study:'+t.id,text:t.title,source:'study'})),...state.priorities.filter(t=>t.date===key).map(t=>({...t,key:'priority:'+t.id,source:'priority'}))];
    const keys=state.homePrioritySelection?.[key] || all.slice(0,3).map(t=>t.key);
    return {all,selected:keys.map(k=>all.find(t=>t.key===k)).filter(Boolean).slice(0,3)};
  }
  const api={dayKey,days,schedule,rollover,home};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.EmmaSpaceModel=api;
})(globalThis);
