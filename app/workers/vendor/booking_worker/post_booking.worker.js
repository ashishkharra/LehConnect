const { Worker } = require("bullmq");
const bullConnection = require("../../../config/bullMq");
const db = require("../../../models/index");
const admin = require("../../../config/firebase");

const { buildAlertMulticast } = require("../../../shared/utils/fcmMessage");
const { cleanupInvalidTokens } = require("../../../shared/utils/fcmCleanup");

const Notification = db.notification;
const VendorDevice = db.vendor_device_fcm;

console.log("post_booking.worker loaded");

new Worker(
  "booking_v2",
  async (job) => {
    try {
      if (job.name !== "BOOKING_CREATED") return true;

      const {
        booking_token,
        sender_token,
        owner_token,
        title,
        message,
        type,
      } = job.data;


      if (!owner_token) {
        console.error("BOOKING_CREATED worker: owner_token missing", job.data);
        return false;
      }

      const finalTitle = title || "New Booking";
      const finalMessage = message || "A new booking has been created";
      const finalType = type || "NEW_BOOKING";

      await Notification.create({
        sender_token: sender_token || null,
        receiver_token: owner_token,
        receiver_role: "vendor",
        booking_token,
        type: finalType,
        title: finalTitle,
        message: finalMessage,
        visibility: "private",
      });

      // const ons = await sendOneSignalPush({
      //   externalIds: [String(owner_token)],
      //   title: finalTitle,
      //   message: finalMessage,
      //   data: {
      //     booking_token: booking_token || "",
      //     sender_token: sender_token || "",
      //     owner_token: owner_token || "",
      //     type: finalType,
      //   },
      // });

      // console.log("one signal response ->>> ", ons);

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
          title: finalTitle,
          body: finalMessage,
          channelId: "duty-alerts",
          sound: "default",
          data: {
            booking_token: booking_token || "",
            sender_token: sender_token || "",
            owner_token: owner_token || "",
            type: finalType,
          },
          collapseKey: `post_booking_${booking_token}`,
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
      console.error("post_booking worker error:", error);
      throw error;
    }
  },
  {
    connection: bullConnection,
    concurrency: 5,
  }
);