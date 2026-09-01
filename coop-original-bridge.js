(()=>{
'use strict';
const SERVER='wss://pixco-wave-defense-coop.onrender.com';
const DIFF={1:[1,1,1],2:[1.45,1.15,1.70],3:[1.90,1.30,2.40],4:[2.35,1.50,3.10]};
let client=null,room=null,myId='',hostId='',isHost=false,coopStarted=false,startParty=1,coopDown=false,lastWorld=null,lootCursor=0,suppressNet=false;
const remotes=new Map();
let roster=[];

const orig={
  waveTick,updE,updBoss,startWave,enemyHpScale,bossHpScale,
  useSkill:P.useSkill,spawnBul,manualMeleeAttackDir,handleKill,spawnDrop,showGO,draw:P.draw
};

function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function log(s,col='#aaa'){const el=document.getElementById('coopLog');if(el)el.innerHTML=`<div style="color:${col}">${esc(s)}</div>`+el.innerHTML;}
function diff(){return DIFF[Math.max(1,Math.min(4,startParty))]||DIFF[1];}
function packPlayer(){return {name:(document.getElementById('coopName')?.value||'Player').slice(0,12),x:P.x,y:P.y,hp:P.hp,maxHp:P.maxHp,mp:P.mp,maxMp:P.maxMp,level:P.lv,atk:P.atk,def:P.def,gold:P.gold,kills:P.kills,alive:!coopDown,angle:0,color:localColor(),weapon:P.eq?.weapon?JSON.parse(JSON.stringify(P.eq.weapon)):null};}
function localColor(){const r=roster.find(x=>x.id===myId);return r?.color||'#4af0ff';}

function installLobby(){
  const ss=document.getElementById('ss');
  if(!ss)return;
  ss.style.display='flex';
  ss.innerHTML=`<div style="text-align:center;width:min(720px,94vw);padding:24px">
    <div style="font-size:52px;font-weight:bold;color:#ffc828;text-shadow:0 0 40px #ffc82888;margin-bottom:6px;letter-spacing:4px">WAVE</div>
    <div style="font-size:34px;font-weight:bold;color:#4af0b0;text-shadow:0 0 20px #4af0b088;margin-bottom:18px;letter-spacing:6px">DEFENSE RPG</div>
    <div style="font-size:19px;font-weight:bold;color:#4af0ff;margin-bottom:16px">🤝 원본 협동 모드</div>
    <div style="background:rgba(255,255,255,.05);border:1px solid #2a2840;border-radius:12px;padding:14px;margin:0 auto 14px;max-width:620px;color:#aaa;font-size:12px;line-height:1.7">원본 맵 · 원본 적/특수몹 · 5종 보스/탄막 · 아이템/상점/강화/합성 · 17개 스킬을 그대로 사용합니다.<br>첫 번째 플레이어가 월드 호스트가 되고 나머지 플레이어는 같은 원본 월드에 접속합니다.</div>
    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:10px">
      <input id="coopName" maxlength="12" value="Player" placeholder="닉네임" style="width:120px;background:#12101e;border:1px solid #555;border-radius:8px;color:#fff;padding:10px;font-family:inherit">
      <select id="coopParty" style="background:#12101e;border:1px solid #555;border-radius:8px;color:#fff;padding:10px;font-family:inherit"><option value="2">2인</option><option value="3">3인</option><option value="4">4인</option></select>
      <button id="coopCreate" style="background:linear-gradient(135deg,#125d72,#082632);border:2px solid #4af0ff;border-radius:10px;padding:10px 18px;color:#9af8ff;font-weight:bold;font-family:inherit;cursor:pointer">방 만들기</button>
    </div>
    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:10px">
      <input id="coopCode" placeholder="방 코드" style="width:240px;background:#12101e;border:1px solid #555;border-radius:8px;color:#fff;padding:10px;font-family:inherit">
      <button id="coopJoin" style="background:#1a1830;border:1px solid #ffc828;border-radius:10px;padding:10px 18px;color:#ffc828;font-weight:bold;font-family:inherit;cursor:pointer">코드로 참가</button>
    </div>
    <div id="coopRoom" style="display:none;background:#12101e;border:1px solid #333;border-radius:12px;padding:12px;margin:12px auto;max-width:620px">
      <div id="coopRoomId" style="font-size:12px;color:#ffc828;margin-bottom:8px"></div>
      <div id="coopRoster" style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin-bottom:10px"></div>
      <button id="coopStart" style="display:none;background:linear-gradient(135deg,#ffc828,#ff8c00);border:0;border-radius:10px;padding:11px 28px;color:#0a0814;font-weight:bold;font-family:inherit;cursor:pointer">협동 시작</button>
    </div>
    <div id="coopStatus" style="font-size:12px;color:#aaa">서버 연결 준비 중...</div>
    <div id="coopLog" style="font-size:10px;color:#777;margin-top:8px;max-height:70px;overflow:auto"></div>
    <button onclick="location.href='./'" style="margin-top:12px;background:transparent;border:1px solid #444;border-radius:8px;padding:7px 14px;color:#888;font-family:inherit;cursor:pointer">← 일반/지옥으로 돌아가기</button>
  </div>`;
}

function loadSdk(){return new Promise((resolve,reject)=>{if(window.Colyseus)return resolve();const s=document.createElement('script');s.src='https://unpkg.com/@colyseus/sdk@0.17.0/dist/colyseus.js';s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});}

async function createRoom(){
  try{
    setStatus('서버에 연결 중...','#aaa');
    client=new Colyseus.Client(SERVER);
    const party=Number(document.getElementById('coopParty').value)||2;
    room=await client.create('wave_defense',{partySize:party,name:document.getElementById('coopName').value});
    bindRoom();
  }catch(e){setStatus('방 생성 실패: '+e.message,'#ff6060');}
}
async function joinRoom(){
  try{
    const code=document.getElementById('coopCode').value.trim();if(!code)return setStatus('방 코드를 입력해줘.','#ff6060');
    setStatus('방 참가 중...','#aaa');
    client=new Colyseus.Client(SERVER);
    room=await client.joinById(code,{name:document.getElementById('coopName').value});
    bindRoom();
  }catch(e){setStatus('방 참가 실패: '+e.message,'#ff6060');}
}
function setStatus(s,c='#aaa'){const e=document.getElementById('coopStatus');if(e){e.textContent=s;e.style.color=c;}}

function bindRoom(){
  myId=room.sessionId;
  document.getElementById('coopRoom').style.display='block';
  document.getElementById('coopRoomId').textContent='방 코드: '+room.roomId+'  (친구에게 이 코드를 보내면 됨)';
  setStatus('접속 성공','#4af0b0');
  room.onMessage('hello',m=>{hostId=m.hostId;isHost=myId===hostId;roster=m.players||[];renderRoster();});
  room.onMessage('roster',m=>{hostId=m.hostId;isHost=myId===hostId;roster=m.players||[];renderRoster();});
  room.onMessage('hostChanged',m=>{hostId=m.hostId;isHost=myId===hostId;renderRoster();log(isHost?'내가 새 월드 호스트가 됨':'호스트 변경됨','#ffc828');});
  room.onMessage('playerState',m=>{if(m.id!==myId)remotes.set(m.id,m);});
  room.onMessage('start',m=>beginCoop(m));
  room.onMessage('world',m=>{lastWorld=m;if(coopStarted&&!isHost)applyWorld(m);});
  room.onMessage('action',m=>{if(coopStarted&&isHost)applyRemoteAction(m);});
  room.onMessage('damage',m=>applyDamage(Number(m.amount)||0));
  room.onMessage('reward',m=>applyReward(m));
  room.onMessage('giveItem',m=>giveItem(m.name));
  room.onMessage('becomeHost',m=>{isHost=true;hostId=myId;if(m.world)applyWorld(m.world);installHostPatches();});
  room.onMessage('gameover',m=>coopGameOver(m));
  room.onLeave(()=>setStatus('서버 연결이 종료됨','#ff6060'));
}
function renderRoster(){
  const box=document.getElementById('coopRoster');if(!box)return;
  box.innerHTML=roster.map(p=>`<div style="border:1px solid ${p.color||'#555'};border-radius:8px;padding:6px 10px;color:${p.color||'#fff'}">${esc(p.name)}${p.id===hostId?' 👑':''}</div>`).join('');
  const b=document.getElementById('coopStart');if(b)b.style.display=isHost?'inline-block':'none';
  if(isHost)setStatus(`방장 · 현재 ${roster.length}명 · 시작하면 추가 입장 불가`,'#ffc828');
  else setStatus(`방 참가 완료 · 방장이 시작하기를 기다리는 중`,'#4af0b0');
}

function beginCoop(m){
  if(coopStarted)return;
  coopStarted=true;startParty=Number(m.partySize)||roster.length||1;hostId=m.hostId;isHost=myId===hostId;
  resetGameState();
  HELL_MODE=false;
  document.getElementById('ss').style.display='none';
  GAME_STARTED=true;
  GAMEOVER=false;OV_OPEN=false;coopDown=false;
  if(isHost)installHostPatches();
  log(`협동 시작 · ${startParty}인 · 적HP×${diff()[0]} / 적수×${diff()[1]} / 보스×${diff()[2]}`,'#4af0b0');
}

function installHostPatches(){/* wrappers are conditional; flag is enough */}

// 게스트는 월드 생성/AI를 돌리지 않고 호스트 원본 월드를 받는다.
waveTick=function(dt){if(coopStarted&&!isHost)return;return orig.waveTick(dt);};
startWave=function(){
  const r=orig.startWave();
  if(coopStarted&&isHost){
    const f=diff()[1];const base=QUEUE.length;const target=Math.max(base,Math.round(base*f));
    while(QUEUE.length<target)QUEUE.push(rndType());
  }
  return r;
};
enemyHpScale=function(w){const v=orig.enemyHpScale(w);return coopStarted&&isHost?v*diff()[0]:v;};
bossHpScale=function(w){const v=orig.bossHpScale(w);return coopStarted&&isHost?v*diff()[2]:v;};

function targetFor(x,y){
  let best=null,bd=Infinity;
  if(!coopDown&&P.alive){const d=(P.x-x)**2+(P.y-y)**2;if(d<bd){bd=d;best={id:myId,local:true,x:P.x,y:P.y,hp:P.hp,maxHp:P.maxHp,def:P.def};}}
  for(const [id,p] of remotes){if(p.alive===false)continue;const d=(p.x-x)**2+(p.y-y)**2;if(d<bd){bd=d;best={id,local:false,...p};}}
  return best;
}
function withProxy(target,fn){
  if(!target||target.local)return fn();
  const save={x:P.x,y:P.y,hp:P.hp,maxHp:P.maxHp,def:P.def,ifr:P.ifr,flash:P.flash,alive:P.alive,zapTimer:P.zapTimer};
  P.x=target.x;P.y=target.y;P.hp=target.hp;P.maxHp=target.maxHp||120;P.def=target.def||0;P.ifr=0;P.flash=0;P.alive=true;
  const before=P.hp;let out;
  try{out=fn();}finally{
    const dmg=Math.max(0,before-P.hp);
    Object.assign(P,save);
    if(dmg>0&&room)room.send('damage',{target:target.id,amount:dmg,source:'enemy'});
  }
  return out;
}
updE=function(e,all,dt){
  if(coopStarted&&!isHost)return;
  if(!coopStarted)return orig.updE(e,all,dt);
  const t=targetFor(e.x,e.y);return withProxy(t,()=>orig.updE(e,all,dt));
};
updBoss=function(b,dt){
  if(coopStarted&&!isHost)return;
  if(!coopStarted)return orig.updBoss(b,dt);
  const t=targetFor(b.x,b.y);return withProxy(t,()=>orig.updBoss(b,dt));
};

function remoteProxy(p,fn){
  const save={x:P.x,y:P.y,atk:P.atk,def:P.def,hp:P.hp,maxHp:P.maxHp,mp:P.mp,maxMp:P.maxMp,eq:P.eq,sk:P.sk,ownedSkills:P.ownedSkills,skillSlots:P.skillSlots,berT:P.berT,ifr:P.ifr};
  P.x=p.x;P.y=p.y;P.atk=Math.max(1,Number(p.atk)||10);P.def=Number(p.def)||0;P.hp=Math.max(1,Number(p.hp)||120);P.maxHp=Number(p.maxHp)||120;P.mp=99999;P.maxMp=99999;
  P.eq={weapon:p.weapon||null,armor:null,boots:null,ring:null};P.sk=makeSkillState();P.ownedSkills=SKNAMES.slice();P.skillSlots=DEFAULT_SKILL_SLOTS.slice();P.berT=0;P.ifr=0;
  suppressNet=true;try{return fn();}finally{suppressNet=false;Object.assign(P,save);}
}
function applyRemoteAction(m){
  const p=remotes.get(m.from);if(!p)return;
  if(m.type==='basic'){
    const tx=Number(m.tx)||p.x+100,ty=Number(m.ty)||p.y;
    const dmg=Math.max(1,Math.min(Number(m.dmg)||p.atk*1.15,Math.max(50,p.atk*8)));
    orig.spawnBul(p.x,p.y,tx,ty,dmg,m.col||'#ffc828',Number(m.sz)||5,Number(m.spd)||10,'player',!!m.pierce,null);
  }else if(m.type==='melee'){
    remoteProxy(p,()=>meleeAttackAngle(Number(m.ang)||0,Math.max(1,Number(m.dmg)||p.atk),m.col||'#ffc828',false,false));
  }else if(m.type==='skill'&&SKILL_DEF[m.name]){
    remoteProxy({...p,...(m.player||{})},()=>orig.useSkill.call(P,m.name));
  }
}

P.useSkill=function(name){
  if(coopStarted&&!isHost&&!suppressNet&&room&&SKILL_DEF[name])room.send('action',{type:'skill',name,player:packPlayer()});
  return orig.useSkill.call(P,name);
};
spawnBul=function(x,y,tx,ty,dmg,col,sz,spd,owner,pierce,skillName){
  if(coopStarted&&!isHost&&!suppressNet&&room&&owner==='player'&&!skillName)room.send('action',{type:'basic',tx,ty,dmg,col,sz,spd,pierce});
  return orig.spawnBul(x,y,tx,ty,dmg,col,sz,spd,owner,pierce,skillName);
};
manualMeleeAttackDir=function(ang){
  if(coopStarted&&!isHost&&!suppressNet&&room){const info=buildPlayerAttackPayload(true);room.send('action',{type:'melee',ang,dmg:info.dmg,col:info.col,player:packPlayer()});}
  return orig.manualMeleeAttackDir(ang);
};
handleKill=function(e,source){
  if(coopStarted&&!isHost){e.alive=false;return;}
  const fresh=!e._kh;
  const xp=fresh?Math.floor((e.xp||0)*(1+Math.floor(WAVE/3)*0.5)):0;
  const gold=fresh?(e.gold||0):0;
  const bossSkill=fresh&&e.is_boss?BOSS_SKILL_UNLOCKS[e.bossType]:null;
  const r=orig.handleKill(e,source);
  if(coopStarted&&isHost&&fresh&&room)room.send('reward',{xp,gold,bossSkill,bossDuplicateGold:bossSkill?120:0});
  return r;
};
spawnDrop=function(x,y,forceLeg){
  if(!coopStarted||!isHost)return orig.spawnDrop(x,y,forceLeg);
  const before=DROPS.length;orig.spawnDrop(x,y,forceLeg);
  const added=DROPS.slice(before);
  for(const d of added){
    const active=roster.filter(p=>p.id!==myId);
    const all=roster.length?roster:[{id:myId}];
    const target=all[(lootCursor++)%all.length];
    if(target&&target.id!==myId&&room){room.send('giveItem',{target:target.id,name:d.name});const i=DROPS.indexOf(d);if(i>=0)DROPS.splice(i,1);popup(x,y-18,'🎁 '+(target.name||'동료')+' 획득',RC[ITEMS[d.name]?.rarity]||'#fff');}
  }
};
showGO=function(){
  if(coopStarted){coopDown=true;P.alive=true;P.hp=1;popup(P.x,P.y-55,'전투불능 · 다음 웨이브에 부활','#ff6060');return;}
  return orig.showGO();
};

P.draw=function(){orig.draw.call(P);if(coopStarted)drawRemotePlayers();if(coopDown){ctx.save();ctx.globalAlpha=.35;ctx.fillStyle='#000';ctx.beginPath();ctx.arc(P.x,P.y,26,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;ctx.fillStyle='#ff6060';ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.fillText('DOWN',P.x,P.y-30);ctx.restore();}};
function drawRemotePlayers(){
  ctx.save();for(const [id,p] of remotes){if(!p||id===myId)continue;ctx.globalAlpha=p.alive===false?.35:1;ctx.fillStyle=p.color||'#fff';ctx.beginPath();ctx.arc(p.x,p.y,18,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.fill();ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.fillStyle=p.alive===false?'#ff6060':'#fff';ctx.fillText(`${p.name||'Player'} Lv.${p.level||1}`,p.x,p.y-28);ctx.fillStyle='#1a1830';ctx.fillRect(p.x-24,p.y+24,48,5);ctx.fillStyle='#3dc850';ctx.fillRect(p.x-24,p.y+24,48*Math.max(0,Math.min(1,(p.hp||0)/(p.maxHp||1))),5);}ctx.restore();
}

function snapshotWorld(){
  if(!coopStarted||!isHost||!room)return;
  const clone=v=>{try{return JSON.parse(JSON.stringify(v));}catch{return null;}};
  const teamKills=P.kills+[...remotes.values()].reduce((a,p)=>a+(Number(p.kills)||0),0);
  room.send('world',{wave:WAVE,between:BETWEEN,bttimer:BTTIMER,queue:clone(QUEUE)||[],spawnt:SPAWNT,enemies:clone(ENEMIES)||[],boss:clone(BOSS),buls:clone(BULS)||[],exps:clone(EXPS)||[],mines:clone(MINES)||[],totems:clone(TOTEMS)||[],teamKills,partySize:startParty});
}
function applyWorld(w){
  if(!w)return;
  WAVE=Number(w.wave)||0;BETWEEN=!!w.between;BTTIMER=Number(w.bttimer)||0;QUEUE=Array.isArray(w.queue)?w.queue:[];SPAWNT=Number(w.spawnt)||0;
  ENEMIES=Array.isArray(w.enemies)?w.enemies:[];BOSS=w.boss||null;BULS=Array.isArray(w.buls)?w.buls:[];EXPS=Array.isArray(w.exps)?w.exps:[];MINES=Array.isArray(w.mines)?w.mines:[];TOTEMS=Array.isArray(w.totems)?w.totems:[];
  if(coopDown&&BETWEEN){coopDown=false;P.hp=Math.max(1,Math.floor(P.maxHp*.5));P.mp=Math.max(P.mp,Math.floor(P.maxMp*.5));popup(P.x,P.y-45,'부활!','#4af0b0');}
}
function applyDamage(v){if(!coopStarted||v<=0||coopDown)return;P.hp=Math.max(0,P.hp-v);P.flash=10;popup(P.x,P.y-30,'-'+Math.round(v),'#ff4040');if(P.hp<=0){coopDown=true;P.hp=1;}}
function applyReward(m){if(!coopStarted)return;if(m.xp)P.gainXp(Number(m.xp)||0);if(m.gold)P.gold+=Number(m.gold)||0;if(m.bossSkill&&SKILL_DEF[m.bossSkill]){if(!hasSkill(m.bossSkill))unlockSkill(m.bossSkill,SKILL_DEF[m.bossSkill].color);else P.gold+=Number(m.bossDuplicateGold)||0;}}
function giveItem(name){if(!ITEMS[name])return;if(P.inv.length>=20){P.gold+=25;popup(P.x,P.y-40,'가방 가득 · 25G 변환','#ffc828');return;}P.inv.push(makeItemInstance(name));popup(P.x,P.y-45,'아이템 획득: '+name,RC[ITEMS[name].rarity]||'#fff');}

function coopGameOver(m){if(GAMEOVER)return;GAMEOVER=true;OV_OPEN=true;LAST_SCORE=calcScore();document.getElementById('ov').classList.remove('h');document.getElementById('ovc').innerHTML=`<div style="text-align:center"><div style="font-size:38px;color:#f04040;font-weight:bold">TEAM GAME OVER</div><div style="color:#ffc828;font-size:22px;margin:10px">Wave ${Number(m.wave)||WAVE}</div><div style="color:#aaa">${esc((m.players||[]).join(' · '))}</div><div style="color:#4af0ff;margin:8px">팀 처치 ${Number(m.kills)||0} · 생존 ${Number(m.survivalSec)||0}초</div><div style="font-size:11px;color:${m.rankEligible?'#4af0b0':'#ff6060'}">${m.rankEligible?'협동 랭킹 등록 가능':'랭킹 제외: '+esc(m.rankReason||'조건 불충족')}</div><button class="ob" style="margin-top:14px" onclick="location.reload()">로비로 돌아가기</button></div>`;}

setInterval(()=>{if(!coopStarted||!room)return;if(coopDown&&BETWEEN){coopDown=false;P.hp=Math.max(1,Math.floor(P.maxHp*.5));P.mp=Math.max(P.mp,Math.floor(P.maxMp*.5));}room.send('playerState',packPlayer());if(isHost){snapshotWorld();const states=[{alive:!coopDown},...remotes.values()];if(states.length>=startParty&&states.every(p=>p.alive===false)&&!GAMEOVER){room.send('gameover',{wave:WAVE,kills:P.kills+[...remotes.values()].reduce((a,p)=>a+(p.kills||0),0)});orig.showGO();}}},150);

installLobby();
loadSdk().then(()=>{
  setStatus('멀티 서버 준비 완료','#4af0b0');
  document.getElementById('coopCreate').onclick=createRoom;
  document.getElementById('coopJoin').onclick=joinRoom;
  document.getElementById('coopStart').onclick=()=>{if(room&&isHost)room.send('start');};
}).catch(e=>setStatus('멀티 SDK 로드 실패: '+e.message,'#ff6060'));
})();