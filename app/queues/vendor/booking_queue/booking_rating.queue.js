const { Queue } = require('bullmq');
const bullConnection = require('../../../config/bullMq');

const ratingNotificationQueue = new Queue('rating-notification', {
  connection: bullConnection
});

module.exports = ratingNotificationQueue;
