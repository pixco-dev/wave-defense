import { defineServer, defineRoom } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { CoopRoom } from './rooms/CoopRoom.js';
const port=Number(process.env.PORT||2567);
const server=defineServer({rooms:{wave_defense:defineRoom(CoopRoom).filterBy(['mode','partySize'])},transport:new WebSocketTransport({pingInterval:10000}),express:(app)=>app.get('/health',(_q,r)=>r.json({ok:true,room:'wave_defense',mode:'coop'}))});
server.listen(port);console.log(`Wave Defense coop server listening on ${port}`);
