const { Worker } = require('bullmq');
const bullConnection = require('../../config/bullMq.js');
const db = require('../../models/index.js');
const { redisClient } = require('../../config/redis.config.js');
const IORedis = require('ioredis');

const Vendor = db.vendor;
const Notification = db.notification;

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
      console.log('[REMINDER] All partial vendors already reminded recently');
      return;
    }

    await Notification.bulkCreate(notifications);

    const socketPayloadForVendor = v => ({
      notification_type: 'SYSTEM_ALERT',
      title: 'Verification Incomplete',
      message: `Hi ${v.first_name || ''} ${v.last_name || ''}, your verification is partially completed. Please complete it to continue.`,
      receiver_token: v.token,
      receiver_role: 'vendor',
      payload: {
        reason: 'PARTIAL_VERIFICATION',
        action: 'COMPLETE_VERIFICATION'
      },
      from: triggeredBy === 'CRON' ? 'SYSTEM' : 'ADMIN'
    });

    for (const v of socketTargets) {
      pub.publish(
        'socket:verification-incomplete',
        JSON.stringify({
          vendorToken: v.token,
          event: 'vendor_notification',
          payload: socketPayloadForVendor(v)
        })
      );
    }

    console.log(`[REMINDER] Sent partial verification reminders to ${socketTargets.length} vendors`);
  },
  {
    connection: bullConnection,
    concurrency: 3
  }
);