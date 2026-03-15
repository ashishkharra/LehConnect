const { Worker } = require('bullmq');
const bullConnection = require('../../../config/bullMq');
const db = require('../../../models');
const admin = require('../../../config/firebase');

const Notification = db.notification;
const VendorDevice = db.vendor_device_fcm;

new Worker(
  'booking-completion-notification',
  async (job) => {
    const {
      booking_token,
      owner_token,
      assigned_vendor_token,
      sender_token,
      vehicle_type,
      city,
      remarks,
      completion_proof
    } = job.data;

    let receiver_token = null;
    let title = '';
    let message = '';
    let type = '';

    switch (job.name) {
      case 'BOOKING_COMPLETION_REQUESTED':
        type = 'BOOKING_COMPLETION_REQUESTED';
        receiver_token = owner_token;
        title = 'Completion Requested';
        message = `The assigned vendor has marked the ${vehicle_type || 'booking'} as completed${city ? ` in ${city}` : ''}. Please confirm.`;
        break;

      case 'BOOKING_COMPLETION_CONFIRMED':
        type = 'BOOKING_COMPLETION_CONFIRMED';
        receiver_token = assigned_vendor_token;
        title = 'Completion Confirmed ✅';
        message = `Your ${vehicle_type || 'booking'} completion was confirmed${city ? ` in ${city}` : ''}.`;
        break;

      case 'BOOKING_COMPLETION_REJECTED':
        type = 'BOOKING_COMPLETION_REJECTED';
        receiver_token = assigned_vendor_token;
        title = 'Completion Rejected ❌';
        message = `Your ${vehicle_type || 'booking'} completion was rejected${city ? ` in ${city}` : ''}.`;
        break;

      case 'BOOKING_AUTO_COMPLETED':
        type = 'BOOKING_AUTO_COMPLETED';
        receiver_token = assigned_vendor_token;
        title = 'Booking Auto Completed';
        message = `Your ${vehicle_type || 'booking'} was auto-completed${city ? ` in ${city}` : ''}.`;
        break;

      default:
        console.warn('[BOOKING COMPLETION WORKER] Unknown job:', job.name);
        return;
    }

    if (!receiver_token) {
      console.warn('[BOOKING COMPLETION WORKER] Missing receiver token for job:', job.name);
      return;
    }

    // Save notification in DB
    await Notification.create({
      sender_token: sender_token || owner_token || assigned_vendor_token,
      receiver_token,
      receiver_role: 'vendor',
      booking_token,
      type,
      title,
      message,
      visibility: 'private',
      meta: {
        remarks: remarks || null,
        completion_proof: completion_proof || null
      }
    });

    // Send push notification
    const devices = await VendorDevice.findAll({
      where: { vendor_token: receiver_token },
      attributes: ['fcm_token'],
      raw: true
    });

    const tokens = devices
      .map(d => d.fcm_token)
      .filter(Boolean);

    if (tokens.length > 0) {
      await admin.messaging().sendEachForMulticast({
        tokens,
        notification: {
          title,
          body: message
        },
        data: {
          type,
          booking_token: String(booking_token || ''),
          owner_token: String(owner_token || ''),
          assigned_vendor_token: String(assigned_vendor_token || '')
        }
      });
    }
  },
  {
    connection: bullConnection,
    concurrency: 5
  }
);