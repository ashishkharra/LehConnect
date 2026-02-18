const { Queue } = require('bullmq');
const bullConnection = require('../../../config/bullMq');

const bookingCancelQueue = new Queue('booking-cancel-notification', {
  connection: bullConnection
});

module.exports = bookingCancelQueue;
