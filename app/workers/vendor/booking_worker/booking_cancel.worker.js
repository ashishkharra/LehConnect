const { Worker } = require('bullmq');
const bullConnection = require('../../../config/bullMq');
const db = require('../../../models/index');
const admin = require('../../../config/firebase');
const { buildAlertMulticast } = require('../../../shared/utils/fcmMessage');
const { cleanupInvalidTokens } = require('../../../shared/utils/fcmCleanup');

const Notification = db.notification;
const VendorDevice = db.vendor_device_fcm;

new Worker(
  'booking-cancel-notification',
  async (job) => {
    const {
      booking_token,
      cancelled_by_token,
      cancelled_by_role,
      owner_token,
      reason,
    } = job.data;

    const title = 'Booking Cancelled';
    const message = reason || 'A booking request has been cancelled';

    await Notification.create({
      sender_token: cancelled_by_token,
      sender_role: cancelled_by_role || null,
      receiver_token: owner_token,
      receiver_role: 'vendor',
      booking_token,
      type: 'BOOKING_CANCELLED',
      title,
      message,
      visibility: 'private',
    });

    const devices = await VendorDevice.findAll({
      where: { vendor_token: owner_token, flag: 0 || false },
      attributes: ['fcm_token'],
      raw: true,
    });

    const tokens = [
      ...new Set(
        devices
          .map((d) => String(d.fcm_token || '').trim())
          .filter(Boolean)
      ),
    ];

    if (tokens.length) {
      const response = await admin.messaging().sendEachForMulticast(
        buildAlertMulticast({
          tokens,
          title,
          body: message,
          channelId: 'duty-alerts',
          sound: 'default',
          data: {
            booking_token,
            cancelled_by_token,
            cancelled_by_role,
            owner_token,
            reason: reason || '',
            type: 'BOOKING_CANCELLED',
          },
          collapseKey: `booking_cancel_${booking_token}`,
        })
      );

      await cleanupInvalidTokens({
        response,
        tokens,
        DeviceModel: VendorDevice,
        ownerField: 'vendor_token',
        ownerValue: owner_token,
      });
    }
  },
  {
    connection: bullConnection,
    concurrency: 5,
  }
);