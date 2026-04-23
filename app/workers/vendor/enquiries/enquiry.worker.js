const { Worker } = require("bullmq");
const bullConnection = require("../../../config/bullMq");
const db = require("../../../models/index");
const admin = require("../../../config/firebase");

const { buildAlertMulticast } = require("../../../shared/utils/fcmMessage");
const { cleanupInvalidTokens } = require("../../../shared/utils/fcmCleanup");

const Notification = db.notification;
const VendorDevice = db.vendor_device_fcm;

new Worker(
  "enquiry-notification",
  async (job) => {
    try {
      const {
        sender_token,
        receiver_token,
        receiver_role = "vendor",
        type,
        title,
        message,
        event,
        payload = {},
      } = job.data;

      if (!receiver_token) {
        return true;
      }

      const finalTitle = title || "New Enquiry";
      const finalMessage = message || "You have received a new enquiry.";
      const finalType = type || "NEW_ENQUIRY";

      await Notification.create({
        sender_token: sender_token || null,
        receiver_token,
        receiver_role,
        type: finalType,
        title: finalTitle,
        message: finalMessage,
        payload,
        visibility: "private",
      });

      const devices = await VendorDevice.findAll({
        where: {
          vendor_token: receiver_token,
          flag: 0 || false
        },
        attributes: ["fcm_token"],
        raw: true,
      });

      const tokens = [
        ...new Set(
          devices.map((d) => String(d.fcm_token || "").trim()).filter(Boolean)
        ),
      ];

      if (!tokens.length) {
        return true;
      }

      const response = await admin.messaging().sendEachForMulticast(
        buildAlertMulticast({
          tokens,
          title: finalTitle,
          body: finalMessage,
          channelId: "duty-alerts",
          sound: "default",
          data: {
            notification_type: String(finalType),
            event: String(event || "enquiry:new"),
            enquiry_token: String(payload?.enquiry?.token || ""),
            enquiry_id: String(payload?.enquiry?.id || ""),
            enquiry_module: String(payload?.module || ""),
            sender_token: String(sender_token || ""),
            receiver_token: String(receiver_token || ""),
          },
          collapseKey: `enquiry_${payload?.module || "general"}_${payload?.enquiry?.token || receiver_token}`,
        })
      );

      await cleanupInvalidTokens({
        response,
        tokens,
        DeviceModel: VendorDevice,
        ownerField: "vendor_token",
        ownerValue: receiver_token,
      });

      return true;
    } catch (error) {
      console.error("[ENQUIRY_NOTIFICATION_WORKER] ERROR:", error);
      throw error;
    }
  },
  {
    connection: bullConnection,
    concurrency: 5,
  }
);