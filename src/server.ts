import { app } from './app.js';
import { config } from './config.js';
import { migrate,pool } from './db.js';
const start=async()=>{await migrate();return app.listen(config.PORT,'0.0.0.0',()=>app.emit('server-ready'));};
const serverPromise=start();
const shutdown=(signal:string)=>{app.emit('shutdown-started',signal);void serverPromise.then(server=>server.close(error=>{if(error)process.exitCode=1;void pool?.end().finally(()=>process.exit());if(!pool)process.exit();}));const timer=setTimeout(()=>{app.emit('shutdown-timeout',signal);process.exit(1);},10000);timer.unref();};
process.on('SIGTERM',()=>shutdown('SIGTERM'));process.on('SIGINT',()=>shutdown('SIGINT'));
