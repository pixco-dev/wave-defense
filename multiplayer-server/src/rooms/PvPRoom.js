import { Room } from 'colyseus';

const clean=s=>String(s||'Player').replace(/[<>]/g,'').trim().slice(0,12)||'Player';
const COLORS=['#4af0ff','#ff7070'];

// PVP room is signaling-only. Gameplay traffic moves to WebRTC P2P after peers connect.
export class PvPRoom extends Room{
  maxClients=2;
  players=new Map();
  started=false;

  onCreate(){
    this.maxClients=2;
    this.onMessage('signal',(client,msg)=>{
      const to=String(msg?.to||'');
      const target=this.clients.find(c=>c.sessionId===to);
      if(target)target.send('signal',{from:client.sessionId,data:msg?.data||null});
    });
    this.onMessage('start',(client)=>{
      if(this.started||this.clients.length!==2||client.sessionId!==this.clients[0]?.sessionId)return;
      this.started=true;
      this.lock();
      this.broadcast('start',{hostId:this.clients[0].sessionId,players:[...this.players.values()]});
    });
  }

  onJoin(client,options){
    const idx=this.players.size;
    this.players.set(client.sessionId,{
      id:client.sessionId,
      name:clean(options?.name),
      color:COLORS[idx%COLORS.length]
    });
    client.send('hello',{id:client.sessionId,roomId:this.roomId,hostId:this.clients[0]?.sessionId||client.sessionId});
    this.broadcastRoster();
  }

  onLeave(client){
    const leavingWasHost=client.sessionId===this.clients[0]?.sessionId;
    this.players.delete(client.sessionId);
    this.broadcast('peerLeft',{id:client.sessionId,wasHost:leavingWasHost});
    this.broadcastRoster();
  }

  broadcastRoster(){
    this.broadcast('roster',{
      hostId:this.clients[0]?.sessionId||'',
      started:this.started,
      players:[...this.players.values()]
    });
  }
}
