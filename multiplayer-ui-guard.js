(()=>{
  'use strict';
  const mode=String(window.__MULTI_MODE||'');
  if(!mode||window.__MULTI_UI_GUARD)return;
  window.__MULTI_UI_GUARD=true;

  const isTypingTarget=(el)=>{
    if(!el)return false;
    const tag=(el.tagName||'').toUpperCase();
    return tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||!!el.isContentEditable;
  };

  // 입력창에 포커스가 있으면 원본 게임의 window keydown/keyup까지 이벤트가 올라가지 않게 한다.
  // preventDefault는 하지 않으므로 Q/W/E/R도 정상적으로 입력된다.
  const stopGameHotkeys=(e)=>{
    if(isTypingTarget(e.target))e.stopPropagation();
  };
  document.addEventListener('keydown',stopGameHotkeys,false);
  document.addEventListener('keyup',stopGameHotkeys,false);

  // 입력창을 클릭하는 순간 이전에 눌린 이동/스킬 키가 원본 게임에 남아있지 않도록 keyup을 한 번 보낸다.
  document.addEventListener('focusin',(e)=>{
    if(!isTypingTarget(e.target))return;
    ['w','a','s','d','q','e','r','arrowup','arrowdown','arrowleft','arrowright',' '].forEach(k=>{
      try{window.dispatchEvent(new KeyboardEvent('keyup',{key:k,bubbles:false}));}catch(_){ }
    });
  },false);

  function normalizeInputs(){
    document.querySelectorAll('input,textarea').forEach(el=>{
      el.autocomplete='off';
      el.spellcheck=false;
      if(el.id==='pvpCode'||el.id==='coopCode'){
        el.style.textTransform='none';
        el.addEventListener('input',()=>{
          // 어떤 영문자도 막지 않는다. 공백만 제거.
          const s=el.value.replace(/\s+/g,'');
          if(s!==el.value){const p=el.selectionStart;el.value=s;try{el.setSelectionRange(p,p)}catch(_){ }}
        });
      }
    });
  }

  // 멀티에서 원본 일반/지옥 랭킹 등록 오버레이가 뜨면 즉시 닫는다.
  // 인벤토리/상점 등 다른 원본 오버레이는 건드리지 않는다.
  function suppressSingleRank(){
    const ov=document.getElementById('ov');
    const box=document.getElementById('ovc');
    if(!ov||!box)return;
    const text=(box.textContent||'');
    const isSingleRank=text.includes('온라인 랭킹 등록')||text.includes('rank-split-v1-boss-cycle');
    if(!isSingleRank)return;
    ov.classList.add('h');
    ov.style.display='none';
    try{window.OV_OPEN=false;}catch(_){ }
  }

  normalizeInputs();
  suppressSingleRank();

  const mo=new MutationObserver(()=>{
    normalizeInputs();
    suppressSingleRank();
  });
  if(document.body)mo.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style']});
})();
