const { Worker } = require("bullmq");
const { Op } = require("sequelize");
const bullConnection = require("../../config/bullMq");
const db = require("../../models/index");
const admin = require("../../config/firebase");

const Notification = db.notification;

const Customer = db.customer;
const Vendor = db.vendor || db.Vendor || db.tbl_vendor;

const CustomerDeviceFcm = db.customer_device_fcm;
const VendorDeviceFcm = db.vendor_device_fcm;

console.log("[LEAD_REQUEST_OWNER_WORKER] Worker initializing...");

async function cleanupInvalidTokens(model, invalidTokens = []) {
  try {
    if (!model || !invalidTokens.length) return;

    await model.update(
      { flag: 1 },
      {
        where: {
          fcm_token: {
            [Op.in]: invalidTokens
          }
        }
      }
    );
  } catch (err) {
    console.log("[LEAD_REQUEST_OWNER_WORKER] cleanupInvalidTokens error:", err.message);
  }
}

function getEnquiryModel(enquiryType) {
  const enquiryModelMap = {
    cab: db.CabEnquiry,
    flight: db.flightEnquiry,
    hotel: db.hotelEnquiry,
    holiday_package: db.HolidayPackageEnquiry || db.holidayPackageEnquiry || db.holydaypackageEnquiry,
    insurance: db.InsuranceEnquiry || db.insuranceEnquiry
  };

  return enquiryModelMap[String(enquiryType || "").toLowerCase().trim()] || null;
}

