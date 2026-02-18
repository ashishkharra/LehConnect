const { Queue } = require('bullmq');
const bullConnection = require('../../../config/bullMq');

const freeVehicleExpiredQueue = new Queue(
  'free-vehicle-expired',
  { connection: bullConnection }
);

const freeVehicleRequestExpiredQueue = new Queue(
  'free-vehicle-request-expired',
  { connection: bullConnection }
);

module.exports = { freeVehicleExpiredQueue, freeVehicleRequestExpiredQueue}