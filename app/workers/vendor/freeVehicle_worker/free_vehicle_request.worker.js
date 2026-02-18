const { Worker } = require('bullmq');
const bullConnection = require('../../../config/bullMq');
const db = require('../../../models');
const admin = require('../../../config/firebase');

const Notification = db.notification;
const VendorDevice = db.vendor_device_fcm;

new Worker(
  'free-vehicle-notification',
  async job => {

    const {
      free_vehicle_token,
      owner_token,
      requester_token,
      vehicle_type,
      city
    } = job.data;

    let title, message, type;

    if (job.name === 'FREE_VEHICLE_BOOKED') {
      type = 'FREE_VEHICLE_BOOKED';
      title = 'Vehicle Booked';
      message = `${vehicle_type} has been booked in ${city}`;
    }

    if (job.name === 'FREE_VEHICLE_REQUESTED') {
      type = 'FREE_VEHICLE_REQUEST_RECEIVED';
      title = 'New Vehicle Request';
      message = `New request for your ${vehicle_type} in ${city}`;
    }

    // 🗂 DB notification
    await Notification.create({
      sender_token: requester_token,
      receiver_token: owner_token,
      receiver_role: 'vendor',
      free_vehicle_token,
      type,
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
          type
        }
      });
    }
  },
  {
    connection: bullConnection,
    concurrency: 5
  }
);
