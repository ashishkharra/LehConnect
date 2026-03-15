const { Worker } = require('bullmq');
const bullConnection = require('../../../config/bullMq');
const db = require('../../../models/index');
const { Op, Sequelize } = require('sequelize');
const admin = require('../../../config/firebase');

const Booking = db.booking;
const Vendor = db.vendor;
const Notification = db.notification;
const SiteSetting = db.siteSettings

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

    const formattedPickupDate = booking.pickupDate.toLocaleString('en-IN');

    if (!booking) return;

    const notificationAccess = await SiteSetting.findOne({
      attributes: [
        'send_to_all_cities',
        'city_filter_enabled'
      ],
      raw: true
    });

    if (!notificationAccess) return;

    const {
      send_to_all_cities,
      city_filter_enabled,
    } = notificationAccess;

    if (!send_to_all_cities && !city_filter_enabled) {
      console.log('[BOOKING_WORKER] Notifications disabled.');
      return;
    }

    let whereCondition = {
      flag: 0,
      token: { [Op.ne]: booking.vendor_token },
      booking_notification_enabled: true
    };


    const vendors = await Vendor.findAll({
      where: whereCondition,
      attributes: ['token'],
      raw: true
    });

    if (!vendors.length) {
      console.log('[BOOKING_WORKER] No vendors matched.');
      return;
    }

    await Notification.bulkCreate(
      vendors.map(v => ({
        receiver_token: v.token,
        receiver_role: 'vendor',
        booking_token: booking.token,
        type: 'BOOKING_CREATED',
        title: 'LehConnect Required',
        message: `${booking.city} में ${formattedPickupDate} पर ${booking.drop_location} के लिए नई ${booking.vehicle_type} ट्रिप उपलब्ध है`,
        city: booking.city,
        state: booking.state,
        is_read: false
      }))
    );

    try {

      if (city_filter_enabled) {
        const topic = normalizeCity(booking.city);

        await admin.messaging().send({
          topic,
          notification: {
            title: 'LehConnect Required',
            body: `${booking.city} में ${formattedPickupDate} पर ${booking.drop_location} के लिए नई ${booking.vehicle_type} ट्रिप उपलब्ध है`
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

      } else if (send_to_all_cities) {
        await admin.messaging().send({
          topic: 'all_vendors',
          notification: {
            title: 'New Duty Alert! 🚗',
            body: `${booking.city} में ${formattedPickupDate} पर ${booking.drop_location} के लिए नई ${booking.vehicle_type} ट्रिप उपलब्ध है`
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
      }

    } catch (err) {
      console.error('[BOOKING_WORKER] FCM ERROR:', err);
    }

  },
  {
    connection: bullConnection,
    concurrency: 3
  }
);