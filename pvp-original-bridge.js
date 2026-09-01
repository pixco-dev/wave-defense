(()=>{
'use strict';
const SERVER='wss://pixco-wave-defense-coop.onrender.com';
let client=null,room=null,myId='',hostId='',started=false,live=false,round=0,opponent=null,roster=[],lastSnap=0,lastMove=0,lastBasic=0,fx=[];
const orig={waveTick,startWave,showGO,useSkill:P.useSkill,draw:P.draw};
const DEFAULT=['화염구','번개 폭발','치유의 빛','분신술'];
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function loadSdk(){return new Promise((resolve,reject)=>{if(window.Colyseus)return resolve();const s=document.createElement('script');s.src='https://unpkg.com/@colyseus/sdk@0.17.0/dist/colyseus.js';s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});}
function status(t,c='#aaa'){const e=$('pvpStatus');if(e){e.textContent=t;e.style.color=c;}}
function installLobby(){
  const ss=$('ss');if(!ss)return;
  ss.style.display='flex';
  ss.innerHTML=`<div style="text-align:center;width:min(760px,94vw);padding:24px">
    <div style="font-size:52px;font-weight:bold;color:#ffc828;text-shadow:0 0 40px #ffc82888;margin-bottom:6px;letter-spacing:4px">WAVE</div>
    <div style="font-size:34px;font-weight:bold;color:#4af0b0;text-shadow:0 0 20px #4af0b088;margin-bottom:18px;letter-spacing:6px">DEFENSE RPG</div>
    <div style="font-size:20px;font-weight:bold;color:#ff7070;margin-bottom:16px">⚔ 1 vs 1 PVP</div>
    <div style="background:rgba(255,255,255,.05);border:1px solid #2a2840;border-radius:12px;padding:14px;margin:0 auto 16px;max-width:650px;color:#aaa;font-size:12px;line-height:1.8">
      원본 맵·원본 캐릭터·Q/W/E/R 스킬을 사용합니다.<br>Lv.1 · 기본 능력치 · 기본 4스킬 · 빈 장비로 동일 시작 / 서버가 HP·MP·이동·피격·쿨타임 판정 / 3판 2선승
    </div>
    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:10px">
      <input id="pvpName" maxlength="12" value="Player" placeholder="닉네임" style="width:130px;background:#12101e;border:1px solid #555;border-radius:8px;color:#fff;padding:10px;font-family:inherit">
      <button id="pvpCreate" style="background:linear-gradient(135deg,#7a2020,#321010);border:2px solid #ff7070;border-radius:10px;padding:10px 20px;color:#ffaaaa;font-weight:bold;font-family:inherit;cursor:pointer">PVP 방 만들기</button>
    </div>
    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:10px">
      <input id="pvpCode" placeholder="방 코드" style="width:245px;background:#12101e;border:1px solid #555;border-radius:8px;color:#fff;padding:10px;font-family:inherit">
      <button id="pvpJoin" style="background:#1a1830;border:1px solid #ffc828;border-radius:10px;padding:10px 18px;color:#ffc828;font-weight:bold;font-family:inherit;cursor:pointer">코드로 참가</button>
    </div>
    <div id="pvpRoom" style="display:none;background:#12101e;border:1px solid #333;border-radius:12px;padding:12px;margin:12px auto;max-width:620px">
      <div id="pvpRoomId" style="font-size:12px;color:#ffc828;margin-bottom:8px"></div>
      <div id="pvpRoster" style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:10px"></div>
      <button id="pvpStart" style="display:none;background:linear-gradient(135deg,#ff7070,#a02020);border:0;border-radius:10px;padding:11px 28px;color:#180000;font-weight:bold;font-family:inherit;cursor:pointer">PVP 시작</button>
    </div>
    <div id="pvpStatus" style="font-size:12px;color:#aaa">서버 연결 준비 중...</div>
    <button onclick="location.href='./'" style="margin-top:14px;background:transparent;border:1px solid #444;border-radius:8px;padding:7px 14px;color:#888;font-family:inherit;cursor:pointer">← 모드 선택으로</button>
  </div>`;
  $('pvpCreate').onclick=createRoom;$('pvpJoin').onclick=joinRoom;
}
async function createRoom(){try{status('서버 연결 중...');await loadSdk();client=new Colyseus.Client(SERVER);room=await client.create('wave_pvp',{name:$('pvpName').value});bind();}catch(e){status('방 생성 실패: '+e.message,'#ff6060')}}
async function joinRoom(){try{const code=$('pvpCode').value.trim();if(!code)return status('방 코드를 입력해줘.','#ff6060');status('방 참가 중...');await loadSdk();client=new Colyseus.Client(SERVER);room=await client.joinById(code,{name:$('pvpName').value});bind();}catch(e){status('방 참가 실패: '+e.message,'#ff6060')}}
function bind(){
  myId=room.sessionId;$('pvpRoom').style.display='block';$('pvpRoomId').textContent='방 코드: '+room.roomId;
  room.onMessage('hello',m=>{hostId=m.hostId;renderRoster()});
  room.onMessage('roster',m=>{hostId=m.hostId;roster=m.players||[];renderRoster()});
  room.onMessage('roundStart',m=>beginRound(m));
  room.onMessage('fight',m=>{live=true;round=m.round;centerText('FIGHT!','#ff7070',850)});
  room.onMessage('snapshot',m=>applySnapshot(m));
  room.onMessage('fx',m=>fx.push({...m,t:performance.now()}));
  room.onMessage('hit',m=>{if(m.target===myId)popup(P.x,P.y-30,'-'+Math.round(m.amount),'#ff4040')});
  room.onMessage('roundEnd',m=>endRound(m));
  room.onMessage('matchEnd',m=>endMatch(m));
  room.onLeave(()=>status('서버 연결 종료','#ff6060'));
  status('접속 성공','#4af0b0');
}
function renderRoster(){
  const b=$('pvpStart'),box=$('pvpRoster');if(box)box.innerHTML=(roster||[]).map(p=>`<div style="border:1px solid ${p.color};border-radius:8px;padding:7px 12px;color:${p.color}">${esc(p.name)}${p.id===hostId?' 👑':''}</div>`).join('');
  if(b){b.style.display=myId===hostId?'inline-block':'none';b.onclick=()=>room?.send('start');}
  status(roster.length<2?'상대를 기다리는 중...':'2명 접속 완료 · 방장이 시작할 수 있음',roster.length<2?'#aaa':'#4af0b0');
}
function beginRound(m){
  if(!started){
    started=true;resetGameState();HELL_MODE=false;GAME_STARTED=true;GAMEOVER=false;OV_OPEN=false;
    $('ss').style.display='none';ENEMIES=[];BOSS=null;QUEUE=[];BETWEEN=true;BTTIMER=999999;
    installPvpPatches();installScoreHud();
  }
  live=false;round=m.round||round+1;applyPlayers(m.players||[]);centerText(`ROUND ${round}`,'#ffc828',1300);
}
function installPvpPatches(){
  waveTick=function(){};startWave=function(){};showGO=function(){};
  P.useSkill=function(name){if(started&&live&&DEFAULT.includes(name)){room?.send('attack',{type:'skill',name,angle:aimAngle()});fx.push({from:myId,name,kind:'skill',x:P.x,y:P.y,angle:aimAngle(),color:SKILL_DEF[name]?.color||'#fff',t:performance.now()});return;}return orig.useSkill.call(P,name)};
  const oldPointer=canvas.onpointerdown;
  canvas.addEventListener('pointerdown',e=>{if(!started||!live)return;const wd=P.eq.weapon?iData(P.eq.weapon):null;if(wd?.melee)room?.send('attack',{type:'melee',angle:aimAngleFromClient(e.clientX,e.clientY)});},{capture:true});
  orig.draw=P.draw;P.draw=function(){orig.draw.call(P);drawOpponentAndFx();};
}
function installScoreHud(){
  const d=document.createElement('div');d.id='pvpScoreHud';d.style.cssText='position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:45;background:#12101edd;border:1px solid #555;border-radius:10px;padding:7px 16px;color:#fff;font:bold 13px Malgun Gothic;pointer-events:none';d.textContent='PVP';document.body.appendChild(d);
}
function aimAngle(){if(opponent)return Math.atan2(opponent.y-P.y,opponent.x-P.x);return 0}
function aimAngleFromClient(x,y){const r=canvas.getBoundingClientRect();const tx=(x-r.left)*CW/r.width,ty=(y-r.top)*CH/r.height;return Math.atan2(ty-P.y,tx-P.x)}
function applySnapshot(m){lastSnap=performance.now();round=m.round||round;live=!!m.live;applyPlayers(m.players||[])}
function applyPlayers(arr){
  const me=arr.find(p=>p.id===myId),op=arr.find(p=>p.id!==myId);if(me){P.x=me.x;P.y=me.y;P.hp=me.hp;P.maxHp=me.maxHp;P.mp=me.mp;P.maxMp=me.maxMp;P.alive=me.alive!==false;}opponent=op||null;
  const hud=$('pvpScoreHud');if(hud){const ms=me?.score||0,os=op?.score||0;hud.innerHTML=`<span style="color:${me?.color||'#4af0ff'}">${esc(me?.name||'나')} ${ms}</span> &nbsp; : &nbsp; <span style="color:${op?.color||'#ff7070'}">${os} ${esc(op?.name||'상대')}</span> · R${round}`;}
}
function endRound(m){live=false;const win=m.winnerId===myId;centerText(win?'ROUND WIN':'ROUND LOSE',win?'#4af0b0':'#ff6060',1700)}
function endMatch(m){live=false;const win=m.winnerId===myId;const ss=$('ss');ss.style.display='flex';ss.innerHTML=`<div style="text-align:center;background:#12101e;border:2px solid ${win?'#4af0b0':'#ff6060'};border-radius:16px;padding:28px;width:min(480px,90vw)"><div style="font-size:36px;font-weight:bold;color:${win?'#4af0b0':'#ff6060'}">${win?'VICTORY':'DEFEAT'}</div><div style="color:#aaa;margin:10px">3판 2선승 PVP 종료</div><button onclick="location.reload()" style="background:#1a1830;border:1px solid #ffc828;border-radius:9px;padding:9px 18px;color:#ffc828;font-weight:bold;cursor:pointer">다시 하기</button><button onclick="location.href='./'" style="margin-left:7px;background:#1a1830;border:1px solid #555;border-radius:9px;padding:9px 18px;color:#aaa;font-weight:bold;cursor:pointer">모드 선택</button></div>`;}
function centerText(t,c,ms){const e=document.createElement('div');e.textContent=t;e.style.cssText=`position:fixed;left:50%;top:42%;transform:translate(-50%,-50%);z-index:90;color:${c};font:bold 44px Malgun Gothic;text-shadow:0 0 25px ${c};pointer-events:none`;document.body.appendChild(e);setTimeout(()=>e.remove(),ms)}
function drawOpponentAndFx(){
  if(opponent){ctx.save();ctx.fillStyle=opponent.color||'#ff7070';ctx.beginPath();ctx.arc(opponent.x,opponent.y,18,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#fff';ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.fillText(opponent.name||'상대',opponent.x,opponent.y-28);ctx.fillStyle='#1a1830';ctx.fillRect(opponent.x-28,opponent.y+25,56,6);ctx.fillStyle='#ff5050';ctx.fillRect(opponent.x-28,opponent.y+25,56*Math.max(0,opponent.hp/opponent.maxHp),6);ctx.restore();}
  const now=performance.now();fx=fx.filter(f=>now-f.t<650);for(const f of fx){const a=1-(now-f.t)/650;ctx.save();ctx.globalAlpha=a;ctx.strokeStyle=f.color||'#fff';ctx.lineWidth=4;if(f.kind==='circle'||['번개 폭발','충격파','얼음 파동','폭풍 베기','중력 붕괴'].includes(f.name)){ctx.beginPath();ctx.arc(f.x,f.y,Math.min(f.range||180,40+(1-a)*(f.range||180)),0,Math.PI*2);ctx.stroke();}else{const ang=f.angle||0,len=f.range||220;ctx.beginPath();ctx.moveTo(f.x,f.y);ctx.lineTo(f.x+Math.cos(ang)*len,f.y+Math.sin(ang)*len);ctx.stroke();}ctx.restore();}
}
setInterval(()=>{
  if(!started||!room)return;
  const now=performance.now();if(now-lastMove>45){lastMove=now;room.send('move',{x:P.x,y:P.y,angle:aimAngle()});}
  const wd=P.eq.weapon?iData(P.eq.weapon):null;if(live&&!wd?.melee&&opponent&&now-lastBasic>340){lastBasic=now;room.send('attack',{type:'basic',angle:aimAngle()});}
},30);
installLobby();loadSdk().then(()=>status('서버 준비 완료','#4af0b0')).catch(()=>status('Colyseus SDK 로드 실패','#ff6060'));
})();