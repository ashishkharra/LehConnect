const { Worker } = require("bullmq");
const bullConnection = require("../../config/bullMq.js");
const db = require("../../models/index.js");
const admin = require("../../config/firebase.js");

const { buildAlertMulticast } = require("../../shared/utils/fcmMessage.js");
const { cleanupInvalidTokens } = require("../../shared/utils/fcmCleanup.js");

const Notification = db.notification;
const CustomerDevice = db.customer_device_fcm || db.user_device_fcm || db.device_fcm;

new Worker(
  "customer-notification",
  async (job) => {
    try {
      const {
        sender_token,
        receiver_token,
        receiver_role,
        booking_token,
        type,
        title,
        message,
        payload,
      } = job.data;

      await Notification.create({
        sender_token: sender_token || null,
        receiver_token,
        receiver_role: receiver_role || "customer",
        booking_token: booking_token || null,
        type: type || "CUSTOMER_NOTIFICATION",
        title: title || "Notification",
        message: message || "",
        visibility: "private",
      });

      const devices = await CustomerDevice.findAll({
        where: { customer_token: receiver_token, flag: 0 },
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
          title: title || "Notification",
          body: message || "",
          channelId: "customer-alerts",
          sound: "default",
          data: {
            type: type || "CUSTOMER_NOTIFICATION",
            booking_token: booking_token || "",
            sender_token: sender_token || "",
            receiver_token: receiver_token || "",
            payload: payload ? JSON.stringify(payload) : "",
          },
          collapseKey: `customer_${booking_token || receiver_token}`,
        })
      );

      await cleanupInvalidTokens({
        response,
        tokens,
        DeviceModel: CustomerDevice,
        ownerField: "customer_token",
        ownerValue: receiver_token,
      });

      return true;
    } catch (error) {
      console.error("customer-notification worker error:", error);
      throw error;
    }
  },
  {
    connection: bullConnection,
    concurrency: 3,
  }
);