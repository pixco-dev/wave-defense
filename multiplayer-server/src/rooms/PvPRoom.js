import { Room } from 'colyseus';

const W=860,H=860,R=17,MAX_SPEED=390;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const clean=s=>String(s||'Player').replace(/[<>]/g,'').trim().slice(0,12)||'Player';
const normAng=a=>Math.atan2(Math.sin(Number(a)||0),Math.cos(Number(a)||0));
const angleDiff=(a,b)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
const COLORS=['#4af0ff','#ff7070'];

const SKILLS={
  '화염구':      {mp:20,cd:1500,type:'line',range:460,width:32,dmg:20,color:'#ff8c00'},
  '번개 폭발':   {mp:32,cd:1900,type:'circle',range:260,dmg:23,color:'#ffc828'},
  '치유의 빛':   {mp:40,cd:5000,type:'heal',heal:28,color:'#3dc850'},
  '분신술':      {mp:28,cd:3000,type:'haste',ms:4200,color:'#b060ff'},
  '충격파':      {mp:28,cd:4500,type:'circle',range:175,dmg:30,color:'#4af0b0'},
  '관통 사격':   {mp:24,cd:3000,type:'line',range:500,width:38,dmg:32,color:'#4af0f0'},
  '마력 지뢰':   {mp:24,cd:3800,type:'mine',range:145,dmg:38,color:'#50c0ff'},
  '순간회피':    {mp:14,cd:3800,type:'dash',distance:175,invuln:350,color:'#ffffff'},
  '얼음 파동':   {mp:30,cd:5000,type:'slowCircle',range:225,dmg:25,slow:2200,color:'#8fd8ff'},
  '십자 포격':   {mp:28,cd:4800,type:'cross',range:450,width:38,dmg:28,color:'#ffcc66'},
  '회전 방패':   {mp:32,cd:5800,type:'shield',ms:3200,color:'#a0c0ff'},
  '번개 토템':   {mp:34,cd:7400,type:'totem',range:300,hits:5,dmg:9,color:'#ffe000'},
  '폭풍 베기':   {mp:44,cd:7600,type:'circle',range:205,dmg:44,color:'#ff80ff'},
  '파쇄탄':      {mp:38,cd:6400,type:'line',range:500,width:48,dmg:43,color:'#80a8ff'},
  '중력 붕괴':   {mp:52,cd:9000,type:'circle',range:285,dmg:48,color:'#c030ff'},
  '그림자 돌진': {mp:34,cd:6200,type:'dashLine',range:330,width:64,dmg:38,distance:230,color:'#20c0a0'},
  '피의 참격':   {mp:48,cd:9000,type:'lineHeal',range:310,width:120,dmg:42,heal:16,color:'#cc2020'}
};
const DEFAULT=['화염구','번개 폭발','치유의 빛','분신술'];

export class PvPRoom extends Room{
  maxClients=2;
  players=new Map();
  started=false;
  round=0;
  roundLive=false;
  matchEnded=false;
  countdownUntil=0;
  runId='';
  tickTimer=0;

  onCreate(){
    this.maxClients=2;
    this.setSimulationInterval(dt=>this.tick(dt),50);
    this.onMessage('move',(c,m)=>this.move(c,m));
    this.onMessage('loadout',(c,m)=>this.setLoadout(c,m));
    this.onMessage('start',(c)=>{if(c.sessionId===this.clients[0]?.sessionId)this.startMatch();});
    this.onMessage('attack',(c,m)=>this.attack(c,m));
  }

  onJoin(c,o){
    const idx=this.players.size;
    const p={
      id:c.sessionId,name:clean(o?.name),color:COLORS[idx]||'#fff',
      x:idx===0?190:670,y:430,angle:idx===0?0:Math.PI,
      hp:120,maxHp:120,mp:80,maxMp:80,score:0,alive:true,
      loadout:DEFAULT.slice(),cd:{},lastMoveAt:Date.now(),
      shieldUntil:0,invulnUntil:0,slowUntil:0,hasteUntil:0
    };
    this.players.set(c.sessionId,p);
    c.send('hello',{id:c.sessionId,roomId:this.roomId,hostId:this.clients[0]?.sessionId||c.sessionId});
    this.broadcastRoster();
  }

  onLeave(c){
    const wasPlaying=this.started&&!this.matchEnded;
    this.players.delete(c.sessionId);
    if(wasPlaying){
      const other=[...this.players.values()][0];
      if(other)this.finishMatch(other.id,'상대 퇴장');
    }
    this.broadcastRoster();
  }

