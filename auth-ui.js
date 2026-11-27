(function(root) {
  'use strict';
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function mount(element,{service,status='anonymous',email='',emailVerified=false,message='',onAuthenticated,onSessionReady=()=>{},onDemo=null,onGoogleRedirect=url=>root.location.assign(url)}) {
    let mode=status==='photo_required'?'google-photo':['pending','rejected','login'].includes(status)?status:'register',step='account',destroyed=false,busy=false,cameraOpening=false,stream=null,photo=null,photoUrl='',capturedAt='',cameraEpoch=0;
    const field=(id,label,type,auto,extra='')=>`<label class="auth-field" for="${id}"><span>${label}</span><input id="${id}" name="${id}" type="${type}" autocomplete="${auto}" ${extra} required></label>`;
    function error(text){const target=element.querySelector('[data-auth-error]');if(target)target.textContent=text;}
    function stopCamera(){cameraEpoch++;cameraOpening=false;stream?.getTracks().forEach(track=>track.stop());stream=null;const video=element.querySelector('video');if(video){video.srcObject=null;video.hidden=true;}const capture=element.querySelector('[data-camera-capture]'),start=element.querySelector('[data-camera-start]'),cancel=element.querySelector('[data-camera-cancel]'),placeholder=element.querySelector('[data-camera-placeholder]');if(capture)capture.disabled=true;if(start)start.disabled=busy||!service.configured;if(cancel)cancel.hidden=true;if(placeholder)placeholder.hidden=!!photo;}
    function clearPhoto(){photo=null;capturedAt='';if(photoUrl)URL.revokeObjectURL(photoUrl);photoUrl='';const image=element.querySelector('.auth-camera-frame img');if(image){image.removeAttribute('src');image.hidden=true;}}
    function drawBase(){
      stopCamera();clearPhoto();busy=false;
      const setup=service.configured?'':`<div class="auth-setup" role="status"><span class="auth-status-dot" aria-hidden="true"></span><span>Hyrja aktivizohet pasi të lidhet serveri.</span></div>`;
      const title=mode==='register'?'Regjistrohu':mode==='google-photo'?'Përfundo regjistrimin':mode==='pending'?'Në pritje të miratimit':mode==='rejected'?'Kërkesa nuk u miratua':'Kyçu';
      const tabs=['login','register'].includes(mode)?`<div class="auth-tabs" role="group" aria-label="Hyrja dhe regjistrimi"><button type="button" data-auth-tab="register" aria-pressed="${mode==='register'}">Regjistrohu</button><button type="button" data-auth-tab="login" aria-pressed="${mode==='login'}">Hyr</button></div>`:'';
      const disabled=service.configured?'':'disabled';
      const login=`<form id="auth-login-form">${field('login-email','Emaili','email','username','maxlength="254" inputmode="email" autocapitalize="none" spellcheck="false"')}<div class="auth-password">${field('login-password','Fjalëkalimi','password','current-password','maxlength="128"')}<button type="button" class="auth-reveal" data-reveal="login-password" aria-label="Shfaq fjalëkalimin" aria-pressed="false">Shfaq</button></div><button type="submit" class="primary-button auth-submit" ${disabled}>Kyçu</button></form><p class="auth-footnote">Regjistrimi nuk e hap automatikisht aplikacionin.</p>`;
      const register=`<form id="auth-register-form">${field('register-email','Emaili yt','email','email','maxlength="254" inputmode="email" autocapitalize="none" spellcheck="false"')}<div class="auth-password">${field('register-password','Fjalëkalimi','password','new-password','minlength="12" maxlength="128" aria-describedby="password-help"')}<button type="button" class="auth-reveal" data-reveal="register-password" aria-label="Shfaq fjalëkalimin" aria-pressed="false">Shfaq</button></div><small id="password-help">12–128 shenja. Mund të përdorësh një fjali të gjatë.</small>${field('register-confirm','Përsërite fjalëkalimin','password','new-password','minlength="12" maxlength="128"')}<fieldset class="auth-camera"><legend>Fotografi nga kamera</legend><div class="auth-camera-frame"><div data-camera-placeholder>Fotografia e sapobërë shfaqet këtu.</div><video autoplay muted playsinline hidden aria-label="Pamja nga kamera"></video><img hidden alt="Fotografia për kërkesën e regjistrimit"></div><p>Pa ngarkim nga galeria. Kamera hapet vetëm kur e lejon ti.</p><div class="auth-camera-actions"><button type="button" class="subtle-button" data-camera-start ${disabled}>Hap kamerën</button><button type="button" class="subtle-button" data-camera-capture disabled>Shkrep fotografinë</button></div><small data-camera-status role="status"></small></fieldset><label class="auth-consent"><input type="checkbox" id="photo-consent" required><span>Pajtohem që fotografia t’i dërgohet personit që shqyrton kërkesën. Ditari im nuk dërgohet.</span></label><button type="submit" class="primary-button auth-submit" ${disabled}>Dërgo kërkesën</button></form>`;
      const waiting=`<div class="auth-pending-mark" aria-hidden="true">${mode==='pending'?'◷':'—'}</div><p>${mode==='pending'?`Kërkesa jote pret shqyrtimin. ${emailVerified?'':'Verifiko adresën nga emaili që merr. '}Deri në miratim, hapësira personale mbetet e mbyllur.`:'Kjo kërkesë nuk ka leje të hapë hapësirën personale.'}</p><button type="button" class="primary-button auth-submit" data-check-status ${disabled}>Kontrollo gjendjen</button><button type="button" class="subtle-button auth-submit" data-request-logout>Kthehu te hyrja</button>`;
      element.innerHTML=`<main class="auth-screen"><section class="auth-card" aria-labelledby="auth-heading"><div class="auth-brand"><span class="auth-brand-mark" aria-hidden="true">E<span class="auth-brand-spark">✦</span></span><span>Emma’s Space</span></div><p class="auth-exclusive">Lejohet vetëm llogaria e Emmës.</p><h1 id="auth-heading">${title}</h1>${tabs}<p class="auth-message" role="status" data-auth-message>${escape(message)}</p><p class="auth-error" role="alert" data-auth-error></p>${['pending','rejected'].includes(mode)?waiting:['register','google-photo'].includes(mode)?register:login}${setup}<p class="auth-private-note"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg> Hapësira jote private</p></section></main>`;
    }
    function draw(){
      drawBase();
      step='account';
      if(mode==='register'){
        const form=element.querySelector('#auth-register-form'),account=document.createElement('fieldset'),photoStep=document.createElement('fieldset');
        account.className='auth-step-fields';account.dataset.accountStep='';account.setAttribute('aria-label','Llogaria');photoStep.className='auth-step-fields';photoStep.dataset.photoStep='';photoStep.setAttribute('aria-label','Fotografia');
        const camera=form.querySelector('.auth-camera');
        while(form.firstChild!==camera)account.append(form.firstChild);
        photoStep.append(camera,form.querySelector('.auth-consent'));form.prepend(account,photoStep);
        const progress=document.createElement('ol');progress.className='auth-progress';progress.setAttribute('aria-label','Hapat e regjistrimit');
        progress.innerHTML='<li data-step-account aria-current="step"><span>1</span> Llogaria</li><li data-step-photo><span>2</span> Fotografia</li>';form.before(progress);
        const back=document.createElement('button');back.type='button';back.className='auth-back';back.dataset.stepBack='';back.textContent='← Llogaria';form.prepend(back);
      }
      if(mode==='google-photo'){
        const form=element.querySelector('#auth-register-form');form.id='auth-google-photo-form';
        form.querySelector('#register-email').closest('label').remove();form.querySelector('.auth-password').remove();form.querySelector('#password-help').remove();form.querySelector('#register-confirm').closest('label').remove();
        const verified=document.createElement('p');verified.className='auth-google-verified';verified.textContent=email?`Emaili u verifikua: ${email}`:'Emaili u verifikua.';form.prepend(verified);
        form.querySelector('[type="submit"]').textContent='Dërgo fotografinë për miratim';
        const back=document.createElement('button');back.type='button';back.className='subtle-button auth-submit';back.textContent='Kthehu te hyrja';back.setAttribute('data-request-logout','');form.after(back);
      }
      if(['login','register'].includes(mode)){
        const choice=document.createElement('div');choice.className='auth-google-choice';
        choice.innerHTML=`<button type="button" class="auth-google-button" data-auth-google ${service.googleConfigured?'':'disabled'}><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.73-.06-1.42-.19-2.09H12v3.96h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-7.96Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.16v2.84A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.84 14.09A6.6 6.6 0 0 1 5.49 12c0-.73.13-1.43.35-2.09V7.07H2.16A11 11 0 0 0 1 12c0 1.78.43 3.45 1.16 4.93l3.68-2.84Z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.07.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.46 2.16 7.07l3.68 2.84C6.71 7.31 9.14 5.38 12 5.38Z"/></svg><span>Vazhdo me Google</span></button>${service.configured&&!service.googleConfigured?'<small>Google ende nuk është konfiguruar.</small>':''}<div class="auth-divider"><span>ose me email</span></div>`;
        element.querySelector('.auth-tabs').after(choice);
        if(typeof onDemo==='function'){
          const demo=document.createElement('div');demo.className='auth-demo-entry';
          demo.innerHTML='<button type="button" data-auth-demo>Hap demon <span aria-hidden="true">→</span></button><small>Provoje aplikacionin · të dhëna prove</small>';
          element.querySelector('.auth-tabs').after(demo);
        }
        if(mode==='login'&&!service.emailVerificationFirst){
          const passkey=document.createElement('div');passkey.className='auth-passkey-choice';
          passkey.innerHTML=`<button type="button" class="auth-passkey-button" data-auth-passkey ${service.passkeyConfigured?'':'disabled'} aria-describedby="auth-passkey-help"><svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3M8 8v2m8-2v2m-5-1v5h2m-5 2c2 2 6 2 8 0"/></svg><span>Hyr me passkey</span></button><p id="auth-passkey-help">${service.passkeyConfigured?'Konfirmo me Face ID, Touch ID ose kodin e pajisjes.':'Face ID / passkey · aktivizohet pas lidhjes me serverin.'}</p>`;
          choice.prepend(passkey);
        }
      }
      if(mode==='register'){
        showStep('account',false);
        if(service.emailVerificationFirst){
          element.querySelector('.auth-progress').hidden=true;
          element.querySelector('[type="submit"]').textContent='Krijo llogarinë';
          const hint=document.createElement('p');hint.className='auth-footnote';hint.textContent='Konfirmo emailin. Pastaj hyr dhe shkrep fotografinë për miratim.';
          element.querySelector('#auth-register-form').after(hint);
        }
      }
      if(mode==='pending'&&!emailVerified&&service.emailVerificationFirst){
        element.querySelector('#auth-heading').textContent='Konfirmo emailin';
        const paragraph=element.querySelector('.auth-pending-mark + p');
        if(paragraph)paragraph.textContent='Hap mesazhin e verifikimit në email. Pastaj zgjidh “Hyr” dhe vazhdo me fotografinë për miratim.';
      }
    }
    function showStep(next,focus=true){
      step=next;const form=element.querySelector('#auth-register-form');if(!form)return;
      const isPhoto=next==='photo',account=form.querySelector('[data-account-step]'),photoStep=form.querySelector('[data-photo-step]');
      account.hidden=isPhoto;photoStep.hidden=!isPhoto;photoStep.disabled=!isPhoto;
      form.querySelector('[data-step-back]').hidden=!isPhoto;form.querySelector('[type="submit"]').textContent=isPhoto?'Dërgo kërkesën':service.emailVerificationFirst?'Krijo llogarinë':'Vazhdo';
      element.querySelector('.auth-google-choice').hidden=isPhoto;element.querySelector('.auth-tabs').hidden=isPhoto;
      const demo=element.querySelector('.auth-demo-entry');if(demo)demo.hidden=isPhoto;
      element.querySelector('[data-step-account]').toggleAttribute('aria-current',!isPhoto);element.querySelector('[data-step-photo]').toggleAttribute('aria-current',isPhoto);
      const current=element.querySelector(isPhoto?'[data-step-photo]':'[data-step-account]');current.setAttribute('aria-current','step');
      element.querySelector('#auth-heading').textContent=isPhoto?'Një fotografi e jotja':'Regjistrohu';
      if(focus){const target=isPhoto?form.querySelector('[data-step-back]'):form.querySelector('#register-email');target.focus();}
    }
    function setBusy(value){busy=value;element.querySelector('.auth-card')?.setAttribute('aria-busy',String(value));const notice=element.querySelector('[data-auth-message]');if(notice)notice.textContent=value?'Po punohet…':'';element.querySelectorAll('button').forEach(button=>{button.disabled=value || (button.matches('[data-auth-google]')&&!service.googleConfigured) || (button.matches('[data-auth-passkey]')&&!service.passkeyConfigured) || (!service.configured&&!button.matches('[data-auth-tab],[data-reveal],[data-request-logout],[data-step-back],[data-auth-demo]')) || (button.matches('[data-camera-capture]')&&(!stream||cameraOpening));});}
    function accept(result){if(destroyed)return;if(['approved','photo_required','pending','rejected'].includes(result.status))onSessionReady();emailVerified=result.emailVerified===true;if(result.status==='approved'&&service.isAuthenticated()){stopCamera();clearPhoto();element.querySelectorAll('input[type="password"],input[autocomplete="current-password"]').forEach(input=>input.value='');onAuthenticated();}else if(result.status==='photo_required'){email=result.email||'';mode='google-photo';message='';draw();}else if(['pending','rejected'].includes(result.status)){mode=result.status;message='';draw();}else{mode='login';message='Kyçu për të vazhduar.';draw();}}
    async function startCamera(){
      if(cameraOpening)return;
      error('');stopCamera();clearPhoto();
      const video=element.querySelector('video'),image=element.querySelector('.auth-camera-frame img'),placeholder=element.querySelector('[data-camera-placeholder]'),statusText=element.querySelector('[data-camera-status]');
      if(!service.configured){error('Lidh fillimisht serverin e regjistrimit.');return;}
      if(!root.isSecureContext || !navigator.mediaDevices?.getUserMedia){error('Kamera kërkon HTTPS ose localhost dhe një shfletues që e mbështet.');return;}
      if(!element.querySelector('[data-camera-cancel]')){const cancel=document.createElement('button');cancel.type='button';cancel.className='subtle-button';cancel.textContent='Anulo kamerën';cancel.setAttribute('data-camera-cancel','');element.querySelector('.auth-camera-actions').append(cancel);}
      const epoch=++cameraEpoch;cameraOpening=true;let readyTimer;
      element.querySelector('[data-camera-start]').disabled=true;element.querySelector('[data-camera-capture]').disabled=true;element.querySelector('[data-camera-cancel]').hidden=false;
      statusText.textContent='Po kërkohet leja e kamerës…';
      try{
        const candidate=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:720},height:{ideal:960}},audio:false});
        if(destroyed||epoch!==cameraEpoch||!['register','google-photo'].includes(mode)){candidate.getTracks().forEach(track=>track.stop());return;}
        stream=candidate;image.hidden=true;video.hidden=false;placeholder.hidden=true;video.srcObject=stream;video.muted=true;
        await Promise.race([video.play(),new Promise((_,reject)=>{readyTimer=setTimeout(()=>reject(new Error('Camera did not start')),12000);})]);
        if(destroyed||epoch!==cameraEpoch)return;
        statusText.textContent='Kamera është hapur. Shkrepe kur të jesh gati.';
        element.querySelector('[data-camera-capture]').disabled=false;
      }catch(e){if(!destroyed&&epoch===cameraEpoch){stopCamera();const text=e.name==='NotAllowedError'?'Leja e kamerës nuk u dha. Mund ta lejosh dhe të provosh përsëri.':'Kamera nuk u hap. Kontrollo pajisjen dhe provo përsëri.';error(text);statusText.textContent=text;}}
      finally{clearTimeout(readyTimer);if(!destroyed&&epoch===cameraEpoch){cameraOpening=false;element.querySelector('[data-camera-start]').disabled=busy||!service.configured;}}
    }
    async function capture(){
      const video=element.querySelector('video');if(!stream||!video.videoWidth||!video.videoHeight){error('Prit derisa të shfaqet pamja e kamerës.');return;}
      const epoch=cameraEpoch,canvas=document.createElement('canvas'),scale=Math.min(1,720/Math.max(video.videoWidth,video.videoHeight));canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.86));
      if(destroyed||epoch!==cameraEpoch)return;if(!blob||blob.size>1024*1024){error('Fotografia nuk u përgatit. Provo përsëri.');return;}
      clearPhoto();photo=blob;capturedAt=new Date().toISOString();photoUrl=URL.createObjectURL(blob);stopCamera();video.hidden=true;const image=element.querySelector('.auth-camera-frame img');image.src=photoUrl;image.hidden=false;element.querySelector('[data-camera-status]').textContent='Fotografia u shkrep. Kamera u mbyll.';element.querySelector('[data-camera-start]').textContent='Ribëj fotografinë';element.querySelector('[data-camera-capture]').disabled=true;
    }
    async function click(event){
      if(event.target.closest('[data-camera-cancel]')){stopCamera();const text=element.querySelector('[data-camera-status]');if(text)text.textContent='Kamera është e mbyllur.';return;}
      const tab=event.target.closest('[data-auth-tab]');if(tab&&!busy){mode=tab.dataset.authTab;message='';draw();element.querySelector(`[data-auth-tab="${mode}"]`)?.focus();return;}
      const reveal=event.target.closest('[data-reveal]');if(reveal){const input=element.querySelector('#'+reveal.dataset.reveal),show=input.type==='password';input.type=show?'text':'password';reveal.textContent=show?'Fshih':'Shfaq';reveal.setAttribute('aria-pressed',String(show));reveal.setAttribute('aria-label',show?'Fshih fjalëkalimin':'Shfaq fjalëkalimin');return;}
      if(busy)return;
      if(event.target.closest('[data-auth-demo]')&&typeof onDemo==='function'){stopCamera();clearPhoto();onDemo();return;}
      if(event.target.closest('[data-step-back]')){stopCamera();error('');const cameraStatus=element.querySelector('[data-camera-status]');if(cameraStatus)cameraStatus.textContent=photo?'Fotografia është gati.':'Kamera është e mbyllur.';showStep('account');return;}
      if(event.target.closest('[data-auth-passkey]')){
        setBusy(true);error('');
        try{accept(await service.loginPasskey());}catch(e){if(!destroyed)error(e.message);}
        finally{if(!destroyed)setBusy(false);}return;
      }
      if(event.target.closest('[data-auth-google]')){
        setBusy(true);error('');let navigating=false;
        try{const url=await service.beginGoogle(mode==='login'?'login':'register');if(!destroyed){onGoogleRedirect(url);navigating=true;}}
        catch(e){if(!destroyed)error(e.message);}
        finally{if(!destroyed&&!navigating)setBusy(false);}
        return;
      }
      if(event.target.closest('[data-camera-start]')){await startCamera();return;}
      if(event.target.closest('[data-camera-capture]')){await capture();return;}
      if(event.target.closest('[data-check-status]')){setBusy(true);try{const result=await service.session();if(result.status==='pending')error('Kërkesa ende pret miratimin.');else accept(result);}catch(e){error(e.message);}finally{if(!destroyed)setBusy(false);}return;}
      if(event.target.closest('[data-request-logout]')){stopCamera();clearPhoto();setBusy(true);try{if(service.configured)await service.logout();mode='login';message='';draw();}catch(e){error(e.message);}finally{if(!destroyed)setBusy(false);}}
    }
    async function submit(event){
      if(!event.target.matches('#auth-login-form,#auth-register-form,#auth-google-photo-form'))return;event.preventDefault();if(busy)return;error('');
      const form=event.target,google=form.id==='auth-google-photo-form',register=google||form.id==='auth-register-form';
      const password=google?'':form.querySelector(register?'#register-password':'#login-password').value,address=google?'':form.querySelector(register?'#register-email':'#login-email').value;
      if(register&&!google&&password!==form.querySelector('#register-confirm').value){error('Fjalëkalimet nuk përputhen.');return;}
      if(register&&!google&&step==='account'&&!service.emailVerificationFirst){showStep('photo');return;}
      if(register&&!photo&&(google||!service.emailVerificationFirst)){error('Hap kamerën dhe shkrep fotografinë.');return;}
      setBusy(true);
      try{accept(google?await service.completeGoogleRegistration({photo,capturedAt,consent:form.querySelector('#photo-consent').checked}):register?await service.register({email:address,password,photo,capturedAt,consent:form.querySelector('#photo-consent').checked}):await service.login(address,password));}
      catch(e){if(!destroyed){error(e.message);if(register&&!google)showStep('account');}}
      finally{form.querySelectorAll('input[type="password"],input[autocomplete="current-password"],input[autocomplete="new-password"]').forEach(input=>input.value='');if(!destroyed)setBusy(false);}
    }
    function background(){if(document.hidden){stopCamera();service.cancelPasskey?.();}}
    function pagehide(){stopCamera();service.cancelPasskey?.();clearPhoto();if(mode==='register'&&step==='photo')showStep('account',false);element.querySelectorAll('input[type="password"],input[autocomplete="current-password"],input[autocomplete="new-password"]').forEach(input=>input.value='');}
    element.addEventListener('click',click);element.addEventListener('submit',submit);document.addEventListener('visibilitychange',background);
    root.addEventListener('pagehide',pagehide);
    draw();
    return {destroy(){destroyed=true;stopCamera();service.cancelPasskey?.();clearPhoto();element.querySelectorAll('input[type="password"],input[autocomplete="current-password"],input[autocomplete="new-password"]').forEach(input=>input.value='');element.removeEventListener('click',click);element.removeEventListener('submit',submit);document.removeEventListener('visibilitychange',background);root.removeEventListener('pagehide',pagehide);}};
  }
  root.EmmaAuthUI={mount};
})(globalThis);
