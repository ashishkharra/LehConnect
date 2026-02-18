const { Worker } = require('bullmq');
const bullConnection = require('../../../config/bullMq');
const db = require('../../../models/index');
const { Op, Sequelize } = require('sequelize');
const admin = require('../../../config/firebase');

const Booking = db.booking;
const Vendor = db.vendor;
const Notification = db.notification;

const normalizeCity = (city) =>
  `city_${String(city || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')}`;

new Worker(
  'booking',
  async job => {
    if (job.name !== 'BOOKING_CREATED') return;

    const { bookingToken } = job.data;

    const booking = await Booking.findOne({
      where: { token: bookingToken }
    });
    if (!booking) return;

    const vendors = await Vendor.findAll({
      where: Sequelize.and(
        { flag: 0 },
        { token: { [Op.ne]: booking.vendor_token } },
        { booking_notification_enabled: true },
        Sequelize.literal(
          `JSON_CONTAINS(preferred_cities, '"${booking.city}"')`
        )
      ),
      attributes: ['token'],
      raw: true
    });

    if (vendors.length) {
      await Notification.bulkCreate(
        vendors.map(v => ({
          receiver_token: v.token,
          receiver_role: 'vendor',
          booking_token: booking.token,
          type: 'BOOKING_CREATED',
          title: 'New Duty Alert!',
          message: `A new ${booking.vehicle_type} trip is available in ${booking.city}`,
          city: booking.city,
          state: booking.state,
          is_read: false
        }))
      );
    }

    const topic = normalizeCity(booking.city);

    try {
      await admin.messaging().send({
        topic,
        notification: {
          title: 'New Duty Alert! 🚗',
          body: `New ${booking.vehicle_type} available in ${booking.city}.`
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'duty-alerts',
            sound: 'villian'
          }
        },
        data: {
          booking_token: booking.token,
          type: 'BOOKING_CREATED'
        }
      });

    } catch (err) {
      console.error('[BOOKING_WORKER] FCM ERROR:', err);
    }
  },
  {
    connection: bullConnection,
    concurrency: 3
  }
);