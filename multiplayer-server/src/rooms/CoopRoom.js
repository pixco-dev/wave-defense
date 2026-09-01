import { Room } from 'colyseus';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const cleanName=s=>String(s||'Player').replace(/[<>]/g,'').trim().slice(0,12)||'Player';

export class CoopRoom extends Room {
  maxClients=4;
  hostId='';
  started=false;
  initialParty=0;
  playerMeta=new Map();
  lastWorld=null;
  runId='';
  runStartedAt=0;
  maxWave=0;
  teamKills=0;
  rankEligible=true;
  rankReason='';

  onCreate(options){
    this.maxClients=clamp(Number(options?.partySize||4),2,4);
    this.setPatchRate(100);

    this.onMessage('playerState',(client,data)=>{
      const meta=this.playerMeta.get(client.sessionId)||{};
      const safe={
        id:client.sessionId,
        name:cleanName(data?.name||meta.name),
        x:Number(data?.x)||0,y:Number(data?.y)||0,
        hp:Number(data?.hp)||0,maxHp:Number(data?.maxHp)||120,
        mp:Number(data?.mp)||0,maxMp:Number(data?.maxMp)||80,
        level:Number(data?.level)||1,atk:Number(data?.atk)||10,def:Number(data?.def)||0,
        gold:Number(data?.gold)||0,kills:Number(data?.kills)||0,
        alive:data?.alive!==false,angle:Number(data?.angle)||0,
        color:String(data?.color||meta.color||'#4af0ff'),
        weapon:data?.weapon||null
      };
      this.playerMeta.set(client.sessionId,{...meta,...safe});
      this.broadcast('playerState',safe,{except:client});
    });

    this.onMessage('action',(client,data)=>{
      if(!this.started)return;
      const msg={from:client.sessionId,...data};
      const host=this.clients.find(c=>c.sessionId===this.hostId);
      if(host&&client.sessionId!==this.hostId)host.send('action',msg);
      this.broadcast('remoteFx',msg,{except:client});
    });

    this.onMessage('world',(client,data)=>{
      if(client.sessionId!==this.hostId||!this.started)return;
      this.lastWorld=data;
      this.maxWave=Math.max(this.maxWave,Number(data?.wave)||0);
      this.teamKills=Math.max(this.teamKills,Number(data?.teamKills)||0);
      this.broadcast('world',data,{except:client});
    });

    this.onMessage('damage',(client,data)=>{
      if(client.sessionId!==this.hostId)return;
      const target=this.clients.find(c=>c.sessionId===String(data?.target||''));
      if(target)target.send('damage',{amount:Number(data?.amount)||0,source:data?.source||'enemy'});
    });

    this.onMessage('reward',(client,data)=>{
      if(client.sessionId!==this.hostId)return;
      this.broadcast('reward',data,{except:client});
    });

    this.onMessage('giveItem',(client,data)=>{
      if(client.sessionId!==this.hostId)return;
      const target=this.clients.find(c=>c.sessionId===String(data?.target||''));
      if(target)target.send('giveItem',{name:String(data?.name||'')});
    });

    this.onMessage('start',(client)=>{
      if(client.sessionId!==this.hostId||this.started)return;
      this.started=true;
      this.initialParty=this.clients.length;
      this.runStartedAt=Date.now();
      this.runId=`${this.roomId}_${this.runStartedAt}`;
      this.rankEligible=this.initialParty>=2;
      this.rankReason=this.rankEligible?'':'2인 이상 플레이만 랭킹 등록 가능';
      this.lock();
      this.broadcast('start',{hostId:this.hostId,partySize:this.initialParty,runId:this.runId});
    });

    this.onMessage('gameover',(client,data)=>{
      if(client.sessionId!==this.hostId)return;
      const final={
        runId:this.runId,
        partySize:this.initialParty,
        wave:Number(data?.wave)||this.maxWave,
        kills:Number(data?.kills)||this.teamKills,
        survivalSec:Math.max(0,Math.floor((Date.now()-this.runStartedAt)/1000)),
        players:[...this.playerMeta.values()].map(p=>p.name),
        rankEligible:this.rankEligible&&this.clients.length===this.initialParty,
        rankReason:this.rankEligible?(this.clients.length===this.initialParty?'':'플레이 중 인원 변동 발생'):this.rankReason
      };
      this.broadcast('gameover',final);
    });
  }

  onJoin(client,options){
    const idx=this.clients.length-1;
    const colors=['#4af0ff','#ffc828','#ff70c8','#70ff80'];
    const meta={id:client.sessionId,name:cleanName(options?.name),color:colors[idx%colors.length],x:430+idx*40,y:430};
    this.playerMeta.set(client.sessionId,meta);
    if(!this.hostId)this.hostId=client.sessionId;
    client.send('hello',{id:client.sessionId,hostId:this.hostId,roomId:this.roomId,maxClients:this.maxClients,started:this.started,players:[...this.playerMeta.values()]});
    if(this.started&&this.lastWorld)client.send('world',this.lastWorld);
    this.broadcastRoster();
  }

  onLeave(client){
    this.playerMeta.delete(client.sessionId);
    if(this.started){
      this.rankEligible=false;
      this.rankReason='플레이 중 퇴장 발생';
    }
    if(client.sessionId===this.hostId){
      const next=this.clients.find(c=>c.sessionId!==client.sessionId);
      this.hostId=next?.sessionId||'';
      if(next){
        next.send('becomeHost',{world:this.lastWorld});
        this.broadcast('hostChanged',{hostId:this.hostId});
      }
    }
    this.broadcastRoster();
  }

  broadcastRoster(){
    this.broadcast('roster',{hostId:this.hostId,started:this.started,players:[...this.playerMeta.values()]});
  }
}
