import { Room } from 'colyseus';

const W=860,H=860;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const cleanName=s=>String(s||'Player').replace(/[<>]/g,'').trim().slice(0,12)||'Player';
const COLORS=['#4af0ff','#ffc828','#ff70c8','#70ff80'];
const DIFF={1:[1,1,1],2:[1.45,1.15,1.70],3:[1.90,1.30,2.40],4:[2.35,1.50,3.10]};
const TYPES={
 normal:{col:'#e03030',r:14,spd:72,hp:25,atk:6,xp:10,gold:3},
 fast:{col:'#ff8c00',r:10,spd:180,hp:15,atk:5,xp:12,gold:4},
 bomber:{col:'#ff4090',r:16,spd:54,hp:30,atk:8,xp:15,gold:6},
 ranged:{col:'#8060ff',r:12,spd:48,hp:20,atk:8,xp:14,gold:5},
 shield:{col:'#a0c0ff',r:16,spd:42,hp:50,atk:8,xp:18,gold:7},
 healer:{col:'#40ff80',r:12,spd:36,hp:18,atk:4,xp:25,gold:10},
 charger:{col:'#ff6000',r:15,spd:90,hp:40,atk:15,xp:22,gold:9},
 splitter:{col:'#c080ff',r:16,spd:54,hp:35,atk:7,xp:18,gold:7},
 sniper:{col:'#00e0ff',r:11,spd:18,hp:15,atk:25,xp:28,gold:12},
 electric:{col:'#ffe000',r:13,spd:60,hp:20,atk:10,xp:22,gold:10},
 poison:{col:'#66cc33',r:13,spd:45,hp:26,atk:7,xp:24,gold:11},
 summoner:{col:'#ff50c8',r:14,spd:33,hp:34,atk:6,xp:34,gold:16}
};
const BOSS_CFG=[
 {col:'#c030c0',hp:2600,atk:50,spd:84,r:32,label:'마법사',shape:'circle'},
 {col:'#e05020',hp:4200,atk:70,spd:78,r:36,label:'전사',shape:'rect'},
 {col:'#20c0a0',hp:2000,atk:55,spd:150,r:26,label:'암살자',shape:'tri'},
 {col:'#cc2020',hp:3000,atk:45,spd:96,r:30,label:'흡혈귀',shape:'circle'},
 {col:'#4080ff',hp:5000,atk:35,spd:48,r:38,label:'방패 보스',shape:'rect'}
];

function enemyHpScale(w){const base=1+(w-1)*.18,tier=[1,2.7,5.8,10.5][Math.min(3,Math.floor((w-1)/3))],late=w<=15?1:Math.pow(1.045,w-15);return base*tier*late;}
function enemyAtkScale(w){const base=1+(w-1)*.18,late=w<=12?1:Math.pow(1.035,w-12);return base*late;}
function bossHpScale(w){const base=1+(w-1)*.38,step=Math.max(0,Math.floor(w/5)-1),early=Math.pow(1.18,Math.min(step,3)),late=Math.pow(1.45,Math.max(0,step-3));return base*early*late;}
function bossAtkScale(w){const base=1+(w-1)*.30,step=Math.max(0,Math.floor(w/5)-1),early=Math.pow(1.10,Math.min(step,3)),late=Math.pow(1.25,Math.max(0,step-3));return base*early*late;}
function weightedPick(map){const a=Object.entries(map).filter(([,v])=>v>0);let r=Math.random()*a.reduce((s,[,v])=>s+v,0);for(const [k,v] of a){r-=v;if(r<=0)return k}return a.at(-1)?.[0]||'normal';}
function rndType(w){if(w<2)return'normal';const fc=w>=15?Math.min(.20,(w-15)*.025+.05):0,bc=Math.min(.15,w*.02),rc=Math.min(.20,w*.025),sc=w>=6?Math.min(.10,(w-6)*.02):0,hc=w>=8?Math.min(.08,(w-8)*.015):0,cc=w>=10?Math.min(.08,(w-10)*.015):0,sp=w>=12?Math.min(.07,(w-12)*.012):0,sn=w>=15?Math.min(.07,(w-15)*.012):0,el=w>=10?Math.min(.08,(w-10)*.015):0,po=w>=9?Math.min(.06,(w-9)*.01+.02):0,su=w>=13?Math.min(.045,(w-13)*.008+.015):0;return weightedPick({fast:fc,bomber:bc,ranged:rc,shield:sc,healer:hc,charger:cc,splitter:sp,sniper:sn,electric:el,poison:po,summoner:su,normal:1});}

