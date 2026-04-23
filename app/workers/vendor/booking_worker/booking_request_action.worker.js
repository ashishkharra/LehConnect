const { Worker } = require("bullmq");
const bullConnection = require("../../../config/bullMq");
const db = require("../../../models/index");
const admin = require("../../../config/firebase");

const { buildAlertMulticast } = require("../../../shared/utils/fcmMessage");
const { cleanupInvalidTokens } = require("../../../shared/utils/fcmCleanup");

const Notification = db.notification;
const VendorDevice = db.vendor_device_fcm;

new Worker(
  "booking-request-action-notification",
  async (job) => {
    try {
      const {
        bookingToken,
        requestToken,
        sender_token,
        owner_token,
        type,
        title,
        message,
      } = job.data;

      await Notification.create({
        sender_token: sender_token || null,
        receiver_token: owner_token,
        receiver_role: "vendor",
        booking_token: bookingToken,
        type: type || "BOOKING_REQUEST_ACTION",
        title: title || "Booking Update",
        message: message || "",
        visibility: "private",
      });

      const devices = await VendorDevice.findAll({
        where: { vendor_token: owner_token, flag: 0 || false },
        attributes: ["fcm_token"],
        raw: true,
      });

      const tokens = [
        ...new Set(
          devices.map((d) => String(d.fcm_token || "").trim()).filter(Boolean)
        ),
      ];

      if (!tokens.length) return true;

      const response = await admin.messaging().sendEachForMulticast(
        buildAlertMulticast({
          tokens,
          title: title || "Booking Update",
          body: message || "",
          channelId: "booking-actions",
          sound: "default",
          data: {
            booking_token: bookingToken || "",
            request_token: requestToken || "",
            sender_token: sender_token || "",
            owner_token: owner_token || "",
            type: type || "BOOKING_REQUEST_ACTION",
          },
          collapseKey: `booking_action_${bookingToken || requestToken}`,
        })
      );

      await cleanupInvalidTokens({
        response,
        tokens,
        DeviceModel: VendorDevice,
        ownerField: "vendor_token",
        ownerValue: owner_token,
      });

      return true;
    } catch (error) {
      console.error("booking_request_action worker error:", error);
      throw error;
    }
  },
  {
    connection: bullConnection,
    concurrency: 5,
  }
);