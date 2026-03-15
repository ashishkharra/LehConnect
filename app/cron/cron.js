const cron = require('node-cron');
const { Op } = require('sequelize');
const db = require('../models');
// const { getIO } = require('../sockets/index');
const { remindPartialVendors } = require('../controller/adminController.js')
const { freeVehicleExpiredQueue, freeVehicleRequestExpiredQueue } = require('../queues/vendor/freeVehicle_queue/free_vehicle_cron.queue.js')
const bookingExpiredQueue = require('../queues/vendor/booking_queue/booking_cron.queue.js')
const {queuePartialVendorReminder} = require('../controller/adminController.js')


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

        const vehicleTokens = expiredVehicles.map(v => v.token).filter(Boolean);

        if (vehicleTokens.length > 0) {
          await FreeVehicle.update(
            { status: 'EXPIRED' },
            {
              where: {
                token: { [Op.in]: vehicleTokens }
              },
              transaction
            }
          );

          expiredRequests = await FreeVehicleRequest.findAll({
            where: {
              free_vehicle_token: { [Op.in]: vehicleTokens },
              status: 'PENDING'
            },
            transaction,
            lock: transaction.LOCK.UPDATE
          });

          if (expiredRequests.length > 0) {
            await FreeVehicleRequest.update(
              { status: 'EXPIRED' },
              {
                where: {
                  id: { [Op.in]: expiredRequests.map(r => r.id) }
                },
                transaction
              }
            );
          }
        }

        await transaction.commit();

        console.log(
          `[CRON] Vehicles expired: ${expiredVehicles.length}, Requests expired: ${expiredRequests.length}`
        );
      } catch (error) {
        if (!transaction.finished) {
          await transaction.rollback();
        }
        console.error('[CRON] Free vehicle DB error:', error);
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
              [Op.lte]: new Date(Date.now() - 12 * 60 * 60 * 1000)
            }
          },
          transaction,
          lock: transaction.LOCK.UPDATE
        });

        const expiredBookingTokens = expiredBookings.map(b => b.token).filter(Boolean);

        if (expiredBookingTokens.length > 0) {
          await Booking.update(
            { status: 'EXPIRED' },
            {
              where: {
                token: { [Op.in]: expiredBookingTokens },
                status: 'OPEN'
              },
              transaction
            }
          );
        }

        await transaction.commit();

        console.log(`[CRON] Bookings expired: ${expiredBookings.length}`);
      } catch (error) {
        if (!transaction.finished) {
          await transaction.rollback();
        }
        console.error('[CRON] Booking expiry DB error:', error);
      }
    });
  },

  partialStatusReminder: () => {
    cron.schedule('0 10 * * *', async () => {
      console.log('[CRON] Partial verification reminder started');

      try {
        await queuePartialVendorReminder({
          triggeredBy: 'CRON',
          requestedBy: 'SYSTEM'
        });

        console.log('[CRON] Partial verification reminder completed');
      } catch (error) {
        console.error('[CRON] Partial verification reminder failed:', error);
      }
    });
  }
}