export class CoopRoom extends Room{
 maxClients=4; hostId=''; started=false; initialParty=0; players=new Map(); world=null; tickAcc=0; snapAcc=0; runId=''; runStartedAt=0; rankEligible=true; rankReason=''; nextEntity=1;
 onCreate(options){
  this.maxClients=clamp(Number(options?.partySize||4),2,4);
  this.setSimulationInterval(dt=>this.tick(Math.min(50,dt)/1000),33);
  this.onMessage('playerState',(c,d)=>this.playerState(c,d));
  this.onMessage('action',(c,d)=>this.action(c,d));
  this.onMessage('start',c=>this.start(c));
  this.onMessage('gameover',()=>{}); // legacy client message ignored: server owns gameover now.
  this.onMessage('world',()=>{});    // legacy host snapshots ignored.
 }
 onJoin(c,o){
  const idx=this.players.size,p={id:c.sessionId,name:cleanName(o?.name),color:COLORS[idx%COLORS.length],x:430+(idx-1.5)*42,y:430,hp:120,maxHp:120,mp:80,maxMp:80,level:1,atk:10,def:0,gold:0,kills:0,alive:true,angle:0,lastSeen:Date.now(),connected:true};
  this.players.set(c.sessionId,p);if(!this.hostId)this.hostId=c.sessionId;
  c.send('hello',{id:c.sessionId,hostId:this.hostId,roomId:this.roomId,maxClients:this.maxClients,started:this.started,players:[...this.players.values()]});
  if(this.started&&this.world){c.send('start',{hostId:this.hostId,partySize:this.initialParty,runId:this.runId,dedicated:true});c.send('world',this.snapshot())}
  this.roster();
 }
 async onLeave(c,consented){
  const p=this.players.get(c.sessionId);if(!p)return;
  if(this.started&&!consented){
   p.connected=false;p.lastSeen=Date.now();
   try{await this.allowReconnection(c,60);p.connected=true;p.lastSeen=Date.now();this.roster();return}catch(_){ }
  }
  this.players.delete(c.sessionId);
  if(this.started){this.rankEligible=false;this.rankReason='플레이 중 인원 변동 발생'}
  if(c.sessionId===this.hostId){const next=[...this.players.values()].find(x=>x.connected!==false);this.hostId=next?.id||'';this.broadcast('hostChanged',{hostId:this.hostId,dedicated:true});}
  this.roster();
 }
 playerState(c,d){const p=this.players.get(c.sessionId);if(!p)return;const now=Date.now(),dt=clamp((now-p.lastSeen)/1000,.016,.25);p.lastSeen=now;const tx=clamp(Number(d?.x)||p.x,18,W-18),ty=clamp(Number(d?.y)||p.y,18,H-18),dist=Math.hypot(tx-p.x,ty-p.y),max=420*dt+18;if(dist>max&&dist>0){p.x+=(tx-p.x)/dist*max;p.y+=(ty-p.y)/dist*max}else{p.x=tx;p.y=ty}p.angle=Number(d?.angle)||0;p.mp=clamp(Number(d?.mp)||p.mp,0,Math.max(80,p.maxMp));p.maxMp=clamp(Number(d?.maxMp)||p.maxMp,40,9999);p.level=clamp(Number(d?.level)||p.level,1,999);p.atk=clamp(Number(d?.atk)||p.atk,1,200000);p.def=clamp(Number(d?.def)||p.def,0,200000);p.connected=true;}
 start(c){if(this.started||c.sessionId!==this.hostId||this.clients.length<2)return;this.started=true;this.initialParty=this.clients.length;this.runStartedAt=Date.now();this.runId=`${this.roomId}_${this.runStartedAt}`;this.rankEligible=true;this.lock();this.world={wave:0,between:true,bttimer:300,queue:[],spawnt:0,enemies:[],boss:null,buls:[],exps:[],mines:[],totems:[],teamKills:0,partySize:this.initialParty,nextWaveIn:5};this.broadcast('start',{hostId:this.hostId,partySize:this.initialParty,runId:this.runId,dedicated:true});}
 action(c,d){if(!this.started||!this.world)return;const p=this.players.get(c.sessionId);if(!p||!p.alive)return;const type=String(d?.type||'');if(type==='basic')this.attackLine(p,Number(d?.tx),Number(d?.ty),Math.max(4,p.atk*1.15),24,500);else if(type==='melee')this.attackArc(p,Number(d?.ang)||0,Math.max(5,p.atk),120,.85);else if(type==='skill')this.skill(p,String(d?.name||''));this.broadcast('remoteFx',{from:p.id,...d},{except:c});}
 attackLine(p,tx,ty,dmg,width,range){if(!Number.isFinite(tx)||!Number.isFinite(ty))return;const a=Math.atan2(ty-p.y,tx-p.x);for(const e of this.entities()){if(!e.alive)continue;const dx=e.x-p.x,dy=e.y-p.y,f=Math.cos(a)*dx+Math.sin(a)*dy,s=Math.abs(-Math.sin(a)*dx+Math.cos(a)*dy);if(f>=0&&f<=range&&s<=width+e.r){this.hurtEntity(e,dmg,p);break}}}
 attackArc(p,a,dmg,range,half){for(const e of this.entities()){if(!e.alive)continue;const dx=e.x-p.x,dy=e.y-p.y,d=Math.hypot(dx,dy),da=Math.abs(Math.atan2(Math.sin(Math.atan2(dy,dx)-a),Math.cos(Math.atan2(dy,dx)-a)));if(d<=range+e.r&&da<=half)this.hurtEntity(e,dmg,p)}}
 skill(p,name){const near=this.nearestEntity(p.x,p.y);if(name==='화염구'&&near)this.hurtEntity(near,p.atk*2,p);else if(name==='번개 폭발'){for(const e of this.entities())if(Math.hypot(e.x-p.x,e.y-p.y)<180)this.hurtEntity(e,p.atk*2.2,p)}else if(name==='충격파'){for(const e of this.entities())if(Math.hypot(e.x-p.x,e.y-p.y)<160)this.hurtEntity(e,p.atk*2.5,p)}else if(name==='관통 사격'&&near)this.attackLine(p,near.x,near.y,p.atk*3,40,560);else if(name==='폭풍 베기'){for(const e of this.entities())if(Math.hypot(e.x-p.x,e.y-p.y)<210)this.hurtEntity(e,p.atk*3.4,p)}}
 entities(){return [...(this.world?.enemies||[]),...(this.world?.boss?.alive?[this.world.boss]:[])]}
 nearestEntity(x,y){let best=null,bd=Infinity;for(const e of this.entities()){if(!e.alive)continue;const d=(e.x-x)**2+(e.y-y)**2;if(d<bd){bd=d;best=e}}return best}
 hurtEntity(e,dmg,p){if(!e.alive)return;e.hp-=Math.max(1,dmg);if(e.hp<=0){e.hp=0;e.alive=false;p.kills++;p.gold+=e.gold||0;this.world.teamKills++;this.broadcast('reward',{target:p.id,xp:e.xp||0,gold:e.gold||0,boss:!!e.is_boss});if(e.type==='splitter'&&e.split!==false){for(const dx of[-16,16]){const s=this.makeEnemy('splitter',e.x+dx,e.y);s.r=8;s.maxHp=s.hp=Math.floor(e.maxHp*.4);s.xp=0;s.gold=0;s.split=false;this.world.enemies.push(s)}}}}
 tick(dt){if(!this.started||!this.world)return;this.tickAcc+=dt;this.snapAcc+=dt;if(this.world.between){this.world.nextWaveIn-=dt;this.world.bttimer=Math.max(0,Math.round(this.world.nextWaveIn*60));if(this.world.nextWaveIn<=0)this.beginWave()}else this.tickWave(dt);if(this.snapAcc>=.05){this.snapAcc=0;this.broadcast('world',this.snapshot())}}
 beginWave(){const w=++this.world.wave;this.world.between=false;this.world.nextWaveIn=0;this.world.enemies=[];this.world.boss=null;this.world.queue=[];this.world.spawnt=0;const boss=w%5===0;if(boss){this.world.boss=this.makeBoss(w);const n=w===5?4:Math.min(22,8+Math.floor(w/10)*3);for(let i=0;i<n;i++)this.world.queue.push(rndType(w))}else{const n=4+Math.floor(w*1.8)+Math.floor(w/3);for(let i=0;i<n;i++)this.world.queue.push(rndType(w))}const mul=DIFF[this.initialParty]?.[1]||1;while(this.world.queue.length<Math.round(this.world.queue.length*mul))this.world.queue.push(rndType(w))}
 tickWave(dt){this.world.spawnt-=dt;if(this.world.spawnt<=0&&this.world.queue.length){this.spawn(this.world.queue.shift());this.world.spawnt=Math.max(.25,(50-this.world.wave*2)/60)}for(const e of this.world.enemies)if(e.alive)this.tickEnemy(e,dt);if(this.world.boss?.alive)this.tickBoss(this.world.boss,dt);this.world.enemies=this.world.enemies.filter(e=>e.alive);if(!this.world.queue.length&&!this.world.enemies.length&&!this.world.boss?.alive){this.world.between=true;this.world.nextWaveIn=5;this.world.bttimer=300}}
 makeEnemy(type,x,y){const t=TYPES[type]||TYPES.normal,mul=DIFF[this.initialParty]?.[0]||1,hp=Math.floor(t.hp*enemyHpScale(this.world.wave)*mul);return{id:this.nextEntity++,x,y,type,r:t.r,col:t.col,maxHp:hp,hp,atk:Math.floor(t.atk*enemyAtkScale(this.world.wave)),spd:t.spd,xp:t.xp,gold:t.gold,alive:true,is_boss:false,atkT:0,shootT:1.2,healT:2,chargeT:3,zapT:1,split:type==='splitter',shieldOn:type==='shield',shieldHp:type==='shield'?hp:0,shieldMaxHp:type==='shield'?hp:0}}
 spawn(type){const s=Math.floor(Math.random()*4);let x,y;if(s===0){x=Math.random()*W;y=4}else if(s===1){x=W-4;y=Math.random()*H}else if(s===2){x=Math.random()*W;y=H-4}else{x=4;y=Math.random()*H}this.world.enemies.push(this.makeEnemy(type,x,y))}
 makeBoss(w){const idx=Math.floor(Math.random()*BOSS_CFG.length),c=BOSS_CFG[idx],mul=DIFF[this.initialParty]?.[2]||1,hp=Math.floor(c.hp*bossHpScale(w)*mul);return{id:this.nextEntity++,x:W/2,y:80,r:c.r,col:c.col,bossType:idx,bossLabel:c.label,bossShape:c.shape,maxHp:hp,hp,atk:Math.floor(c.atk*bossAtkScale(w)),spd:c.spd,alive:true,is_boss:true,xp:300,gold:50,atkT:0,shootT:1.3,phase:0}}
 nearestPlayer(x,y){let best=null,bd=Infinity;for(const p of this.players.values()){if(!p.alive||p.connected===false)continue;const d=(p.x-x)**2+(p.y-y)**2;if(d<bd){bd=d;best=p}}return best}
 tickEnemy(e,dt){const p=this.nearestPlayer(e.x,e.y);if(!p)return;const dx=p.x-e.x,dy=p.y-e.y,d=Math.hypot(dx,dy)||1;let dir=1;if(e.type==='ranged'||e.type==='sniper'||e.type==='summoner'){if(d<170)dir=-1;else if(d<220)dir=0}e.x=clamp(e.x+dx/d*e.spd*dir*dt,e.r,W-e.r);e.y=clamp(e.y+dy/d*e.spd*dir*dt,e.r,H-e.r);e.atkT-=dt;e.shootT-=dt;if((e.type==='ranged'||e.type==='sniper')&&e.shootT<=0&&d<380){this.damagePlayer(p,e.atk);e.shootT=e.type==='sniper'?2.8:1.5}else if(e.type==='bomber'&&d<55){this.damagePlayer(p,e.atk*2.5);e.alive=false}else if(d<e.r+18&&e.atkT<=0){this.damagePlayer(p,e.atk);e.atkT=1.05}if(e.type==='healer'){e.healT-=dt;if(e.healT<=0){for(const o of this.world.enemies)if(o.alive&&Math.hypot(o.x-e.x,o.y-e.y)<120)o.hp=Math.min(o.maxHp,o.hp+o.maxHp*.08);e.healT=2}}}
 tickBoss(b,dt){const p=this.nearestPlayer(b.x,b.y);if(!p)return;const dx=p.x-b.x,dy=p.y-b.y,d=Math.hypot(dx,dy)||1;b.x=clamp(b.x+dx/d*b.spd*dt,b.r,W-b.r);b.y=clamp(b.y+dy/d*b.spd*dt,b.r,H-b.r);b.atkT-=dt;b.shootT-=dt;if(d<b.r+20&&b.atkT<=0){this.damagePlayer(p,b.atk);b.atkT=.9}if((b.bossType===0||b.bossType===3)&&b.shootT<=0&&d<420){this.damagePlayer(p,b.atk*.55);b.shootT=1.25}}
 damagePlayer(p,raw){const dmg=Math.max(1,Math.round(raw-Math.min(raw*.75,p.def*.25)));p.hp=clamp(p.hp-dmg,0,p.maxHp);this.clientFor(p.id)?.send('damage',{amount:dmg,source:'server'});if(p.hp<=0){p.alive=false;this.checkGameOver()}}
 clientFor(id){return this.clients.find(c=>c.sessionId===id)}
 checkGameOver(){const alive=[...this.players.values()].some(p=>p.alive&&p.connected!==false);if(alive)return;const final={runId:this.runId,partySize:this.initialParty,wave:this.world.wave,kills:this.world.teamKills,survivalSec:Math.max(0,Math.floor((Date.now()-this.runStartedAt)/1000)),players:[...this.players.values()].map(p=>p.name),rankEligible:this.rankEligible,rankReason:this.rankReason};this.broadcast('gameover',final)}
 snapshot(){return{wave:this.world.wave,between:this.world.between,bttimer:this.world.bttimer,queue:this.world.queue,spawnt:this.world.spawnt,enemies:this.world.enemies,boss:this.world.boss,buls:[],exps:[],mines:[],totems:[],teamKills:this.world.teamKills,partySize:this.initialParty,dedicated:true,serverTime:Date.now()}}
 roster(){this.broadcast('roster',{hostId:this.hostId,started:this.started,dedicated:true,players:[...this.players.values()]})}
}
