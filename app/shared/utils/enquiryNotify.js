const enquiryNotificationQueue = require("../../queues/vendor/enquiries/enquiry.queue.js");

async function notifyVendorEnquiry({
  io,
  roomPrefix = "vendor",
  receiver_token,
  sender_token = null,
  title,
  message,
  type,
  event,
  payload,
}) {
  const roomName = `${roomPrefix}:${receiver_token}`;
  const room = io?.sockets?.adapter?.rooms?.get(roomName);
  const isConnected = room && room.size > 0;

  if (isConnected) {
    await payload.NotificationModel.create({
      sender_token,
      receiver_token,
      receiver_role: "vendor",
      type,
      title,
      message,
      payload,
      visibility: "private",
    });

    io.to(roomName).emit(event, {
      title,
      message,
      type,
      payload,
    });

    return { sentBy: "socket" };
  }

  await enquiryNotificationQueue.add("enquiry-notification", {
    sender_token,
    receiver_token,
    receiver_role: "vendor",
    title,
    message,
    type,
    event,
    payload,
  });

  return { sentBy: "queue" };
}

module.exports = { notifyVendorEnquiry };