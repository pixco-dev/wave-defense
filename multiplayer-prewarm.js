(()=>{
  'use strict';
  if(window.__MULTI_PREWARM)return;
  window.__MULTI_PREWARM=true;
  const HEALTH='https://pixco-wave-defense-coop.onrender.com/health';
  const SDK='https://unpkg.com/@colyseus/sdk@0.17.0/dist/colyseus.js';
  let last=0,promise=null;

  function warm(force=false){
    const now=Date.now();
    if(!force&&promise&&now-last<20000)return promise;
    last=now;
    const ac=new AbortController();
    const timer=setTimeout(()=>ac.abort(),45000);
    promise=fetch(HEALTH+'?warm='+now,{mode:'no-cors',cache:'no-store',signal:ac.signal})
      .catch(()=>null)
      .finally(()=>clearTimeout(timer));
    return promise;
  }

  // Browser-cache the Colyseus SDK before the multiplayer page needs it.
  try{
    const l=document.createElement('link');
    l.rel='preload';l.as='script';l.href=SDK;l.crossOrigin='anonymous';
    document.head.appendChild(l);
  }catch(_){ }

  window.__warmMultiplayerServer=warm;
  warm(true);
  setInterval(()=>{if(document.visibilityState==='visible')warm(true)},240000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')warm(true)});
})();
