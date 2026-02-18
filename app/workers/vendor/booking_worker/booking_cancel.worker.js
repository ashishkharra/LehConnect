const { Worker } = require('bullmq');
const bullConnection = require('../../../config/bullMq');
const db = require('../../../models/index');
const admin = require('../../../config/firebase');

const Notification = db.notification;
const VendorDevice = db.vendor_device_fcm;

new Worker(
  'booking-cancel-notification',
  async job => {
    const {
      booking_token,
      cancelled_by_token,
      cancelled_by_role,
      owner_token,
      reason
    } = job.data;

    const title = 'Booking Cancelled';
    const message =
      reason || 'A booking request has been cancelled';

    await Notification.create({
      sender_token: cancelled_by_token,
      receiver_token: owner_token,
      receiver_role: 'vendor',
      booking_token,
      type: 'BOOKING_CANCELLED',
      title,
      message,
      visibility: 'private'
    });

    const devices = await VendorDevice.findAll({
      where: { vendor_token: owner_token },
      attributes: ['fcm_token'],
      raw: true
    });

    if (devices.length) {
      await admin.messaging().sendEachForMulticast({
        tokens: devices.map(d => d.fcm_token),
        notification: { title, body: message },
        data: {
          booking_token,
          type: 'BOOKING_CANCELLED'
        }
      });
    }
  },
  {
    connection: bullConnection,
    concurrency: 5
  }
);
