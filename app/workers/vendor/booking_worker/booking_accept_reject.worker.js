const { Worker } = require('bullmq');
const bullConnection = require('../../../config/bullMq');
const db = require('../../../models/index');
const admin = require('../../../config/firebase');

const { buildAlertMulticast } = require('../../../shared/utils/fcmMessage');
const { cleanupInvalidTokens } = require('../../../shared/utils/fcmCleanup');

const Notification = db.notification;
const VendorDeviceFCM = db.vendor_device_fcm;

new Worker(
  'booking-notification',
  async (job) => {
    try {
      const {
        receiver_token,
        sender_token,
        type,
        title,
        message,
        booking_token,
        event
      } = job.data;

      if (!receiver_token) {
        return true;
      }

      const finalTitle = title || 'Booking Update';
      const finalMessage =
        message || 'There is a new update on your booking.';
      const finalType = type || 'BOOKING_UPDATE';

      // 1) Save notification only here
      await Notification.create({
        sender_token: sender_token || null,
        receiver_token,
        receiver_role: 'vendor',
        booking_token,
        type: finalType,
        title: finalTitle,
        message: finalMessage,
        visibility: 'private'
      });

      // 2) Get tokens
      const devices = await VendorDeviceFCM.findAll({
        where: {
          vendor_token: receiver_token,
          flag: 0 || false
        },
        attributes: ['fcm_token'],
        raw: true
      });

      const tokens = [
        ...new Set(
          devices
            .map(d => String(d.fcm_token || '').trim())
            .filter(Boolean)
        )
      ];

      if (!tokens.length) {
        return true;
      }

      // 3) Send push like post-booking worker
      const response = await admin.messaging().sendEachForMulticast(
        buildAlertMulticast({
          tokens,
          title: finalTitle,
          body: finalMessage,
          channelId: 'duty-alerts',
          sound: 'default',
          data: {
            booking_token: booking_token || '',
            receiver_token: receiver_token || '',
            sender_token: sender_token || '',
            type: finalType,
            event: event || 'booking:bid'
          },
          collapseKey: `booking_notification_${booking_token}_${finalType}`
        })
      );

      // 4) Cleanup invalid tokens same as post-booking worker
      await cleanupInvalidTokens({
        response,
        tokens,
        DeviceModel: VendorDeviceFCM,
        ownerField: 'vendor_token',
        ownerValue: receiver_token
      });

      return true;
    } catch (error) {
      console.error('[BOOKING_NOTIFICATION_WORKER] ERROR:', error);
      throw error;
    }
  },
  {
    connection: bullConnection,
    concurrency: 5
  }
);