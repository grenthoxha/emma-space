/* Keep fixed UI outside the keyboard and reserve its actual measured space. */
(function () {
  'use strict';
  const root=document.documentElement;
  let frame=0,header=null,nav=null;
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null;
  function schedule(){if(!frame)frame=requestAnimationFrame(measure);}
  function measure(){
    frame=0;
    const nextHeader=document.querySelector('.glass-header'),nextNav=document.querySelector('.glass-nav');
    if(nextHeader!==header||nextNav!==nav){observer?.disconnect();header=nextHeader;nav=nextNav;if(header)observer?.observe(header);if(nav)observer?.observe(nav);}
    let headerBottom=0;
    if(header){const bounds=header.getBoundingClientRect();headerBottom=bounds.bottom;root.style.setProperty('--header-height',bounds.height+'px');root.style.setProperty('--header-bottom',bounds.bottom+'px');}
    const content=document.querySelector('#screen-container');
    const clipTop=header&&content?Math.max(0,headerBottom-content.getBoundingClientRect().top):0;
    root.style.setProperty('--screen-clip-top',clipTop+'px');
    root.classList.toggle('content-under-header',clipTop>0);
    if(nav)root.style.setProperty('--nav-height',nav.getBoundingClientRect().height+'px');
    const viewport=window.visualViewport,height=viewport?.height || window.innerHeight;
    root.style.setProperty('--visual-height',height+'px');root.style.setProperty('--visual-top',(viewport?.offsetTop || 0)+'px');
    const active=document.activeElement,typing=active?.matches('input:not([type="checkbox"]):not([type="radio"]),textarea,[contenteditable="true"]');
    root.classList.toggle('keyboard-open',innerWidth<=900&&!!typing&&Math.abs((viewport?.scale || 1)-1)<.05&&innerHeight-height>140);
    const modal=document.getElementById('confirm-overlay'),arena=document.getElementById('fullscreen-focus-arena');
    root.classList.toggle('dialog-open',!!((modal&&!modal.classList.contains('hidden'))||(arena&&!arena.classList.contains('hidden'))));
  }
  window.addEventListener('resize',schedule,{passive:true});
  window.addEventListener('scroll',schedule,{passive:true});
  window.visualViewport?.addEventListener('resize',schedule,{passive:true});
  window.visualViewport?.addEventListener('scroll',schedule,{passive:true});
  document.addEventListener('focusin',schedule);document.addEventListener('focusout',schedule);
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  window.EmmaResponsive={refresh:schedule};schedule();
})();
