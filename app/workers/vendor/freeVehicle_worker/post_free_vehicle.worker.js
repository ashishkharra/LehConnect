const { Worker } = require('bullmq');
const bullConnection = require('../../../config/bullMq');
const db = require('../../../models');
const admin = require('../../../config/firebase');

const Notification = db.notification;

new Worker(
  'post-free-vehicle-notification',
  async (job) => {
    const {
      free_vehicle_token,
      owner_token,
      requester_token,
      vehicle_type,
      city,
      state
    } = job.data;

    if (job.name === 'FREE_VEHICLE_REQUESTED') {
      await Notification.create({
        receiver_token: owner_token,
        receiver_role: 'vendor',
        booking_token: null,
        free_vehicle_token: free_vehicle_token,
        type: 'FREE_VEHICLE_REQUESTED',
        title: 'New Vehicle Request',
        message: `A vendor requested your ${vehicle_type} in ${city}.`,
        city,
        state,
        is_read: false
      });

      await admin.messaging().send({
        topic: `vendor_${owner_token}`,
        notification: {
          title: 'New Vehicle Request',
          body: `A vendor requested your ${vehicle_type} in ${city}.`
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'duty-alerts',
            sound: 'villian'
          }
        },
        data: {
          free_vehicle_token,
          requester_token,
          type: 'FREE_VEHICLE_REQUESTED'
        }
      });

      return;
    }

    if (job.name === 'FREE_VEHICLE_BOOKED') {
      await Notification.create({
        receiver_token: owner_token,
        receiver_role: 'vendor',
        booking_token: null,
        free_vehicle_token: free_vehicle_token,
        type: 'FREE_VEHICLE_BOOKED',
        title: 'Vehicle Booked',
        message: `Your ${vehicle_type} in ${city} has been booked.`,
        city,
        state,
        is_read: false
      });

      await admin.messaging().send({
        topic: `vendor_${owner_token}`,
        notification: {
          title: 'Vehicle Booked',
          body: `Your ${vehicle_type} in ${city} has been booked.`
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'duty-alerts',
            sound: 'villian'
          }
        },
        data: {
          free_vehicle_token,
          requester_token,
          type: 'FREE_VEHICLE_BOOKED'
        }
      });

      return;
    }
  },
  {
    connection: bullConnection,
    concurrency: 3
  }
);