new Worker(
  "lead-request-customer-notification",
  async (job) => {
    try {
      const {
        enquiry_type,
        enquiry_token,
        enquiry_request_token,
        requester_token,
        vendor_name,
        vendor_contact,
        title,
        message,
        meta = {}
      } = job.data;

      const normalizedType = String(enquiry_type || "").toLowerCase().trim();

      if (!normalizedType || !enquiry_token) {
        return {
          success: true,
          skipped: true,
          reason: "missing_enquiry_identity"
        };
      }

      const EnquiryModel = getEnquiryModel(normalizedType);

      if (!EnquiryModel) {
        return {
          success: true,
          skipped: true,
          reason: "invalid_enquiry_type"
        };
      }

      const enquiry = await EnquiryModel.findOne({
        where: {
          token: enquiry_token,
          flag: 0
        },
        attributes: [
          "id",
          "token",
          "customer_token",
          "vendor_token",
          "contact",
          "who_posted",
          "from_web"
        ],
        raw: true
      });

      if (!enquiry) {
        return {
          success: true,
          skipped: true,
          reason: "enquiry_not_found"
        };
      }

      const whoPosted = String(enquiry.who_posted || "").toUpperCase();

      let receiver = null;
      let receiverRole = null;
      let receiverToken = null;
      let deviceModel = null;
      let receiverDisplayName = null;

      if (whoPosted === "CUSTOMER") {
        receiver = await Customer.findOne({
          where: {
            flag: 0,
            [Op.or]: [
              enquiry.customer_token
                ? { token: enquiry.customer_token }
                : null,
              enquiry.contact
                ? { contact: enquiry.contact }
                : null
            ].filter(Boolean)
          },
          attributes: ["id", "token", "first_name", "last_name", "contact"],
          raw: true
        });

        if (!receiver) {
          return {
            success: true,
            skipped: true,
            reason: "customer_not_found"
          };
        }

        // requester ko notification mat bhejo
        if (
          requester_token &&
          String(receiver.token || "").trim() === String(requester_token).trim()
        ) {
          return {
            success: true,
            skipped: true,
            reason: "receiver_is_requester"
          };
        }

        receiverRole = "CUSTOMER";
        receiverToken = receiver.token;
        deviceModel = CustomerDeviceFcm;
        receiverDisplayName =
          `${receiver.first_name || ""} ${receiver.last_name || ""}`.trim() || "Customer";
      } else if (whoPosted === "VENDOR") {
        receiver = await Vendor.findOne({
          where: {
            flag: 0,
            [Op.or]: [
              enquiry.vendor_token
                ? { token: enquiry.vendor_token }
                : null,
              enquiry.contact
                ? { contact: enquiry.contact }
                : null
            ].filter(Boolean)
          },
          attributes: [
            "id",
            "token",
            "first_name",
            "last_name",
            "contact",
            "alt_contact",
            "email"
          ],
          raw: true
        });

        if (!receiver) {
          return {
            success: true,
            skipped: true,
            reason: "vendor_not_found"
          };
        }

        // requester vendor ko khud ki notification mat bhejo
        if (
          requester_token &&
          String(receiver.token || "").trim() === String(requester_token).trim()
        ) {
          return {
            success: true,
            skipped: true,
            reason: "receiver_is_requester"
          };
        }

        receiverRole = "VENDOR";
        receiverToken = receiver.token;
        deviceModel = VendorDeviceFcm;
        receiverDisplayName =
          `${receiver.first_name || ""} ${receiver.last_name || ""}`.trim() || "Vendor";
      } else {
        return {
          success: true,
          skipped: true,
          reason: "unsupported_who_posted"
        };
      }

      const notificationTitle = title || "नई लीड रिक्वेस्ट मिली";
      const notificationMessage =
        message || "आपकी enquiry पर एक vendor ने request भेजी है।";

      // 1) Save notification
      await Notification.create({
        receiver_token: receiverToken,
        sender_token: requester_token || null,
        token: enquiry_request_token || null,
        type: "LEAD_REQUEST_OWNER",
        title: notificationTitle,
        message: notificationMessage,
        visibility: "private",
        is_read: 0,
        meta: {
          enquiry_type: normalizedType,
          enquiry_token,
          enquiry_request_token,
          requester_token,
          receiver_role: receiverRole,
          receiver_name: receiverDisplayName,
          vendor_name: vendor_name || null,
          vendor_contact: vendor_contact || null,
          enquiry_owner_token:
            whoPosted === "CUSTOMER"
              ? enquiry.customer_token || null
              : enquiry.vendor_token || null,
          enquiry_owner_contact: enquiry.contact || null,
          who_posted: enquiry.who_posted || null,
          from_web: enquiry.from_web === true,
          ...meta
        }
      });

      // 2) Push notification
      if (deviceModel) {
        const deviceWhere =
          receiverRole === "CUSTOMER"
            ? {
                customer_token: receiverToken,
                flag: 0
              }
            : {
                vendor_token: receiverToken,
                flag: 0
              };

        const devices = await deviceModel.findAll({
          where: deviceWhere,
          attributes: ["fcm_token"],
          raw: true
        });

        const tokens = [...new Set(
          (devices || [])
            .map((d) => d.fcm_token)
            .filter(Boolean)
        )];

        if (tokens.length) {
          const multicastMessage = {
            notification: {
              title: notificationTitle,
              body: notificationMessage
            },
            data: {
              event: "LEAD_REQUEST_OWNER",
              enquiry_type: String(normalizedType || ""),
              enquiry_token: String(enquiry_token || ""),
              enquiry_request_token: String(enquiry_request_token || ""),
              requester_token: String(requester_token || ""),
              receiver_role: String(receiverRole || ""),
              receiver_token: String(receiverToken || "")
            },
            tokens
          };

          const response = await admin
            .messaging()
            .sendEachForMulticast(multicastMessage);

          const invalidTokens = [];

          response.responses.forEach((r, index) => {
            if (!r.success) {
              const errorCode = r.error?.code || "";
              console.log(
                "[LEAD_REQUEST_OWNER_WORKER] FCM error:",
                tokens[index],
                errorCode
              );

              if (
                errorCode.includes("registration-token-not-registered") ||
                errorCode.includes("invalid-registration-token")
              ) {
                invalidTokens.push(tokens[index]);
              }
            }
          });

          if (invalidTokens.length) {
            await cleanupInvalidTokens(deviceModel, invalidTokens);
          }
        }
      }

      return {
        success: true,
        receiver_role: receiverRole,
        receiver_token: receiverToken
      };
    } catch (error) {
      console.log("[LEAD_REQUEST_OWNER_WORKER] ERROR:", error);
      throw error;
    }
  },
  {
    connection: bullConnection
  }
);