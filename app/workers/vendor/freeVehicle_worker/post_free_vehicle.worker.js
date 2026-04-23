const { Worker } = require('bullmq');
const bullConnection = require('../../../config/bullMq');
const db = require('../../../models');
const admin = require('../../../config/firebase');

const { buildAlertMulticast } = require('../../../shared/utils/fcmMessage');
const { cleanupInvalidTokens } = require('../../../shared/utils/fcmCleanup');

const Notification = db.notification;
const VendorDevice = db.vendor_device_fcm;

new Worker(
  'post-free-vehicle-notification',
  async (job) => {
    try {
      const {
        free_vehicle_token,
        owner_token,
        requester_token,
        vehicle_type,
        city,
        state
      } = job.data;

      if (!owner_token) {
        console.log('[FREE_VEHICLE_NOTIFICATION] owner_token missing', job.data);
        return true;
      }

      const sendPushToOwner = async ({ title, message, type }) => {
        await Notification.create({
          receiver_token: owner_token,
          receiver_role: 'vendor',
          booking_token: null,
          free_vehicle_token: free_vehicle_token,
          type,
          title,
          message,
          city,
          state,
          is_read: false
        });

        const devices = await VendorDevice.findAll({
          where: {
            vendor_token: owner_token,
            flag: 0
          },
          attributes: ['fcm_token'],
          raw: true
        });

        const tokens = [
          ...new Set(
            devices.map((d) => String(d.fcm_token || '').trim()).filter(Boolean)
          )
        ];

        console.log('[FREE_VEHICLE_NOTIFICATION] tokens =>', tokens);

        if (!tokens.length) {
          console.log('[FREE_VEHICLE_NOTIFICATION] no active tokens found');
          return true;
        }

        const response = await admin.messaging().sendEachForMulticast(
          buildAlertMulticast({
            tokens,
            title,
            body: message,
            channelId: 'duty-alerts',
            sound: 'default',
            data: {
              free_vehicle_token: String(free_vehicle_token || ''),
              requester_token: String(requester_token || ''),
              owner_token: String(owner_token || ''),
              notification_type: String(type || '')
            },
            collapseKey: `free_vehicle_${type}_${free_vehicle_token || owner_token}`
          })
        );

        console.log('[FREE_VEHICLE_NOTIFICATION] successCount =>', response.successCount);
        console.log('[FREE_VEHICLE_NOTIFICATION] failureCount =>', response.failureCount);

        await cleanupInvalidTokens({
          response,
          tokens,
          DeviceModel: VendorDevice,
          ownerField: 'vendor_token',
          ownerValue: owner_token
        });

        return true;
      };

      if (job.name === 'FREE_VEHICLE_POSTED') {
        return true;
      }

      if (job.name === 'FREE_VEHICLE_REQUESTED') {
        return await sendPushToOwner({
          title: 'New Vehicle Request',
          message: `A vendor requested your ${vehicle_type || 'vehicle'} in ${city || 'your city'}. Please review the request and respond soon.`,
          type: 'FREE_VEHICLE_REQUESTED'
        });
      }

      if (job.name === 'FREE_VEHICLE_BOOKED') {
        return await sendPushToOwner({
          title: 'Vehicle Booked',
          message: `Your ${vehicle_type || 'vehicle'} in ${city || 'your city'} has been booked successfully. Please check the booking details for further action.`,
          type: 'FREE_VEHICLE_BOOKED'
        });
      }

      return true;
    } catch (error) {
      console.error('[FREE_VEHICLE_NOTIFICATION] worker error:', error);
      throw error;
    }
  },
  {
    connection: bullConnection,
    concurrency: 3
  }
);