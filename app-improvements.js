(function(root){
  'use strict';
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const size=bytes=>bytes<1048576?(bytes/1024).toFixed(0)+' KB':bytes<1073741824?(bytes/1048576).toFixed(1)+' MB':(bytes/1073741824).toFixed(2)+' GB';
  function create(host){
    const {getState,save,render,canAccess,modal,closeModal,toast,key,service,demo}=host;
    const reminders=EmmaReminders.create({service,getState,save,key,demo,canAccess});
    let estimate=null,undo=null,undoTimer=null,deleteIntent=false,searchResults=[],measurement=0;
    const meta=()=>getState().maintenance;
    function backupHTML(){return EmmaLifeTools.backupDue(meta())?'<aside class="maintenance-note" role="status"><span>Ka kaluar një javë pa ruajtur kopje.</span><button class="subtle-button" id="btn-backup-export">Ruaj një kopje</button><button class="icon-pill-btn" data-dismiss-backup aria-label="Ma kujto nesër">×</button></aside>':'';}
    function storageHTML(){
      const count=EmmaLifeTools.counts(getState()),m=meta();
      return `<div class="storage-summary"><p><b>${count.pages}</b> faqe · <b>${count.photos}</b> fotografi · <b>${count.tasks}</b> detyra</p><small>Të dhënat e kësaj llogarie: rreth ${size(count.bytes)}.</small><p data-storage-estimate>${estimate?`${size(estimate.usage)} nga rreth ${size(estimate.quota)} të lejuara nga shfletuesi.`:'Po matet hapësira…'}</p><small>Matja e shfletuesit përfshin edhe burimet offline dhe llogaritë e tjera të kësaj faqeje.</small><p>Kopja e fundit: <b>${m.lastBackupAt?escape(new Date(m.lastBackupAt).toLocaleDateString('sq-AL')):'ende pa kopje'}</b></p><label class="maintenance-check"><input type="checkbox" data-backup-reminder ${m.backupReminder!==false?'checked':''}> Ma kujto kopjen një herë në javë</label><button type="button" class="subtle-button" data-persist-storage>Kërko ruajtje të qëndrueshme</button><small data-storage-status></small></div>`;
    }
    function remindersHTML(){const p=meta().reminders;return `<details class="advanced-options"><summary>Kujtesat në telefon</summary><div class="advanced-options-panel"><p>Njoftime për detyrat, provimet dhe orët e mësimit.</p><small>Në iPhone: shtoje app-in në Home Screen dhe hape nga ikona. Me aktivizimin dërgohen vetëm oraret, lloji i kujtesës dhe lidhja teknike e njoftimit. Titujt, shënimet dhe ditari nuk dërgohen.</small><div class="maintenance-actions"><button class="${p.enabled?'subtle-button':'primary-button'}" data-notifications-toggle>${p.enabled?'Çaktivizo kujtesat':'Aktivizo kujtesat'}</button>${p.enabled?'<button class="subtle-button" data-notifications-test>Provo njoftimin</button>':''}</div><form id="reminder-preferences"><div class="maintenance-grid"><label>Qetësi nga<input class="clean-input" name="quietStart" type="time" value="${escape(p.quietStart)}" required></label><label>Deri në<input class="clean-input" name="quietEnd" type="time" value="${escape(p.quietEnd)}" required></label></div><label>Provimet<select class="clean-select" name="examLead">${[0,15,30,60].map(n=>`<option value="${n}" ${p.examLead===n?'selected':''}>${n?'Përpara '+n+' min':'Në orarin e caktuar'}</option>`).join('')}</select></label><label>Mësimi<select class="clean-select" name="lessonLead">${[0,5,10,15].map(n=>`<option value="${n}" ${p.lessonLead===n?'selected':''}>${n?'Përpara '+n+' min':'Në orarin e caktuar'}</option>`).join('')}</select></label><button class="subtle-button" type="submit">Ruaj zgjedhjet</button></form><small>Kujtesat planifikohen për shtatë ditët e ardhshme sa herë hap ose ndryshon app-in. Njoftimet brenda orarit të qetësisë nuk dërgohen.</small><p data-notifications-status role="status"></p></div></details>`;}
    function connectionHTML(){return '<div class="connection-note" data-connection-status role="status" '+(navigator.onLine===false?'':'hidden')+'>Pa internet · Të dhënat e hapura ruhen në pajisje. Hyrja, miratimi dhe njoftimet kërkojnë lidhje.</div>';}
    function refreshConnection(){document.querySelectorAll('[data-connection-status]').forEach(el=>el.hidden=navigator.onLine!==false);if(navigator.onLine!==false)reminders.changed();}
    async function measure(){const token=++measurement;const output=document.querySelector('[data-storage-estimate]');if(!output)return;try{const value=await navigator.storage?.estimate?.();if(token!==measurement||!canAccess())return;if(value?.quota){estimate=value;const field=document.querySelector('[data-storage-estimate]');if(field){field.textContent=`${size(value.usage)} nga rreth ${size(value.quota)} të lejuara nga shfletuesi.`;field.classList.toggle('storage-warning',value.usage/value.quota>.85);}}else output.textContent='Kjo pajisje nuk jep matje të hapësirës.';}catch{output.textContent='Matja e hapësirës nuk u hap.';}}
    function showUndo(before){
      const change=EmmaLifeTools.deletion(before,getState());if(!change.removed.length&&!change.hidden.length)return;
      deleteIntent=false;
      clearTimeout(undoTimer);document.getElementById('app-undo-toast')?.remove();undo=change;
      const node=document.createElement('div');node.id='app-undo-toast';node.className='app-undo-toast';node.setAttribute('role','status');node.innerHTML='<span>U hoq.</span><button type="button" data-undo-delete>Zhbëj</button><button type="button" data-close-undo aria-label="Mbyll">×</button>';document.body.append(node);
      undoTimer=setTimeout(()=>{undo=null;node.remove();},10000);
    }
    document.addEventListener('click',event=>{
      if(!canAccess())return;
      if(event.target.closest('#confirm-cancel')){deleteIntent=false;return;}
      const deleting=event.target.closest('[data-delete-task],[data-delete-home-task],[data-delete-page],[data-delete-exam],[data-delete-subject],[data-delete-flashcard],[data-delete-school-lesson],[data-delete-custom-routine],[data-remove-default-routine],[data-delete-exception]');
      if(deleting||deleteIntent&&event.target.closest('#confirm-yes')){
        deleteIntent=!!deleting;const before=JSON.parse(JSON.stringify(getState()));queueMicrotask(()=>{if(canAccess())showUndo(before);});
      }
    },true);
    function search(){
      modal('<section class="quick-add-modal search-modal" role="dialog" aria-modal="true" aria-labelledby="global-search-heading"><div class="quick-add-main"><h2 id="global-search-heading">Kërko në hapësirën tënde</h2><input id="global-search" class="clean-input" type="search" placeholder="Detyrë, kujtim, lëndë…" autocomplete="off"><small data-search-count role="status"></small><div data-search-results></div></div><div class="quick-add-footer"><button class="subtle-button" id="btn-close-modal">Mbyll</button></div></section>');document.getElementById('global-search').focus();
    }
    function fillSearch(query){searchResults=EmmaLifeTools.search(getState(),query,host.defaults);const output=document.querySelector('[data-search-results]');if(!output)return;document.querySelector('[data-search-count]').textContent=query.trim()?searchResults.length+' rezultate':'';output.innerHTML=searchResults.map((r,i)=>`<button type="button" class="search-result" data-open-search="${i}"><small>${escape(r.type)}</small><b>${escape(r.title)}</b><span>${escape(r.text)}</span></button>`).join('')||(query.trim()?'<p class="gentle-empty">Nuk u gjet asgjë. Provo një fjalë tjetër.</p>':'');}
    function exceptionsHTML(){const values=getState().schoolSchedule.exceptions||[];return `<details class="advanced-options"><summary>Ndryshime për një ditë${values.length?' · '+values.length:''}</summary><div class="advanced-options-panel"><button type="button" class="subtle-button" data-add-exception>+ Cakto një ndryshim</button>${values.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(e=>`<div class="exception-row"><span><b>${escape(e.date)}</b> · ${e.kind==='day_off'?'Ditë pushimi':e.kind==='cancel'?'Orë e anuluar':escape(e.lesson?.subject||'Orë e ndryshuar')}<small>${e.lesson?escape(e.lesson.startTime+'–'+e.lesson.endTime):''}</small></span><button type="button" class="subtle-button" data-delete-exception="${escape(e.id)}" aria-label="Hiq ndryshimin">×</button></div>`).join('')}</div></details>`;}
    function exceptionModal(){
      modal(`<section class="quick-add-modal" role="dialog" aria-modal="true" aria-labelledby="exception-heading"><form id="school-exception-form"><div class="quick-add-main"><h2 id="exception-heading">Vetëm për këtë datë</h2><label>Data<input class="clean-input" type="date" name="date" value="${EmmaLifeTools.dateKey(new Date())}" required></label><label>Ndryshimi<select class="clean-select" name="kind"><option value="day_off">Ditë pushimi</option><option value="cancel">Anulo një orë</option><option value="replace">Ndrysho një orë</option><option value="extra">Shto një orë shtesë</option></select></label><label data-exception-original hidden>Ora e zakonshme<select class="clean-select" name="lessonId"></select></label><div data-exception-fields hidden><label>Lënda<input class="clean-input" name="subject" maxlength="120"></label><div class="maintenance-grid"><label>Fillon<input class="clean-input" name="startTime" type="time" value="08:00"></label><label>Mbaron<input class="clean-input" name="endTime" type="time" value="08:45"></label></div><label>Klasa / salla<input class="clean-input" name="room" maxlength="80"></label></div><small>Orari javor mbetet i njëjtë.</small><p data-exception-error role="alert"></p></div><div class="quick-add-footer"><button class="subtle-button" type="button" id="btn-close-modal">Anulo</button><button class="primary-button" type="submit">Ruaj</button></div></form></section>`);updateExceptionFields();
    }
    function updateExceptionFields(){const form=document.getElementById('school-exception-form');if(!form)return;const {kind,date,lessonId}=form.elements;const original=form.querySelector('[data-exception-original]'),fields=form.querySelector('[data-exception-fields]');original.hidden=!['cancel','replace'].includes(kind.value);fields.hidden=!['replace','extra'].includes(kind.value);const day=new Date(date.value+'T12:00:00').getDay(),selected=lessonId.value;lessonId.innerHTML=getState().schoolSchedule.lessons.filter(l=>l.day===day).map(l=>`<option value="${escape(l.id)}">${escape(l.startTime+' · '+l.subject)}</option>`).join('');if([...lessonId.options].some(o=>o.value===selected))lessonId.value=selected;}
    document.addEventListener('input',event=>{if(canAccess()&&event.target.id==='global-search')fillSearch(event.target.value);});
    document.addEventListener('change',async event=>{
      if(!canAccess())return;if(event.target.closest('#school-exception-form'))updateExceptionFields();
      if(event.target.matches('[data-backup-reminder]')){meta().backupReminder=event.target.checked;await save();}
    });
    document.addEventListener('submit',async event=>{
      if(!canAccess()||!['school-exception-form','reminder-preferences'].includes(event.target.id))return;event.preventDefault();event.stopImmediatePropagation();const form=event.target;
      if(form.id==='school-exception-form'){
        const e={id:'exception-'+crypto.randomUUID(),date:form.elements.date.value,kind:form.elements.kind.value,lessonId:form.elements.lessonId.value,lesson:{subject:form.elements.subject.value,startTime:form.elements.startTime.value,endTime:form.elements.endTime.value,room:form.elements.room.value}};
        const value=EmmaLifeTools.exceptions([e],getState().schoolSchedule.lessons)[0];if(!value){form.querySelector('[data-exception-error]').textContent='Kontrollo datën, lëndën dhe orët. Për anulim, zgjidh një orë që ekziston atë ditë.';return;}
        const state=getState(),previous=state.schoolSchedule.exceptions;state.schoolSchedule.exceptions=previous.filter(v=>v.date!==e.date||(e.kind==='day_off'?v.kind!=='day_off':v.kind!=='day_off'&&v.lessonId!==e.lessonId));state.schoolSchedule.exceptions.push(value);
        try{await save();closeModal();render();toast('Ndryshimi u ruajt vetëm për këtë datë.');}catch{state.schoolSchedule.exceptions=previous;form.querySelector('[data-exception-error]').textContent='Ndryshimi nuk u ruajt. Provo përsëri.';}
      }else{
        const p=meta().reminders;p.quietStart=form.elements.quietStart.value;p.quietEnd=form.elements.quietEnd.value;p.examLead=Number(form.elements.examLead.value);p.lessonLead=Number(form.elements.lessonLead.value);
        try{await save();await reminders.preferences();toast('Zgjedhjet u ruajtën.');}catch(e){toast(e.message,'⚠️');}
      }
    },true);
    document.addEventListener('click',async event=>{
      if(!canAccess())return;const target=event.target.closest('[data-open-search],[data-global-search],[data-dismiss-backup],[data-undo-delete],[data-close-undo],[data-persist-storage],[data-add-exception],[data-delete-exception],[data-notifications-toggle],[data-notifications-test]');if(!target)return;event.preventDefault();event.stopImmediatePropagation();
      if(target.hasAttribute('data-global-search')){search();return;}
      if(target.hasAttribute('data-open-search')){const result=searchResults[Number(target.dataset.openSearch)];if(result){closeModal();host.openResult(result);}return;}
      if(target.hasAttribute('data-add-exception')){exceptionModal();return;}
      if(target.hasAttribute('data-delete-exception')){getState().schoolSchedule.exceptions=getState().schoolSchedule.exceptions.filter(e=>e.id!==target.dataset.deleteException);await save();render();return;}
      if(target.hasAttribute('data-dismiss-backup')){meta().backupDismissedDate=EmmaLifeTools.dateKey(new Date());await save();render();return;}
      if(target.hasAttribute('data-close-undo')){undo=null;document.getElementById('app-undo-toast')?.remove();return;}
      if(target.hasAttribute('data-undo-delete')){if(undo){EmmaLifeTools.restore(getState(),undo);undo=null;clearTimeout(undoTimer);document.getElementById('app-undo-toast')?.remove();await save();render();toast('U rikthye.');}return;}
      if(target.hasAttribute('data-persist-storage')){try{const granted=await navigator.storage?.persist?.();const text=document.querySelector('[data-storage-status]');if(text)text.textContent=granted?'Shfletuesi lejoi ruajtjen e qëndrueshme. Mbaj edhe një kopje rezervë.':'Shfletuesi nuk e lejoi ose nuk e mbështet këtë mundësi. Ruaj një kopje rezervë.';}catch{toast('Leja e ruajtjes nuk u dha.','⚠️');}return;}
      target.disabled=true;try{if(target.hasAttribute('data-notifications-test')){await reminders.test();toast('Njoftimi i provës u dërgua.');}else{if(meta().reminders.enabled)await reminders.disable();else await reminders.enable();render();}}catch(error){const output=document.querySelector('[data-notifications-status]');if(output)output.textContent=error.message;else toast(error.message,'⚠️');}finally{target.disabled=false;}
    },true);
    root.addEventListener('online',refreshConnection);root.addEventListener('offline',refreshConnection);
    return {backupHTML,storageHTML,remindersHTML,connectionHTML,exceptionsHTML,reminders,
      afterRender(){refreshConnection();measure();},changed(){reminders.changed();},
      reset(){measurement++;undo=null;deleteIntent=false;clearTimeout(undoTimer);document.getElementById('app-undo-toast')?.remove();reminders.reset();},
      async backedUp(){meta().lastBackupAt=Date.now();await save();},
      async beforeLogout(){if(meta()?.reminders?.enabled)await reminders.disable();}
    };
  }
  root.EmmaImprovements={create};
})(globalThis);
