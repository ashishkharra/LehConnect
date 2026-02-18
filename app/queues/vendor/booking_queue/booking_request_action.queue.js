const { Queue } = require('bullmq');
const bullConnection = require('../../../config/bullMq');

const bookingRequestActionQueue = new Queue('booking-request', {
    connection: bullConnection
});

module.exports = bookingRequestActionQueue;
