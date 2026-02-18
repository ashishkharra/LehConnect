const cluster = require('cluster');
const os = require('os');
const { ENV, RUN_CRON } = require('./app/config/globals.js');

const numCPUs = os.cpus().length;

if (ENV !== 'production') {
    console.log('Dev mode detected — running single process');
    require('./app.js');
    return;
}

if (cluster.isPrimary) {
    console.log(`Master ${process.pid} running`);
    console.log(`Forking ${numCPUs} workers...`);

    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        console.error(
            `Worker ${worker.process.pid} died (code: ${code}, signal: ${signal}). Restarting...`
        );
        cluster.fork();
    });

    if (RUN_CRON) {
        const { vehicleCron, bookingCron, partialStatusReminder } = require('./app/cron/cron.js');
        vehicleCron();
        bookingCron();
        partialStatusReminder();
        console.log('Cron jobs started in master process');
    }

    process.on('SIGINT', () => {
        console.log('Master shutting down...');
        for (const id in cluster.workers) {
            cluster.workers[id].kill();
        }
        process.exit(0);
    });

} else {
    console.log(`Worker ${process.pid} started`);
    require('./app.js');
}