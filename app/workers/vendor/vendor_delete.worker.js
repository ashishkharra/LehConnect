const { Worker } = require('bullmq');
const bullConnection = require('../../../config/bullMq');
const db = require('../../models/index');
const admin = require('../../../config/firebase');

const Notification = db.notification;
const VendorDevice = db.vendor_device_fcm;

new Worker(
  'vendor-delete-notification',
  async job => {

    const {
      vendor_token,
      type,
      title,
      message,
      admin_remark,
      is_delete
    } = job.data;

    // DB notification
    await Notification.create({
      receiver_token: vendor_token,
      receiver_role: 'vendor',
      type,
      title,
      message,
      admin_remark,
      is_delete,
      is_read: false,
      flag: 0
    });

    // PUSH notification
    const devices = await VendorDevice.findAll({
      where: { vendor_token, flag: 0 || false },
      attributes: ['fcm_token'],
      raw: true
    });

    if (devices.length) {
      await admin.messaging().sendEachForMulticast({
        tokens: devices.map(d => d.fcm_token),
        notification: { title, body: message },
        data: {
          type,
          admin_remark: admin_remark || '',
          is_delete: is_delete ? 'true' : 'false'
        }
      });
    }
  },
  {
    connection: bullConnection,
    concurrency: 5
  }
);