  setLoadout(c,m){
    if(this.started)return;
    const raw=Array.isArray(m?.skills)?m.skills:[];
    const unique=[];
    for(const s of raw){if(SKILLS[s]&&!unique.includes(s))unique.push(s);if(unique.length===4)break;}
    while(unique.length<4){const s=DEFAULT[unique.length];if(!unique.includes(s))unique.push(s);else break;}
    const p=this.players.get(c.sessionId);if(p)p.loadout=unique.slice(0,4);
    this.broadcastRoster();
  }

  startMatch(){
    if(this.started||this.players.size!==2)return;
    this.started=true;this.matchEnded=false;this.runId=`${this.roomId}_${Date.now()}`;
    this.lock();
    for(const p of this.players.values())p.score=0;
    this.startRound();
  }

  startRound(){
    this.round++;
    this.roundLive=false;
    let i=0;
    for(const p of this.players.values()){
      p.x=i===0?190:670;p.y=430;p.angle=i===0?0:Math.PI;
      p.hp=p.maxHp;p.mp=p.maxMp;p.alive=true;p.cd={};
      p.shieldUntil=p.invulnUntil=p.slowUntil=p.hasteUntil=0;i++;
    }
    this.countdownUntil=Date.now()+3000;
    this.broadcast('roundStart',{round:this.round,countdown:3,players:this.publicPlayers()});
    this.snapshot();
  }

  tick(dt){
    const now=Date.now();
    if(this.started&&!this.matchEnded&&!this.roundLive&&this.players.size===2&&now>=this.countdownUntil){
      this.roundLive=true;this.broadcast('fight',{round:this.round});
    }
    if(this.started&&!this.matchEnded){
      for(const p of this.players.values())p.mp=clamp(p.mp+0.16,0,p.maxMp);
      this.tickTimer+=dt;if(this.tickTimer>=100){this.tickTimer=0;this.snapshot();}
    }
  }

  move(c,m){
    const p=this.players.get(c.sessionId);if(!p||!this.started||!p.alive)return;
    const now=Date.now(),elapsed=clamp((now-p.lastMoveAt)/1000,.02,.25);p.lastMoveAt=now;
    if(!this.roundLive)return;
    const tx=clamp(Number(m?.x)||p.x,R,W-R),ty=clamp(Number(m?.y)||p.y,R,H-R);
    const dx=tx-p.x,dy=ty-p.y,d=Math.hypot(dx,dy);
    let sp=MAX_SPEED;if(now<p.slowUntil)sp*=.62;if(now<p.hasteUntil)sp*=1.28;
    const max=sp*elapsed+8;
    if(d>max&&d>0){p.x+=dx/d*max;p.y+=dy/d*max;}else{p.x=tx;p.y=ty;}
    p.x=clamp(p.x,R,W-R);p.y=clamp(p.y,R,H-R);p.angle=normAng(m?.angle);
  }

  other(id){for(const p of this.players.values())if(p.id!==id)return p;return null;}
  canUse(p,key,mp,cd){
    const now=Date.now();if(!this.roundLive||!p.alive||p.mp<mp||now<(p.cd[key]||0))return false;
    p.mp-=mp;p.cd[key]=now+cd;return true;
  }
  lineHit(a,b,range,width,angle){
    const dx=b.x-a.x,dy=b.y-a.y,forward=Math.cos(angle)*dx+Math.sin(angle)*dy;
    const side=Math.abs(-Math.sin(angle)*dx+Math.cos(angle)*dy);
    return forward>=0&&forward<=range&&side<=width;
  }
  circleHit(a,b,range){return Math.hypot(b.x-a.x,b.y-a.y)<=range;}
  hurt(target,amount,sourceId){
    const now=Date.now();if(!target?.alive||now<target.invulnUntil)return false;
    let dmg=Math.max(0,Number(amount)||0);if(now<target.shieldUntil)dmg*=.5;
    target.hp=clamp(target.hp-dmg,0,target.maxHp);
    this.broadcast('hit',{target:target.id,source:sourceId,amount:dmg,hp:target.hp});
    if(target.hp<=0){target.alive=false;this.roundWon(sourceId);}return dmg>0;
  }

