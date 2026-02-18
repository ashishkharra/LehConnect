const { Queue } = require('bullmq');
const bullConnection = require('../../config/bullMq');

const vendorDeleteQueue = new Queue('vendor-delete-notification', {
  connection: bullConnection
});

module.exports = vendorDeleteQueue;
