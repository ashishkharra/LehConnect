const { Worker } = require('bullmq');
const bullConnection = require('../../config/bullMq');
const db = require('../../models/index.js');
const { redisClient } = require('../../config/redis.config.js');
const IORedis = require('ioredis');

const Vendor = db.vendor;
const Notification = db.notification;

const SOCKET_BATCH_THRESHOLD = 10000;
const BATCH_SIZE = 500;
const REMINDER_COOLDOWN_SECONDS = 86400;
const pub = new IORedis();

new Worker(
  'vendor-reminder',
  async job => {
    const { triggeredBy } = job.data;

    const vendors = await Vendor.findAll({
      where: { flag: 0, verification_status: 'PARTIAL' },
      attributes: ['token', 'first_name', 'last_name'],
      raw: true
    });

    if (!vendors.length) {
      console.log('[REMINDER] No partial vendors found');
      return;
    }

    const notifications = [];
    const socketTargets = [];

    for (const v of vendors) {
      const redisKey = `vendor:partial:reminded:${v.token}`;
      const alreadyReminded = await redisClient.get(redisKey);

      if (alreadyReminded) continue;

      await redisClient.setEx(redisKey, REMINDER_COOLDOWN_SECONDS, '1');

      notifications.push({
        sender_token: null,
        receiver_token: v.token,
        receiver_role: 'vendor',
        type: 'SYSTEM_ALERT',
        title: 'Verification Incomplete',
        message: `Hi ${v.first_name || ''} ${v.last_name || ''}, your verification is partially completed. Please complete it to continue.`,
        payload: {
          reason: 'PARTIAL_VERIFICATION',
          action: 'COMPLETE_VERIFICATION'
        }
      });

      socketTargets.push(v);
    }

    if (!notifications.length) {
      return;
    }

    await Notification.bulkCreate(notifications);

    const socketPayload = {
      type: 'SYSTEM_ALERT',
      from: triggeredBy === 'CRON' ? 'SYSTEM' : 'ADMIN',
      title: 'Verification Incomplete',
      message: 'Please complete your verification'
    };

    for (const v of socketTargets) {
      pub.publish(
        'socket:verification-incomplete',
        JSON.stringify({
          vendorToken: v.token,
          payload: socketPayload
        })
      );
    }
  },
  {
    connection: bullConnection,
    concurrency: 3
  }
);