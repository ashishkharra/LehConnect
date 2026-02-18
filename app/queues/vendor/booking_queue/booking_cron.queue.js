const { Queue } = require('bullmq');
const bullConnection = require('../../../config/bullMq');

const bookingExpiredQueue = new Queue('booking-expired', { connection: bullConnection });

module.exports = bookingExpiredQueue