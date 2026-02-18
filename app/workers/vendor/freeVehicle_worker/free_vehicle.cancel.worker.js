const { Worker } = require('bullmq');
const bullConnection = require('../../../config/bullMq');
const db = require('../../../models');
const admin = require('../../../config/firebase');

const Notification = db.notification;
const VendorDevice = db.vendor_device_fcm;

new Worker(
  'free-vehicle-cancel-notification',
  async job => {
    const {
      free_vehicle_token,
      cancelled_by_vendor_token,
      owner_token,
      reason
    } = job.data;

    const title = 'Request Cancelled';
    const message =
      reason || 'A free vehicle request has been cancelled';

    // 🗂 DB
    await Notification.create({
      sender_token: cancelled_by_vendor_token,
      receiver_token: owner_token,
      receiver_role: 'vendor',
      free_vehicle_token,
      type: 'FREE_VEHICLE_REQUEST_CANCELLED',
      title,
      message,
      visibility: 'private'
    });

    // 🔔 PUSH
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
          free_vehicle_token,
          type: 'FREE_VEHICLE_REQUEST_CANCELLED'
        }
      });
    }
  },
  {
    connection: bullConnection,
    concurrency: 5
  }
);
