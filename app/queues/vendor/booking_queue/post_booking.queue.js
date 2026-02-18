const { Queue } = require('bullmq');
const bullConnection = require('../../../config/bullMq');

const bookingQueue = new Queue('booking', {
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
