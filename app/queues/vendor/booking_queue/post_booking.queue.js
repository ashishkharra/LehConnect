const { Queue } = require('bullmq');
const bullConnection = require('../../../config/bullMq');

const bookingQueue = new Queue('booking_v2', {
  connection: bullConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    removeOnComplete: false,
    removeOnFail: false
  }
});

module.exports = bookingQueue;