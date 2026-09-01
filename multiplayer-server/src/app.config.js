import { defineServer, defineRoom } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { CoopRoom } from './rooms/CoopRoom.js';
import { PvPRoom } from './rooms/PvPRoom.js';
const port=Number(process.env.PORT||2567);
const server=defineServer({
  rooms:{
    wave_defense:defineRoom(CoopRoom).filterBy(['mode','partySize']),
    wave_pvp:defineRoom(PvPRoom)
  },
  transport:new WebSocketTransport({pingInterval:10000}),
  express:(app)=>{
    app.get('/health',(_q,r)=>r.json({ok:true,rooms:['wave_defense','wave_pvp'],modes:['coop','pvp']}));
  }
});
server.listen(port);
console.log(`Wave Defense multiplayer server listening on ${port}`);
