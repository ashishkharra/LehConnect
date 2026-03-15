const { Worker } = require('bullmq');
const bullConnection = require('../../../config/bullMq');
const db = require('../../../models/index');
const { Op } = require('sequelize');
const admin = require('../../../config/firebase');

const Notification = db.notification;

new Worker(
  'booking-notification',
  async job => {
    const { receiver_token, type, title, message, booking_token, event } = job.data;

    // 1) Save in DB
    await Notification.create({
      sender_token: null,
      receiver_token,
      receiver_role: 'vendor',
      booking_token,
      type,
      title,
      message,
      visibility: 'private'
    });

    // 2) Send push
    const device = await db.vendor_device_fcm.findOne({
      where: { vendor_token: receiver_token },
      attributes: ['fcm_token'],
      raw: true
    });

    if (device?.fcm_token) {
      await admin.messaging().send({
        token: device.fcm_token,
        notification: { title, body: message },
        android: {
          priority: 'high',
          notification: {
            channelId: 'duty-alerts',
            sound: 'default'
          }
        },
        data: {
          booking_token,
          type,
          event
        }
      });
    }
  },
  {
    connection: bullConnection,
    concurrency: 5
  }
);