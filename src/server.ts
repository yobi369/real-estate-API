import { app } from './app.js';
import { config } from './config.js';
const server=app.listen(config.PORT,'0.0.0.0',()=>app.emit('server-ready'));
const shutdown=(signal:string)=>{ app.emit('shutdown-started',signal); server.close(error=>{ if(error) process.exitCode=1; process.exit(); }); const timer=setTimeout(()=>{ app.emit('shutdown-timeout',signal); process.exit(1); },10000); timer.unref(); };
process.on('SIGTERM',()=>shutdown('SIGTERM'));
process.on('SIGINT',()=>shutdown('SIGINT'));
