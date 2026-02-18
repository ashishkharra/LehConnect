const { Worker } = require('bullmq');
const bullConnection = require('../../../config/bullMq');
const db = require('../../../models/index');
const admin = require('../../../config/firebase');

const Notification = db.notification;
const VendorDevice = db.vendor_device_fcm;
const CustomerDevice = db.customer_device_fcm;

new Worker(
  'rating-notification',
  async job => {
    const { booking_token, reporter_token, ratee_token, stars, comment } = job.data;

    // DB notifications
    await Notification.create({
      sender_token: null,
      receiver_token: reporter_token,
      receiver_role: 'vendor',
      booking_token,
      type: 'RATING_SUBMITTED',
      title: 'Rating Submitted',
      message: `You rated this booking ${stars} stars.`,
      visibility: 'private'
    });

    await Notification.create({
      sender_token: null,
      receiver_token: ratee_token,
      receiver_role: 'customer',
      booking_token,
      type: 'RATING_RECEIVED',
      title: 'Rating Received',
      message: `You received a ${stars} star rating.`,
      visibility: 'private'
    });

    // PUSH notification to reporter (vendor)
    const reporterDevices = await VendorDevice.findAll({
      where: { vendor_token: reporter_token },
      attributes: ['fcm_token'],
      raw: true
    });

    if (reporterDevices.length) {
      await admin.messaging().sendEachForMulticast({
        tokens: reporterDevices.map(d => d.fcm_token),
        notification: {
          title: 'Rating Submitted',
          body: `You rated this booking ${stars} stars.`,
        },
        data: { booking_token, type: 'RATING_SUBMITTED' }
      });
    }

    // PUSH notification to ratee (customer)
    const rateeDevices = await CustomerDevice.findAll({
      where: { customer_token: ratee_token },
      attributes: ['fcm_token'],
      raw: true
    });

    if (rateeDevices.length) {
      await admin.messaging().sendEachForMulticast({
        tokens: rateeDevices.map(d => d.fcm_token),
        notification: {
          title: 'Rating Received',
          body: `You received a ${stars} star rating.`,
        },
        data: { booking_token, type: 'RATING_RECEIVED' }
      });
    }
  },
  {
    connection: bullConnection,
    concurrency: 5
  }
);
