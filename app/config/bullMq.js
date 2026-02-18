const IORedis = require('ioredis');

const bullConnection = new IORedis({
  host: 'localhost',
  port: 6379,
  maxRetriesPerRequest: null
});

bullConnection.on('connect', () => console.log('BullMQ Redis connected'));
bullConnection.on('error', err => console.error('BullMQ Redis error:', err));

module.exports = bullConnection;