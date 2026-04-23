const { Worker } = require('bullmq');
const bullConnection = require('../../../config/bullMq');
const db = require('../../../models');
const admin = require('../../../config/firebase');

const Notification = db.notification;
const VendorDevice = db.vendor_device_fcm;

new Worker(
  'free-vehicle-expired',
  async job => {
    const {
      receiver_token,
      type,
      title,
      message,
      payload
    } = job.data;

    await Notification.create({
      sender_token: 'SYSTEM',
      receiver_token,
      receiver_role: 'vendor',
      type,
      title,
      message,
      payload,
      visibility: 'private'
    });

    const devices = await VendorDevice.findAll({
      where: { vendor_token: receiver_token, flag: 0 || false },
      attributes: ['fcm_token'],
      raw: true
    });

    if (devices.length) {
      await admin.messaging().sendEachForMulticast({
        tokens: devices.map(d => d.fcm_token),
        notification: { title, body: message },
        data: {
          type,
          ...Object.fromEntries(
            Object.entries(payload || {}).map(([k, v]) => [k, String(v)])
          )
        }
      });
    }
  },
  {
    connection: bullConnection,
    concurrency: 5
  }
);