const cron = require('node-cron');
const { Op } = require('sequelize');
const db = require('../models');
const { getIO } = require('../sockets/index');
const { remindPartialVendors } = require('../controller/adminController.js')
const { freeVehicleExpiredQueue, freeVehicleRequestExpiredQueue } = require('../queues/vendor/freeVehicle_queue/free_vehicle_cron.queue.js')
const bookingExpiredQueue = require('../queues/vendor/booking_queue/booking_cron.queue.js')

const FreeVehicle = db.freeVehicle;
const FreeVehicleRequest = db.requestFreeVehicle;
const Vendor = db.vendor;
const Notification = db.notification;
const Booking = db.booking

module.exports = {
  vehicleCron: () => {
    cron.schedule('0 */5 * * * *', async () => {
      console.log('[CRON] Free vehicle cleanup started');

      const transaction = await db.sequelize.transaction();

      let expiredVehicles = [];
      let expiredRequests = [];

      try {
        const now = new Date();

        expiredVehicles = await FreeVehicle.findAll({
          where: {
            free_end_time: { [Op.lt]: now },
            status: { [Op.in]: ['AVAILABLE', 'REQUESTED'] }
          },
          transaction,
          lock: transaction.LOCK.UPDATE
        });

        const vehicleTokens = expiredVehicles.map(v => v.token);

        if (vehicleTokens.length) {
          await FreeVehicle.update(
            { status: 'EXPIRED' },
            {
              where: { token: vehicleTokens },
              transaction
            }
          );
        }

        expiredRequests = await FreeVehicleRequest.findAll({
          where: {
            free_vehicle_token: { [Op.in]: vehicleTokens },
            status: 'PENDING'
          },
          transaction,
          lock: transaction.LOCK.UPDATE
        });

        if (expiredRequests.length) {
          await FreeVehicleRequest.update(
            { status: 'EXPIRED' },
            {
              where: { id: expiredRequests.map(r => r.id) },
              transaction
            }
          );
        }

        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        console.error('[CRON] Free vehicle DB error:', error);
        return;
      }

      try {
        const io = getIO();
        for (const vehicle of expiredVehicles) {
          io.to(`vendor:${vehicle.vendor_token}`).emit(
            'free_vehicle_event',
            {
              event: 'FREE_VEHICLE_EXPIRED',
              vehicleToken: vehicle.token
            }
          );
          await freeVehicleExpiredQueue.add(
            'FREE_VEHICLE_EXPIRED',
            {
              free_vehicle_token: vehicle.token,
              owner_token: vehicle.vendor_token
            }
          );
        }

        for (const request of expiredRequests) {
          io.to(`vendor:${request.requested_by_vendor_token}`).emit(
            'free_vehicle_event',
            {
              event: 'FREE_VEHICLE_REQUEST_EXPIRED',
              freeVehicleToken: request.free_vehicle_token
            }
          );

          await freeVehicleRequestExpiredQueue.add(
            'FREE_VEHICLE_REQUEST_EXPIRED',
            {
              free_vehicle_token: request.free_vehicle_token,
              requester_token: request.requested_by_vendor_token
            }
          );
        }

        console.log(
          `[CRON] Vehicles expired: ${expiredVehicles.length}, Requests expired: ${expiredRequests.length}`
        );
      } catch (notifyError) {
        console.error('[CRON] Notification error:', notifyError);
      }
    });
  },

  bookingCron: () => {
    cron.schedule('0 */5 * * * *', async () => {
      console.log(`[CRON] Booking expiry started at ${new Date().toISOString()}`);

      const transaction = await db.sequelize.transaction();
      let expiredBookings = [];

      try {
        expiredBookings = await Booking.findAll({
          where: {
            status: 'OPEN',
            created_at: {
              [Op.lte]: new Date(Date.now() - 24 * 60 * 60 * 1000)
            }
          },
          transaction,
          lock: transaction.LOCK.UPDATE
        });

        const expiredBookingTokens = expiredBookings.map(b => b.token);

        if (expiredBookingTokens.length) {
          await Booking.update(
            { status: 'EXPIRED' },
            {
              where: { token: expiredBookingTokens, status: 'OPEN' },
              transaction
            }
          );
        }

        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        console.error('[CRON] Booking expiry DB error:', error);
        return;
      }

      try {
        const io = getIO();

        for (const booking of expiredBookings) {
          io.to(`vendor:${booking.vendor_token}`).emit('booking:event', {
            event: 'BOOKING_EXPIRED',
            booking_token: booking.token,
            vendor_token: booking.vendor_token
          });
        }

        console.log(`[CRON] Booking foreground sockets emitted: ${expiredBookings.length}`);
      } catch (socketErr) {
        console.error('[CRON] Booking socket error:', socketErr);
      }

      try {
        for (const booking of expiredBookings) {
          await bookingExpiredQueue.add('BOOKING_EXPIRED', {
            receiver_token: booking.vendor_token,
            type: 'BOOKING_EXPIRED',
            title: 'Booking expired',
            message: 'Your booking expired due to no action within 24 hours.',
            payload: { booking_token: booking.token }
          });
        }

        console.log(`[CRON] Booking notifications queued: ${expiredBookings.length}`);
      } catch (queueErr) {
        console.error('[CRON] Booking queue error:', queueErr);
      }
    });
  },

  partialStatusReminder: () => {
    cron.schedule('0 10 * * *', async () => {
      console.log('[CRON] Partial verification reminder started');

      try {
        await remindPartialVendors({ triggeredBy: 'CRON' });

        console.log('[CRON] Partial verification reminder completed');

      } catch (error) {
        console.error('[CRON] Partial verification reminder failed:', error);
      }
    });
  }
}