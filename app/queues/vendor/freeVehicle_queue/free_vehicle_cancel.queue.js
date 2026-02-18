const { Queue } = require('bullmq');
const bullConnection = require('../../../config/bullMq');

const freeVehicleCancelQueue = new Queue(
  'free-vehicle-cancel-notification',
  { connection: bullConnection }
);

module.exports = freeVehicleCancelQueue;