  attack(c,m){
    const p=this.players.get(c.sessionId),q=this.other(c.sessionId);if(!p||!q||!this.roundLive||!p.alive)return;
    const type=String(m?.type||''),angle=normAng(m?.angle??p.angle);p.angle=angle;
    if(type==='basic'){
      if(!this.canUse(p,'basic',0,330))return;
      const hit=this.lineHit(p,q,390,26,angle);if(hit)this.hurt(q,13,p.id);
      return this.fx(p,'basic',{angle,range:390,width:26,color:'#ffc828',hit});
    }
    if(type==='melee'){
      if(!this.canUse(p,'melee',0,520))return;
      const dist=Math.hypot(q.x-p.x,q.y-p.y),ang=Math.atan2(q.y-p.y,q.x-p.x),hit=dist<=112&&angleDiff(ang,angle)<=.72;
      if(hit)this.hurt(q,19,p.id);return this.fx(p,'melee',{angle,range:112,color:'#ffffff',hit});
    }
    if(type!=='skill')return;
    const name=String(m?.name||''),s=SKILLS[name];if(!s||!p.loadout.includes(name)||!this.canUse(p,name,s.mp,s.cd))return;
    let hit=false;
    if(s.type==='line'||s.type==='lineHeal'){
      hit=this.lineHit(p,q,s.range,s.width,angle);if(hit){this.hurt(q,s.dmg,p.id);if(s.type==='lineHeal')p.hp=clamp(p.hp+s.heal,0,p.maxHp);}
    }else if(s.type==='circle'||s.type==='slowCircle'){
      hit=this.circleHit(p,q,s.range);if(hit){this.hurt(q,s.dmg,p.id);if(s.type==='slowCircle')q.slowUntil=Date.now()+s.slow;}
    }else if(s.type==='heal')p.hp=clamp(p.hp+s.heal,0,p.maxHp);
    else if(s.type==='haste')p.hasteUntil=Date.now()+s.ms;
    else if(s.type==='shield')p.shieldUntil=Date.now()+s.ms;
    else if(s.type==='dash'){
      p.invulnUntil=Date.now()+s.invuln;p.x=clamp(p.x+Math.cos(angle)*s.distance,R,W-R);p.y=clamp(p.y+Math.sin(angle)*s.distance,R,H-R);
    }else if(s.type==='dashLine'){
      hit=this.lineHit(p,q,s.range,s.width,angle);if(hit)this.hurt(q,s.dmg,p.id);
      p.x=clamp(p.x+Math.cos(angle)*s.distance,R,W-R);p.y=clamp(p.y+Math.sin(angle)*s.distance,R,H-R);
    }else if(s.type==='cross'){
      const dirs=[0,Math.PI/2,Math.PI,Math.PI*1.5];hit=dirs.some(a=>this.lineHit(p,q,s.range,s.width,a));if(hit)this.hurt(q,s.dmg,p.id);
    }else if(s.type==='mine'){
      const ox=p.x,oy=p.y;setTimeout(()=>{if(!this.roundLive||!q.alive)return;const fake={x:ox,y:oy};const h=this.circleHit(fake,q,s.range);if(h)this.hurt(q,s.dmg,p.id);this.broadcast('fx',{from:p.id,name,type:'mineBlast',x:ox,y:oy,range:s.range,color:s.color,hit:h});},700);
    }else if(s.type==='totem'){
      for(let i=1;i<=s.hits;i++)setTimeout(()=>{if(!this.roundLive||!p.alive||!q.alive)return;const h=this.circleHit(p,q,s.range);if(h)this.hurt(q,s.dmg,p.id);this.broadcast('fx',{from:p.id,name,type:'totemTick',x:p.x,y:p.y,range:s.range,color:s.color,hit:h});},i*550);
    }
    this.fx(p,name,{angle,range:s.range||s.distance||120,width:s.width||0,color:s.color,kind:s.type,hit});
  }

  fx(p,name,extra={}){this.broadcast('fx',{from:p.id,name,x:p.x,y:p.y,...extra});}

  roundWon(winnerId){
    if(!this.roundLive||this.matchEnded)return;this.roundLive=false;
    const w=this.players.get(winnerId);if(!w)return;w.score++;
    this.broadcast('roundEnd',{winnerId,score:this.scoreObj(),round:this.round});
    if(w.score>=2)setTimeout(()=>this.finishMatch(winnerId,'2선승'),1800);
    else setTimeout(()=>{if(!this.matchEnded&&this.players.size===2)this.startRound();},2400);
  }

  finishMatch(winnerId,reason){
    if(this.matchEnded)return;this.matchEnded=true;this.roundLive=false;
    const loser=[...this.players.values()].find(p=>p.id!==winnerId);
    this.broadcast('matchEnd',{winnerId,loserId:loser?.id||'',reason,score:this.scoreObj(),runId:this.runId,players:this.publicPlayers()});
  }
  scoreObj(){const o={};for(const p of this.players.values())o[p.id]=p.score;return o;}
  publicPlayers(){return [...this.players.values()].map(p=>({id:p.id,name:p.name,color:p.color,x:p.x,y:p.y,hp:p.hp,maxHp:p.maxHp,mp:p.mp,maxMp:p.maxMp,score:p.score,alive:p.alive,loadout:p.loadout}));}
  snapshot(){this.broadcast('snapshot',{round:this.round,live:this.roundLive,players:this.publicPlayers(),serverTime:Date.now()});}
  broadcastRoster(){this.broadcast('roster',{hostId:this.clients[0]?.sessionId||'',started:this.started,players:this.publicPlayers()});}
}
