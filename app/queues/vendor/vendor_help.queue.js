const { Queue } = require('bullmq');
const bullConnection = require('../../config/bullMq');

module.exports = new Queue('vendor-help-notification', {
  connection: bullConnection
});