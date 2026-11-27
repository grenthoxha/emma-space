(function(root){
  'use strict';
  const host=document.getElementById('admin-root');
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const statuses={pending:'Në pritje',approved:'Pranuar',rejected:'Refuzuar',revoked:'Qasje e hequr'};
  let service,screen='login',register=false,user=null,requests=[],filter='pending',busy=false,notice='',problem='',intent=null,viewEpoch=0;
  const photos=new Map();
  try{service=EmmaAdminService.create(root.EMMA_AUTH_CONFIG||{});}catch{host.innerHTML='<section class="login-card"><h1>Paneli nuk u hap</h1><p>Rifresko faqen. Nëse vazhdon, kontrollo konfigurimin e hyrjes.</p></section>';host.removeAttribute('aria-busy');return;}
  const brand='<div class="brand"><span class="brand-icon" aria-hidden="true">E</span> Emma’s Space</div>';
  const footer='<p class="footer-link"><a href="./">Kthehu te aplikacioni</a></p>';
  function clearPhotos(){for(const url of photos.values())URL.revokeObjectURL(url);photos.clear();}
  function clearPrivate(){viewEpoch++;clearPhotos();requests=[];intent=null;user=null;}
  function date(value){const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleString('sq-AL',{dateStyle:'medium',timeStyle:'short'});}
  function messages(){return `<p class="status-message error" role="alert">${escape(problem)}</p><p class="status-message" role="status">${escape(notice)}</p>`;}
  function setBusy(value){busy=value;host.setAttribute('aria-busy',String(value));host.querySelectorAll('button').forEach(b=>b.disabled=value||b.dataset.blocked==='true');}
  function render(){
    host.setAttribute('aria-busy',String(busy));
    if(screen==='login'){
      host.innerHTML=`<section class="login-card">${brand}<h1>${register?'Krijo llogarinë tënde':'Hyr në administrim'}</h1><p class="muted">${register?'Të drejtat e administratorit aktivizohen veçmas nga pronari.':'Prano ose refuzo kërkesën për përdoruesin e vetëm të aplikacionit.'}</p>${messages()}<form id="admin-login-form"><label>Emaili<input name="email" type="email" autocomplete="username" inputmode="email" autocapitalize="none" spellcheck="false" maxlength="254" required></label><label>Fjalëkalimi<input name="password" type="password" autocomplete="${register?'new-password':'current-password'}" minlength="${register?'12':'1'}" maxlength="128" required></label>${register?'<label>Përsërite fjalëkalimin<input name="confirm" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label>':''}<button class="button primary wide" type="submit">${register?'Krijo llogarinë':'Hyr'}</button></form><button class="text-button" type="button" data-switch>${register?'Kam llogari · Hyr':'Konfigurimi i parë · Krijo llogarinë'}</button>${footer}</section>`;
    }else if(screen==='verify'||screen==='not_administrator'){
      host.innerHTML=`<section class="login-card">${brand}<h1>${screen==='verify'?'Konfirmo emailin':'Në pritje të aktivizimit'}</h1>${messages()}<p>${screen==='verify'?'Hap mesazhin e verifikimit në email, pastaj hyr me fjalëkalimin tënd.':'Kjo llogari ende nuk ka të drejtë administrimi. Vetëm pronari i projektit mund ta aktivizojë.'}</p>${user?`<p class="account-email">${escape(user.email)}</p>`:''}<p class="setup-note muted">Regjistrimi nuk jep automatikisht të drejta administratori.</p><button class="button primary wide" data-refresh>${screen==='verify'?'E konfirmova · Kontrollo':'Kontrollo aktivizimin'}</button><button class="text-button" data-logout>Kthehu te hyrja</button>${footer}</section>`;
    }else if(screen==='panel'){
      const approved=requests.find(r=>r.status==='approved'),visible=requests.filter(r=>filter==='all'||r.status===filter);
      host.innerHTML=`${brand}<header><div><h1>Kërkesat për hyrje</h1><p class="muted account-email">${escape(user.email)}</p></div><div class="header-actions"><button class="button" data-refresh>Rifresko</button><button class="button" data-logout>Dil</button></div></header><div class="limit-note"><span class="count">${approved?'1':'0'}/1</span><p>${approved?`Përdoruesi aktiv: <strong>${escape(approved.email||approved.user_id)}</strong>`:'Asnjë përdorues i pranuar ende.'}<small>Ti si administrator dhe vetëm një përdorues tjetër aktiv.</small></p></div>${messages()}<nav class="filters" aria-label="Filtro kërkesat">${[['pending','Në pritje'],['approved','Pranuar'],['all','Të gjitha']].map(([key,label])=>`<button class="button" data-filter="${key}" aria-pressed="${filter===key}">${label}${key==='all'?'':` (${requests.filter(r=>r.status===key).length})`}</button>`).join('')}</nav><div class="requests">${visible.length?visible.map(r=>card(r,approved)).join(''):'<p class="empty muted">Nuk ka kërkesa në këtë pjesë.</p>'}</div>${footer}`;
    }else host.innerHTML='<p class="loading" role="status">Po kontrollohet hyrja…</p>';
    setBusy(busy);
  }
  function card(request,approved){
    const r=request,id=escape(r.user_id),photo=photos.get(r.user_id),self=r.user_id===user.id,blocked=!!approved&&approved.user_id!==r.user_id;
    const action=(value,label,cls='',disabled=false)=>`<button class="button ${cls}" data-review="${value}" data-id="${id}" ${disabled?'disabled data-blocked="true"':''}>${label}</button>`;
    return `<article class="request-card"><span class="status ${r.status==='approved'?'approved':''}">${escape(statuses[r.status]||r.status)}</span><div class="identity"><h2>${escape(r.email||'Emaili nuk u ngarkua')}</h2><small>Kërkuar më ${escape(date(r.created_at))}</small><div class="uid">${id}</div></div><div class="photo">${photo?`<img src="${escape(photo)}" alt="Fotografia e dërguar për shqyrtim"><small>Fotografi private nga kërkesa e regjistrimit.</small>`:`<button class="button" data-photo="${id}">Shfaq fotografinë</button>`}</div>${self?'<p class="muted">Llogaria jote e administrimit.</p>':`<div class="actions">${r.status==='approved'?action('revoked','Hiq qasjen','danger'):action('approved','Prano','primary',blocked)}${r.status==='pending'?action('rejected','Refuzo','danger'):''}</div>`}${blocked&&r.status!=='approved'?'<small>Hiq qasjen e përdoruesit aktiv përpara se të pranosh një tjetër.</small>':''}${intent?.id===r.user_id?`<div class="review-confirm" role="group" aria-label="Konfirmo vendimin"><p>${escape(intent.status==='approved'?'Ta pranosh këtë llogari?':intent.status==='rejected'?'Ta refuzosh këtë kërkesë?':'T’ia heqësh qasjen kësaj llogarie?')}</p><div class="actions"><button class="button" data-cancel>Anulo</button><button class="button ${intent.status==='approved'?'primary':'danger'}" data-confirm>Konfirmo</button></div></div>`:''}${r.reviewed_at?`<small style="margin-top:14px">Vendimi i fundit: ${escape(date(r.reviewed_at))}</small>`:''}</article>`;
  }
  async function boot(){
    if(busy)return;setBusy(true);const start=++viewEpoch;
    try{
      const result=await service.session();if(start!==viewEpoch)return;
      clearPhotos();user=result.user||null;intent=null;
      if(result.status==='administrator'){
        const data=await service.list();if(start!==viewEpoch)return;
        user=data.user;requests=data.requests;screen='panel';
      }else{requests=[];screen=result.status==='not_administrator'?'not_administrator':'login';}
      problem='';
    }catch(error){if(start!==viewEpoch)return;clearPrivate();screen='login';problem=error.message;}
    finally{if(start===viewEpoch||screen==='login'){busy=false;render();}}
  }
  host.addEventListener('submit',async event=>{
    if(event.target.id!=='admin-login-form')return;event.preventDefault();if(busy)return;
    const form=event.target,email=form.elements.email.value,password=form.elements.password.value;
    if(register&&password!==form.elements.confirm.value){problem='Fjalëkalimet nuk përputhen.';form.querySelector('[name="confirm"]').setCustomValidity(problem);form.querySelector('[name="confirm"]').reportValidity();return;}
    setBusy(true);problem='';notice='';const start=++viewEpoch;
    try{const result=register?await service.register(email,password):await service.login(email,password);if(start!==viewEpoch)return;screen=result.status==='verify_email'?'verify':result.status==='not_administrator'?'not_administrator':'login';user=result.user||null;}
    catch(error){if(start!==viewEpoch)return;problem=error.message;}
    finally{form.querySelectorAll('input[type="password"]').forEach(input=>input.value='');if(start===viewEpoch){busy=false;if(screen==='login'&&!problem){await boot();}else if(screen==='login'&&problem){render();host.querySelector('[name="email"]').value=email;}else if(screen==='not_administrator'||screen==='verify')render();}}
  });
  host.addEventListener('input',event=>{if(event.target.name==='confirm')event.target.setCustomValidity('');});
  host.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button||busy)return;
    if(button.hasAttribute('data-switch')){register=!register;problem='';notice='';render();return;}
    if(button.hasAttribute('data-refresh')){await boot();return;}
    if(button.hasAttribute('data-filter')){filter=button.dataset.filter;intent=null;render();return;}
    if(button.hasAttribute('data-cancel')){intent=null;render();return;}
    if(button.hasAttribute('data-review')){const r=requests.find(r=>r.user_id===button.dataset.id);if(!r)return;intent={id:r.user_id,previous:r.status,status:button.dataset.review};problem='';notice='';render();host.querySelector('[data-confirm]')?.focus();return;}
    if(button.hasAttribute('data-logout')){setBusy(true);clearPrivate();try{await service.logout();notice='Ke dalë nga paneli.';}catch{notice='Hyrja në këtë pajisje u mbyll.';}problem='';screen='login';register=false;busy=false;render();return;}
    if(button.hasAttribute('data-photo')){
      const r=requests.find(r=>r.user_id===button.dataset.photo);if(!r)return;
      const start=viewEpoch;setBusy(true);problem='';try{const blob=await service.photo(r);if(start!==viewEpoch)return;photos.set(r.user_id,URL.createObjectURL(blob));}catch(error){if(start===viewEpoch)problem=error.message;}finally{if(start===viewEpoch){busy=false;render();}}return;
    }
    if(button.hasAttribute('data-confirm')&&intent){
      const choice={...intent},start=viewEpoch;setBusy(true);problem='';notice='';
      try{await service.review(choice.id,choice.previous,choice.status);if(start!==viewEpoch)return;notice=choice.status==='approved'?'✓ Llogaria u pranua':choice.status==='rejected'?'Kërkesa u refuzua.':'Qasja u hoq.';intent=null;const data=await service.list();if(start!==viewEpoch)return;requests=data.requests;user=data.user;}
      catch(error){if(start===viewEpoch){problem=error.message;intent=null;}}
      finally{if(start===viewEpoch){busy=false;render();}}
    }
  });
  function hide(){service.cancel();clearPrivate();busy=false;screen='loading';notice='';problem='';render();}
  document.addEventListener('visibilitychange',()=>{if(document.hidden)hide();else boot();});
  root.addEventListener('pagehide',hide);
  root.addEventListener('pageshow',event=>{if(event.persisted)boot();});
  root.addEventListener('offline',()=>{hide();screen='login';problem='Paneli kërkon lidhje me internet për të kontrolluar lejet.';render();});
  setInterval(()=>{if(!document.hidden&&screen==='panel'&&!busy&&!intent)boot();},60000);
  boot();
})(globalThis);
