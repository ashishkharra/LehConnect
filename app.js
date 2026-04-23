require('./app/config/sequelize.js');
require('./app/config/redis.config.js');

require('./app/workers/vendor/vendor_reminder.worker.js');
require('./app/workers/vendor/chat.worker.js')
require('./app/workers/vendor/chat.notification.worker.js')

require('./app/workers/vendor/booking_worker/post_booking.worker.js');
require('./app/workers/vendor/booking_worker/booking_request_action.worker.js');
require('./app/workers/vendor/booking_worker/booking_accept_reject.worker.js')
require('./app/workers/vendor/booking_worker/booking_rating.worker.js')
require('./app/workers/vendor/booking_worker/booking_cancel.worker.js')
require('./app/workers/vendor/booking_worker/booking_completion.worker.js')

require('./app/workers/vendor/freeVehicle_worker/post_free_vehicle.worker.js')
require('./app/workers/vendor/freeVehicle_worker/free_vehicle_request.worker.js')
require('./app/workers/vendor/freeVehicle_worker/free_vehicle_request_action.worker.js')
require('./app/workers/vendor/freeVehicle_worker/free_vehicle.cancel.worker.js')

require('./app/workers/vendor/enquiries/enquiry.worker.js')


const express = require('express');
const path = require('path');
const session = require('express-session');
const http = require('http');
const cors = require('cors')
const { RUN_CRON, PORT, ENV, SESSION_SECRET } = require('./app/config/globals.js');
const adminRoute = require('./app/routes/adminRoute.js');
const apiRoutes = require('./app/apis/master.api.js');
const initializeDatabase = require('./app/config/sequelize');
const { redisClient } = require('./app/config/redis.config.js');
const { RedisStore } = require('connect-redis');
const flashMiddleware = require('./app/middleware/flashMiddleware');
const { userData } = require('./app/middleware/adminData');
const { viewHelper } = require('./app/shared/utils/helper.js');
const { initSocket, getIO } = require('./app/sockets/index.js');
const { vehicleCron, bookingCron, partialStatusReminder } = require('./app/cron/cron.js');
const IORedis = require('ioredis');

const app = express();
const server = http.createServer(app);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, './app/views'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('trust proxy', 1);
app.use(cors({
  origin: '*',
  credentials: true
}))

app.use(
    session({
        store: new RedisStore({ client: redisClient }),
        secret: SESSION_SECRET || 'dev-secret-change-me',
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: ENV === 'production',
            httpOnly: true,
            maxAge: 60 * 60 * 1000
        }
    })
);

if (ENV !== 'production') {
    app.use((req, res, next) => {
        console.log(`[LOG] ${req.method} ${req.url}`);
        next();
    });
}

app.use(flashMiddleware);
app.use(viewHelper);
app.use('/v1/api', apiRoutes);
app.use(userData);
app.use('/', adminRoute);
app.use((err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }
    res.status(err.status || 500);
    res.render('error/404', {
        title: 'Error',
        err_title: err.message,
        message: 'Internal Server Error',
        status: 500,
        back_url: req.get('Referer')
    });
});

(async () => {
    try {
        await initializeDatabase();

        if (RUN_CRON) {
            vehicleCron();
            bookingCron();
            partialStatusReminder();
        }

        await initSocket(server, redisClient);
        const io = getIO();
        const redisSub = new IORedis({ host: 'localhost', port: 6379 });

        redisSub.subscribe(
            'socket:verification-incomplete',
            'socket:new-duty-alert',
            'socket:booking-request-action',
            'socket:booking-request',
            'socket:booking-instant',
            'socket:booking-rejected',
            'socket:booking-rated',
            (err, count) => {
                if (err) console.error('Failed to subscribe: %s', err.message);
            }
        );

        redisSub.on('message', (channel, message) => {
            let data;
            try {
                data = JSON.parse(message);
            } catch (e) {
                console.error('Redis message parse error', e);
                return;
            }

            const emitToVendor = (event, payload) => {
                if (data.vendorToken) {
                    io.to(`vendor:${data.vendorToken}`).emit(event, payload);
                }
            };

            switch (channel) {
                case 'socket:verification-incomplete':
                    emitToVendor('verification:incomplete', data.payload);
                    break;
                case 'socket:new-duty-alert':
                    emitToVendor('new_duty_alert', data.payload);
                    break;
                case 'socket:booking-request-action':
                    emitToVendor('booking:request-action', data.payload);
                    break;
                case 'socket:booking-request':
                    emitToVendor('booking:request', data.payload);
                    break;
                case 'socket:booking-instant':
                    emitToVendor('booking:instant', data.payload);
                    break;
                case 'socket:booking-rejected':
                    emitToVendor('booking:rejected', data.payload);
                    break;
                case 'socket:booking-rated':
                    emitToVendor('booking:rated', data.payload);
                    break;
                default:
                    break;
            }
        });
        
        server.listen(PORT || 3000, () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`http://localhost:${PORT}`);
        });

    } catch (error) {
        console.error('App startup failed:', error);
        process.exit(1);
    }
})();