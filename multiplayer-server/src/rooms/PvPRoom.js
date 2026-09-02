import { Room } from 'colyseus';

const W=860,H=860,R=17,MAX_SPEED=390,MAX_HP=240;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const clean=s=>String(s||'Player').replace(/[<>]/g,'').trim().slice(0,12)||'Player';
const COLORS=['#4af0ff','#ff7070'];
const norm=a=>Math.atan2(Math.sin(Number(a)||0),Math.cos(Number(a)||0));
const diff=(a,b)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
const ALL=['화염구','번개 폭발','치유의 빛','분신술','충격파','관통 사격','마력 지뢰','순간회피','얼음 파동','십자 포격','회전 방패','번개 토템','폭풍 베기','파쇄탄','중력 붕괴','그림자 돌진','피의 참격'];
const DEF=['화염구','번개 폭발','치유의 빛','분신술'];
const S={
 '화염구':{mp:20,cd:1500,type:'projectile',dmg:20,speed:840,life:1.1},
 '번개 폭발':{mp:32,cd:1900,type:'circle',range:260,dmg:23},'치유의 빛':{mp:40,cd:5000,type:'heal',heal:28},'분신술':{mp:28,cd:3000,type:'haste',ms:4200},
 '충격파':{mp:28,cd:4500,type:'circle',range:175,dmg:30},'관통 사격':{mp:24,cd:3000,type:'line',range:500,width:38,dmg:32},'마력 지뢰':{mp:24,cd:3800,type:'mine',range:145,dmg:38},
 '순간회피':{mp:14,cd:3800,type:'dash',distance:175,invuln:350},'얼음 파동':{mp:30,cd:5000,type:'slowCircle',range:225,dmg:25,slow:2200},'십자 포격':{mp:28,cd:4800,type:'cross',range:450,width:38,dmg:28},
 '회전 방패':{mp:32,cd:5800,type:'shield',ms:3200},'번개 토템':{mp:34,cd:7400,type:'totem',range:300,hits:5,dmg:9},'폭풍 베기':{mp:44,cd:7600,type:'circle',range:205,dmg:44},
 '파쇄탄':{mp:38,cd:6400,type:'line',range:500,width:48,dmg:43},'중력 붕괴':{mp:52,cd:9000,type:'circle',range:285,dmg:48},'그림자 돌진':{mp:34,cd:6200,type:'dashLine',range:330,width:64,dmg:38,distance:230},
 '피의 참격':{mp:48,cd:9000,type:'lineHeal',range:310,width:120,dmg:42,heal:16}
};

