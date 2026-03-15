const { Queue } = require('bullmq');
const bullConnection = require('../../config/bullMq');

const vendorReminderQueue = new Queue('vendor-reminder', {
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

module.exports = vendorReminderQueue;