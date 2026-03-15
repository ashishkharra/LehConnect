const { Worker } = require('bullmq');
const bullConnection = require('../../../config/bullMq');
const db = require('../../../models/index');
const { Op } = require('sequelize');
const admin = require('../../../config/firebase');

const Notification = db.notification;

new Worker(
  'booking-request',
  async job => {
    const {
      bookingToken,
      requestToken,
      receiverVendorToken,
      action,
      reason,
      actorToken
    } = job.data;

    const type = action === 'ACCEPTED'
      ? 'BOOKING_ACCEPTED'
      : 'BOOKING_REJECTED';

    const title = action === 'ACCEPTED'
      ? 'Booking Accepted'
      : 'Booking Rejected';

    const message = action === 'ACCEPTED'
      ? 'Your booking request has been accepted.'
      : reason;

    // Save notification to DB
    await Notification.create({
      sender_token: actorToken,
      receiver_token: receiverVendorToken,
      receiver_role: 'vendor',
      booking_token: bookingToken,
      type,
      title,
      message,
      visibility: 'private'
    });

    // Fetch FCM tokens for the vendor
    const devices = await db.vendor_device_fcm.findAll({
      where: { vendor_token: receiverVendorToken },
      attributes: ['fcm_token'],
      raw: true
    });

    console.log('fc  toke ->>>> ', devices)

    if (devices.length) {
      console.log('ttttttttttttttt')
      const tokens = devices.map(d => d.fcm_token);

      await admin.messaging().sendMulticast({
        tokens,
        notification: {
          title,
          body: message
        },
        data: {
          booking_token: bookingToken,
          type
        },
        android: {
          priority: "high",
          notification: {
            channelId: "booking-actions",
            sound: "default"
          }
        }
      });
      console.log('yyyyyyyyyyyyyyyyy')
    }
  },
  {
    connection: bullConnection,
    concurrency: 5
  }
);