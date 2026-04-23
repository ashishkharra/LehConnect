const { ONESIGNAL_APP_ID } = require("../../config/globals");
const { OneSignal, client } = require("../../config/onesignal");

async function sendOneSignalPush({
  externalIds = [],
  title = "Notification",
  message = "",
  data = {},
}) {
  try {
    // Clean & unique external IDs
    const cleanExternalIds = [
      ...new Set(
        externalIds.map((id) => String(id || "").trim()).filter(Boolean)
      ),
    ];

    if (!cleanExternalIds.length) return null;

    const notification = new OneSignal.Notification();

    notification.app_id = ONESIGNAL_APP_ID;

    // Target users by external_id (VERY IMPORTANT)
    notification.include_aliases = {
      external_id: cleanExternalIds,
    };

    notification.target_channel = "push";

    notification.headings = {
      en: title,
    };

    notification.contents = {
      en: message,
    };

    notification.data = data;

    const response = await client.createNotification(notification);

    return response;
  } catch (error) {
    console.error(
      "OneSignal Error:",
      error?.body || error?.response?.body || error
    );
    return null;
  }
}

module.exports = {
  sendOneSignalPush,
};