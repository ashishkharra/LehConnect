const { Worker } = require('bullmq');
const bullConnection = require('../../../config/bullMq');
const db = require('../../../models');
const { Op, Sequelize } = require('sequelize');
const admin = require('../../../config/firebase');

const Vendor = db.vendor;
const Notification = db.notification;

new Worker(
  'post-free-vehicle-notification',
  async job => {
    if (job.name !== 'FREE_VEHICLE_POSTED') return;

    const { freeVehicleToken, city, state, vehicle_type, vendorToken } = job.data;

    const vendors = await Vendor.findAll({
      where: {
        flag: 0,
        booking_notification_enabled: true,
        token: { [Op.ne]: vendorToken },
        [Op.and]: Sequelize.literal(
          `JSON_CONTAINS(
            LOWER(JSON_EXTRACT(preferred_cities, '$')),
            LOWER('"${city}"')
          )`
        )
        // [Op.and]: Sequelize.literal(`JSON_CONTAINS(preferred_cities, '"${city}"')`)
      },
      attributes: ['first_name', 'last_name', 'token'],
      raw: true
    });

    if (!vendors.length) return;

    // 🔥 DB Notification
    await Notification.bulkCreate(
      vendors.map(v => ({
        receiver_token: v.token,
        receiver_role: 'vendor',
        booking_token: null,
        free_vehicle_token: freeVehicleToken,
        type: 'FREE_VEHICLE_POSTED',
        title: 'New Free Vehicle Available',
        message: `A ${vehicle_type} is available in ${city}.`,
        city,
        state,
        is_read: false
      }))
    );

    // 🔥 PUSH Notification (FCM Topic)
    const topic = `city_${city.toLowerCase().replace(/\s+/g, '_')}`;

    await admin.messaging().send({
      topic,
      notification: {
        title: 'New Free Vehicle Available 🚗',
        body: `A ${vehicle_type} is available in ${city}.`
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'duty-alerts',
          sound: 'villian'
        }
      },
      data: {
        free_vehicle_token: freeVehicleToken,
        type: 'FREE_VEHICLE_POSTED'
      }
    });
  },
  {
    connection: bullConnection,
    concurrency: 3
  }
);
