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

    let title = '';
    let message = '';
    let type = '';

    /** -------------------------------
     *  JOB TYPE HANDLING
     *  ------------------------------- */
    switch (job.name) {

      case 'FREE_VEHICLE_BOOKED':
        type = 'FREE_VEHICLE_BOOKED';
        title = 'Vehicle Booked 🚗';
        message = `Your ${vehicle_type} has been booked in ${city}`;
        break;

      case 'FREE_VEHICLE_REQUESTED':
        type = 'FREE_VEHICLE_REQUEST_RECEIVED';
        title = 'New Vehicle Request 📩';
        message = `New request for your ${vehicle_type} in ${city}`;
        break;

      case 'FREE_VEHICLE_REQUEST_ACCEPTED':
        type = 'FREE_VEHICLE_REQUEST_ACCEPTED';
        title = 'Request Accepted ✅';
        message = `Your request for ${vehicle_type} in ${city} was accepted`;
        break;

      case 'FREE_VEHICLE_REQUEST_REJECTED':
        type = 'FREE_VEHICLE_REQUEST_REJECTED';
        title = 'Request Rejected ❌';
        message = `Your request for ${vehicle_type} in ${city} was rejected`;
        break;

      default:
        console.warn('[FREE VEHICLE WORKER] Unknown job:', job.name);
        return;
    }

    /** -------------------------------
     *  DB NOTIFICATION
     *  ------------------------------- */
    await Notification.create({
      sender_token: requester_token || owner_token,
      receiver_token: owner_token,
      receiver_role: 'vendor',
      free_vehicle_token,
      type,
      title,
      message,
      visibility: 'private'
    });

    /** -------------------------------
     *  PUSH NOTIFICATION (FCM)
     *  ------------------------------- */
    const devices = await VendorDevice.findAll({
      where: { vendor_token: owner_token },
      attributes: ['fcm_token'],
      raw: true
    });

    if (devices.length > 0) {
      await admin.messaging().sendEachForMulticast({
        tokens: devices.map(d => d.fcm_token),
        notification: {
          title,
          body: message
        },
        data: {
          type,
          free_vehicle_token
        }
      });
    }
  },
  {
    connection: bullConnection,
    concurrency: 5
  }
);