export class PvPRoom extends Room{
 maxClients=2; players=new Map(); hostId=''; started=false; round=0; live=false; ended=false; countdownUntil=0; projectiles=[]; snapAcc=0;
 onCreate(){
  this.maxClients=2;this.setSimulationInterval(dt=>this.tick(Math.min(dt,50)/1000),33);
  this.onMessage('loadout',(c,m)=>this.loadout(c,m));
  this.onMessage('move',(c,m)=>this.move(c,m));
  this.onMessage('attack',(c,m)=>this.attack(c,m));
  this.onMessage('start',c=>this.start(c));
 }
 onJoin(c,o){
  const idx=this.players.size,p={id:c.sessionId,name:clean(o?.name),color:COLORS[idx],x:idx?670:190,y:430,angle:idx?Math.PI:0,hp:MAX_HP,maxHp:MAX_HP,mp:80,maxMp:80,score:0,alive:true,connected:true,loadout:DEF.slice(),cd:{},lastMoveAt:Date.now(),shieldUntil:0,invulnUntil:0,slowUntil:0,hasteUntil:0};
  this.players.set(c.sessionId,p);if(!this.hostId)this.hostId=c.sessionId;
  c.send('hello',{id:c.sessionId,roomId:this.roomId,hostId:this.hostId,maxHp:MAX_HP,players:this.publicPlayers()});this.roster();
 }
 async onLeave(c,consented){
  const p=this.players.get(c.sessionId);if(!p)return;p.connected=false;
  if(this.started&&!this.ended&&!consented){try{await this.allowReconnection(c,60);p.connected=true;p.lastMoveAt=Date.now();this.roster();return}catch(_){}}
  this.players.delete(c.sessionId);
  if(c.sessionId===this.hostId){this.hostId=[...this.players.keys()][0]||'';this.broadcast('hostChanged',{hostId:this.hostId})}
  if(this.started&&!this.ended){const other=[...this.players.values()][0];if(other)this.finish(other.id,'상대 퇴장')}
  this.roster();
 }
 loadout(c,m){if(this.started)return;const p=this.players.get(c.sessionId);if(!p)return;const a=[];for(const n of Array.isArray(m?.skills)?m.skills:[]){if(ALL.includes(n)&&!a.includes(n))a.push(n);if(a.length===4)break}if(a.length===4)p.loadout=a;this.roster();}
 start(c){if(this.started||c.sessionId!==this.hostId||this.players.size!==2)return;this.started=true;this.ended=false;this.lock();for(const p of this.players.values())p.score=0;this.startRound();}
 startRound(){this.round++;this.live=false;this.projectiles=[];let i=0;for(const p of this.players.values()){p.x=i?670:190;p.y=430;p.angle=i?Math.PI:0;p.hp=MAX_HP;p.mp=80;p.alive=true;p.cd={};p.shieldUntil=p.invulnUntil=p.slowUntil=p.hasteUntil=0;i++}this.countdownUntil=Date.now()+2200;this.broadcast('roundStart',{round:this.round,players:this.publicPlayers(),countdown:2.2});}
 tick(dt){const now=Date.now();if(this.started&&!this.ended&&!this.live&&this.players.size===2&&now>=this.countdownUntil){this.live=true;this.broadcast('fight',{round:this.round})}if(this.started&&!this.ended){for(const p of this.players.values())p.mp=clamp(p.mp+9*dt,0,p.maxMp);this.tickProjectiles(dt);this.snapAcc+=dt;if(this.snapAcc>=.05){this.snapAcc=0;this.broadcast('snapshot',{round:this.round,live:this.live,players:this.publicPlayers(),projectiles:this.projectiles.map(p=>({id:p.id,x:p.x,y:p.y,from:p.from,to:p.to})),serverTime:Date.now()})}}}
 move(c,m){const p=this.players.get(c.sessionId);if(!p||!this.started||!p.alive||!this.live)return;const now=Date.now(),elapsed=clamp((now-p.lastMoveAt)/1000,.012,.25);p.lastMoveAt=now;const tx=clamp(Number(m?.x)||p.x,R,W-R),ty=clamp(Number(m?.y)||p.y,R,H-R),dx=tx-p.x,dy=ty-p.y,d=Math.hypot(dx,dy);let sp=MAX_SPEED;if(now<p.slowUntil)sp*=.62;if(now<p.hasteUntil)sp*=1.28;const max=sp*elapsed+12;if(d>max&&d){p.x+=dx/d*max;p.y+=dy/d*max}else{p.x=tx;p.y=ty}p.angle=norm(m?.angle)}
 other(id){for(const p of this.players.values())if(p.id!==id)return p;return null}
 can(p,key,mp,cd){const n=Date.now();if(!this.live||!p.alive||p.mp<mp||n<(p.cd[key]||0))return false;p.mp-=mp;p.cd[key]=n+cd;return true}
 line(a,b,range,width,ang){const dx=b.x-a.x,dy=b.y-a.y,f=Math.cos(ang)*dx+Math.sin(ang)*dy,s=Math.abs(-Math.sin(ang)*dx+Math.cos(ang)*dy);return f>=0&&f<=range&&s<=width}
 circle(a,b,r){return Math.hypot(b.x-a.x,b.y-a.y)<=r}
 hurt(t,amount,from){const n=Date.now();if(!t?.alive||n<t.invulnUntil)return false;let dmg=Math.max(0,amount);if(n<t.shieldUntil)dmg*=.5;t.hp=clamp(t.hp-dmg,0,t.maxHp);this.broadcast('hit',{target:t.id,source:from,amount:dmg,hp:t.hp});if(t.hp<=0){t.alive=false;this.roundWon(from)}return dmg>0}
 attack(c,m){const p=this.players.get(c.sessionId),q=this.other(c.sessionId);if(!p||!q||!this.live||!p.alive)return;const type=String(m?.type||''),tx=Number(m?.targetX),ty=Number(m?.targetY),ang=Number.isFinite(tx)&&Number.isFinite(ty)?Math.atan2(ty-p.y,tx-p.x):norm(m?.angle);p.angle=ang;
  if(type==='basic'){if(!this.can(p,'basic',0,330))return;const h=this.line(p,q,410,34,ang);if(h)this.hurt(q,13,p.id);return this.broadcast('fx',{from:p.id,type:'basic',x:p.x,y:p.y,targetX:tx,targetY:ty,angle:ang},{except:c})}
  if(type==='melee'){if(!this.can(p,'melee',0,520))return;const d=Math.hypot(q.x-p.x,q.y-p.y),a=Math.atan2(q.y-p.y,q.x-p.x),h=d<=115&&diff(a,ang)<=.78;if(h)this.hurt(q,19,p.id);return this.broadcast('fx',{from:p.id,type:'melee',x:p.x,y:p.y,angle:ang},{except:c})}
  if(type!=='skill')return;const name=String(m?.name||''),s=S[name];if(!s||!p.loadout.includes(name)||!this.can(p,name,s.mp,s.cd))return;this.broadcast('fx',{from:p.id,type:'skill',name,x:p.x,y:p.y,targetX:tx,targetY:ty,angle:ang},{except:c});
  if(s.type==='projectile'){const gx=Number.isFinite(tx)?tx:q.x,gy=Number.isFinite(ty)?ty:q.y,d=Math.hypot(gx-p.x,gy-p.y)||1;this.projectiles.push({id:`${Date.now()}_${Math.random()}`,from:p.id,to:q.id,x:p.x,y:p.y,vx:(gx-p.x)/d*s.speed,vy:(gy-p.y)/d*s.speed,life:s.life,dmg:s.dmg});return}
  if(s.type==='line'||s.type==='lineHeal'){if(this.line(p,q,s.range,s.width,ang)){this.hurt(q,s.dmg,p.id);if(s.type==='lineHeal')p.hp=clamp(p.hp+s.heal,0,p.maxHp)}}
  else if(s.type==='circle'||s.type==='slowCircle'){if(this.circle(p,q,s.range)){this.hurt(q,s.dmg,p.id);if(s.type==='slowCircle')q.slowUntil=Date.now()+s.slow}}
  else if(s.type==='heal')p.hp=clamp(p.hp+s.heal,0,p.maxHp);else if(s.type==='haste')p.hasteUntil=Date.now()+s.ms;else if(s.type==='shield')p.shieldUntil=Date.now()+s.ms;
  else if(s.type==='dash'){p.invulnUntil=Date.now()+s.invuln;p.x=clamp(p.x+Math.cos(ang)*s.distance,R,W-R);p.y=clamp(p.y+Math.sin(ang)*s.distance,R,H-R)}
  else if(s.type==='dashLine'){if(this.line(p,q,s.range,s.width,ang))this.hurt(q,s.dmg,p.id);p.x=clamp(p.x+Math.cos(ang)*s.distance,R,W-R);p.y=clamp(p.y+Math.sin(ang)*s.distance,R,H-R)}
  else if(s.type==='cross'){if([0,Math.PI/2,Math.PI,Math.PI*1.5].some(a=>this.line(p,q,s.range,s.width,a)))this.hurt(q,s.dmg,p.id)}
  else if(s.type==='mine'){const x=p.x,y=p.y,r=this.round;setTimeout(()=>{if(this.live&&this.round===r&&q.alive&&this.circle({x,y},q,s.range))this.hurt(q,s.dmg,p.id)},700)}
  else if(s.type==='totem'){const r=this.round;for(let i=1;i<=s.hits;i++)setTimeout(()=>{if(this.live&&this.round===r&&p.alive&&q.alive&&this.circle(p,q,s.range))this.hurt(q,s.dmg,p.id)},i*550)}
 }
 tickProjectiles(dt){for(const b of this.projectiles){b.life-=dt;b.x+=b.vx*dt;b.y+=b.vy*dt;const t=this.players.get(b.to);if(t?.alive&&Math.hypot(t.x-b.x,t.y-b.y)<=30){b.life=0;this.hurt(t,b.dmg,b.from)}}this.projectiles=this.projectiles.filter(b=>b.life>0&&b.x>-40&&b.x<W+40&&b.y>-40&&b.y<H+40)}
 roundWon(id){if(!this.live||this.ended)return;this.live=false;const w=this.players.get(id);if(!w)return;w.score++;this.broadcast('roundEnd',{winnerId:id,round:this.round,score:this.score()});if(w.score>=2)setTimeout(()=>this.finish(id,'2선승'),1500);else setTimeout(()=>{if(!this.ended&&this.players.size===2)this.startRound()},2200)}
 finish(id,reason){if(this.ended)return;this.ended=true;this.live=false;this.broadcast('matchEnd',{winnerId:id,reason,score:this.score(),players:this.publicPlayers()})}
 score(){const o={};for(const p of this.players.values())o[p.id]=p.score;return o}
 publicPlayers(){return[...this.players.values()].map(p=>({id:p.id,name:p.name,color:p.color,x:p.x,y:p.y,angle:p.angle,hp:p.hp,maxHp:p.maxHp,mp:p.mp,maxMp:p.maxMp,score:p.score,alive:p.alive,connected:p.connected,loadout:p.loadout}))}
 roster(){this.broadcast('roster',{hostId:this.hostId,started:this.started,players:this.publicPlayers()})}
}
