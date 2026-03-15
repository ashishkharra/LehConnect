const { Queue } = require('bullmq');
const bullConnection = require('../../../config/bullMq');

const bookingCompletionQueue = new Queue('booking-completion-notification', {
  connection: bullConnection
});

module.exports = bookingCompletionQueue;