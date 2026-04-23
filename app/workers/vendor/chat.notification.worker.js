const { Worker } = require("bullmq");
const bullConnection = require("../../config/bullMq.js");
const db = require("../../models/index.js");
const admin = require("../../config/firebase.js");

const { buildAlertMulticast } = require("../../shared/utils/fcmMessage.js");
const { cleanupInvalidTokens } = require("../../shared/utils/fcmCleanup.js");

const Vendor = db.vendor;
const VendorDevice = db.vendor_device_fcm;

new Worker(
  "chat-notification",
  async (job) => {
    try {
      const { sender_token, receiver_token, title, message, payload } = job.data;

      if (!receiver_token) {
        return true;
      }

      const receiverVendor = await Vendor.findOne({
        where: { token: receiver_token },
        attributes: ["id", "token", "first_name", "last_name", "contact"],
        raw: true,
      });

      if (!receiverVendor) {
        return true;
      }

      const receiverDevices = await VendorDevice.findAll({
        where: { vendor_token: receiver_token, flag: 0 || false },
        attributes: ["vendor_token", "fcm_token", "device_id", "platform"],
        raw: true,
      });

      if (!receiverDevices || !receiverDevices.length) {
        return true;
      }

      const tokens = [
        ...new Set(
          receiverDevices
            .map((item) => String(item?.fcm_token || "").trim())
            .filter(Boolean)
        ),
      ];

      if (!tokens.length) {
        console.log("No valid FCM tokens found for:", receiver_token);
        return true;
      }

      const bookingId = String(
        payload?.booking?.id ??
        payload?.booking?.booking_id ??
        ""
      );

      const bookingToken = String(payload?.booking?.token ?? "");

      const firebasePayload = buildAlertMulticast({
        tokens,
        title: title || "New Message",
        body: message || "You have a new message",
        channelId: "chat-messages",
        sound: "default",
        data: {
          notification_type: String(payload?.type || "NEW_CHAT"),
          conversation_token: String(payload?.conversation?.token || ""),
          booking_id: bookingId,
          booking_token: bookingToken,
          pickup_location: String(payload?.booking?.pickup_location || ""),
          vehicle_type: String(payload?.booking?.vehicle_type || ""),
          sender_token: String(payload?.sender?.token || sender_token || ""),
          sender_name: String(payload?.sender?.name || ""),
          receiver_token: String(receiver_token || ""),
          owner_token: String(payload?.owner?.token || ""),
          owner_name: String(payload?.owner?.name || ""),
          requester_token: String(payload?.requester?.token || ""),
          message_token: String(payload?.message?.token || ""),
          chat_message_type: String(payload?.message?.type || "TEXT"),
          message_text: String(payload?.message?.text || ""),
          attachment_url: String(payload?.message?.attachment_url || ""),
          created_at: String(payload?.message?.created_at || ""),
        },
        collapseKey: `chat_${payload?.conversation?.token || receiver_token}`,
      });

      const response = await admin.messaging().sendEachForMulticast(firebasePayload);

      await cleanupInvalidTokens({
        response,
        tokens,
        DeviceModel: VendorDevice,
        ownerField: "vendor_token",
        ownerValue: receiver_token,
      });

      return true;
    } catch (error) {
      console.error("chat-notification worker error:", {
        message: error?.message,
        code: error?.code,
        stack: error?.stack,
        raw: error,
      });
      throw error;
    }
  },
  {
    connection: bullConnection,
    concurrency: 3,
  }
);