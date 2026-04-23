const { Worker } = require("bullmq");
const bullConnection = require("../../../config/bullMq");
const db = require("../../../models/index");
const admin = require("../../../config/firebase");

const { buildAlertMulticast } = require("../../../shared/utils/fcmMessage");
const { cleanupInvalidTokens } = require("../../../shared/utils/fcmCleanup");

const Notification = db.notification;
const VendorDevice = db.vendor_device_fcm;

new Worker(
  "free-vehicle-request-action-notification",
  async (job) => {
    try {
      const {
        free_vehicle_token,
        request_token,
        sender_token,
        owner_token,
        title,
        message,
        type,
      } = job.data;

      await Notification.create({
        sender_token: sender_token || null,
        receiver_token: owner_token,
        receiver_role: "vendor",
        type: type || "FREE_VEHICLE_REQUEST_ACTION",
        title: title || "Vehicle Request Update",
        message: message || "Vehicle request action updated",
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
          title: title || "Vehicle Request Update",
          body: message || "Vehicle request action updated",
          channelId: "duty-alerts",
          sound: "default",
          data: {
            free_vehicle_token: free_vehicle_token || "",
            request_token: request_token || "",
            sender_token: sender_token || "",
            owner_token: owner_token || "",
            type: type || "FREE_VEHICLE_REQUEST_ACTION",
          },
          collapseKey: `free_vehicle_request_action_${free_vehicle_token || request_token}`,
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
      console.error("free_vehicle_request_action worker error:", error);
      throw error;
    }
  },
  {
    connection: bullConnection,
    concurrency: 5,
  }
);