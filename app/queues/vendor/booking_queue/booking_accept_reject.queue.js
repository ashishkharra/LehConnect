const { Queue } = require('bullmq');
const bullConnection = require('../../../config/bullMq');

const bookingNotificationQueue = new Queue('booking-notification', {
    connection: bullConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000
        },
        removeOnComplete: true,
        removeOnFail: false
    }
});

module.exports = bookingNotificationQueue;
