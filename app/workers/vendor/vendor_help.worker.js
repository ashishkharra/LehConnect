const { Worker } = require('bullmq');
const bullConnection = require('../../../config/bullMq');
const db = require('../../models/index');
const admin = require('../../../config/firebase');

const VendorDevice = db.vendor_device_fcm;
const Notification = db.notification;

new Worker(
  'vendor-help-notification',
  async job => {

    const { help_token, vendor_token, title, category } = job.data;

    const notifyVendors = await db.vendor.findAll({
      where: {
        flag: 0,
        booking_notification_enabled: true,
        token: { [db.Sequelize.Op.ne]: vendor_token }
      },
      attributes: ['token'],
      raw: true
    });

    const vendorTokens = notifyVendors.map(v => v.token);

    await Notification.bulkCreate(
      vendorTokens.map(token => ({
        sender_token: vendor_token,
        receiver_token: token,
        receiver_role: 'vendor',
        type: 'VENDOR_HELP_QUESTION',
        title: 'New Help Request',
        message: title,
        payload: { help_token, category },
        visibility: 'public'
      }))
    );

    const devices = await VendorDevice.findAll({
      where: { vendor_token: vendorTokens, flag: 0 || false },
      attributes: ['fcm_token'],
      raw: true
    });

    if (devices.length) {
      await admin.messaging().sendEachForMulticast({
        tokens: devices.map(d => d.fcm_token),
        notification: {
          title: 'Vendor needs help 🤝',
          body: title
        },
        data: {
          type: 'VENDOR_HELP',
          help_token
        }
      });
    }
  },
  {
    connection: bullConnection,
    concurrency: 5
  }
);
