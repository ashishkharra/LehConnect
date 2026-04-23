const db = require("../models/index");
const { redisClient } = require("../config/redis.config.js");
const { randomstring } = require("../shared/utils/helper");
const chatQueue = require("../queues/vendor/chat.queue.js");
const chatNotificationQueue = require("../queues/vendor/chat.notification.queue.js");

const Chat = db.chat;
const Conversation = db.conversation;
const Booking = db.booking;
const BookingRequest = db.bookingRequest
const BookingAdvanceRequest = db.bookingAdvanceRequest
const Notification = db.notification;
const { Op } = db.Sequelize;

const MESSAGE_TYPES = ["TEXT", "IMAGE", "VIDEO", "FILE", "LOCATION"];



async function findOrCreateConversation({
  booking_token,
  owner_token,
  requester_token,
}) {
  let conversation = await Conversation.findOne({
    where: { booking_token, owner_token, requester_token },
  });

  if (conversation) {
    return { conversation, isNew: false };
  }

  conversation = await Conversation.create({
    token: randomstring(32),
    booking_token,
    owner_token,
    requester_token,
  });

  return { conversation, isNew: true };
}

module.exports = (socket) => {
  const user = socket.user;

  if (!user || !user.token) {
    socket.disconnect();
    return;
  }

  socket.join(`user:${user.token}`);

  socket.on("joinBooking", async (data = {}) => {
    try {
      const { booking_token, owner_token, requester_token } = data;

      if (!booking_token || !owner_token || !requester_token) return;

      const { conversation, isNew } = await findOrCreateConversation({
        booking_token,
        owner_token,
        requester_token,
      });

      const room = `conversation:${conversation.token}`;
      socket.join(room);

      // fetch booking meta on every joinBooking hit
      const booking = await Booking.findOne({
        where: { token: booking_token },
        attributes: ["token", "secure_booking", "accept_type"],
        raw: true,
      });

      // fetch booking request also
      const bookingRequest = await BookingRequest.findOne({
        where: {
          booking_token,
          owner_vendor_token: owner_token,
          requested_by_vendor_token: requester_token,
          flag: 0,
        },
        attributes: ["token", "status", "chat_unlocked", "accept_type"],
        order: [["created_at", "DESC"]],
        raw: true,
      });

      // fetch active advance request for this booking request
      const advanceRequest = bookingRequest?.token
        ? await BookingAdvanceRequest.findOne({
          where: {
            booking_token,
            booking_request_token: bookingRequest.token,
            owner_vendor_token: owner_token,
            bidder_vendor_token: requester_token,
            is_active: true,
            flag: 0,
          },
          attributes: [
            "token",
            "status",
            "payment_status",
            "requested_advance_amount",
            "responded_advance_amount",
            "final_advance_amount",
            "currency",
            "expires_at",
            "requested_at",
            "accepted_at",
          ],
          order: [["created_at", "DESC"]],
          raw: true,
        })
        : null;

      const bookingMeta = {
        booking_token: booking?.token || booking_token,
        booking_request_token: bookingRequest?.token || null,
        secure_booking: booking?.secure_booking ?? false,
        accept_type: booking?.accept_type ?? null,
        booking_request_status: bookingRequest?.status || null,
        chat_unlocked: bookingRequest?.chat_unlocked ?? false,

        advance_request_token: advanceRequest?.token ?? undefined,
        advance_request_status: advanceRequest?.status ?? undefined,
        advance_payment_status: advanceRequest?.payment_status ?? undefined,
        requested_advance_amount: advanceRequest?.requested_advance_amount ?? undefined,
        final_advance_amount: advanceRequest?.final_advance_amount ?? undefined,
        advance_requested_at: advanceRequest?.requested_at ?? undefined,
        requested_advance_amount: advanceRequest?.requested_advance_amount || null,
        responded_advance_amount: advanceRequest?.responded_advance_amount || null,
        final_advance_amount: advanceRequest?.final_advance_amount || null,
        advance_currency: advanceRequest?.currency || "INR",
        advance_expires_at: advanceRequest?.expires_at || null,
        advance_requested_at: advanceRequest?.requested_at || null,
        advance_accepted_at: advanceRequest?.accepted_at || null,

        show_pay_button:
          user.token === requester_token &&
          !!advanceRequest &&
          ["REQUESTED", "COUNTERED", "ACCEPTED", "PAYMENT_PENDING"].includes(
            advanceRequest.status
          ) &&
          !["PAID", "REFUNDED"].includes(advanceRequest.payment_status || ""),

        conversation_token: conversation.token,
        owner_token,
        requester_token,
        is_owner: user.token === owner_token,
        is_requester: user.token === requester_token,
      };

      // reset unread count for current opened user
      if (user.token === owner_token) {
        await Conversation.update(
          { unread_count_owner: 0 },
          { where: { id: conversation.id } }
        );
      } else if (user.token === requester_token) {
        await Conversation.update(
          { unread_count_requester: 0 },
          { where: { id: conversation.id } }
        );
      }

      socket.emit("chatUnreadCountUpdated", {
        conversation_token: conversation.token,
        unread_count: 0,
      });

      const redisKey = `conversation:${conversation.token}:messages`;
      const redisMessages = await redisClient.lRange(redisKey, 0, -1);

      let messages = redisMessages.map((m) => JSON.parse(m));

      if (!messages.length) {
        const dbMessages = await Chat.findAll({
          where: { conversation_token: conversation.token },
          order: [["created_at", "DESC"]],
          limit: 50,
        });

        messages = dbMessages.reverse();
      }

      // send chat meta separately so frontend can always use it
      socket.emit("bookingChatMeta", bookingMeta);

      // send messages + meta together
      socket.emit("bookingMessages", {
        messages,
        ...bookingMeta,
      });

      socket.emit("conversationSeen", {
        conversation_token: conversation.token,
        booking_token: booking?.token || booking_token,
        booking_request_token: bookingRequest?.token || null,
        secure_booking: booking?.secure_booking ?? false,
        accept_type: booking?.accept_type ?? null,
        booking_request_status: bookingRequest?.status || null,
        chat_unlocked: bookingRequest?.chat_unlocked ?? false,

        advance_request_token: advanceRequest?.token ?? undefined,
        advance_request_status: advanceRequest?.status ?? undefined,
        advance_payment_status: advanceRequest?.payment_status ?? undefined,
        requested_advance_amount: advanceRequest?.requested_advance_amount ?? undefined,
        final_advance_amount: advanceRequest?.final_advance_amount ?? undefined,
        advance_requested_at: advanceRequest?.requested_at ?? undefined,
        requested_advance_amount: advanceRequest?.requested_advance_amount || null,
        responded_advance_amount: advanceRequest?.responded_advance_amount || null,
        final_advance_amount: advanceRequest?.final_advance_amount || null,
        advance_currency: advanceRequest?.currency || "INR",
        advance_expires_at: advanceRequest?.expires_at || null,
        advance_requested_at: advanceRequest?.requested_at || null,
        advance_accepted_at: advanceRequest?.accepted_at || null,

        show_pay_button:
          user.token === requester_token &&
          !!advanceRequest &&
          ["REQUESTED", "COUNTERED", "ACCEPTED", "PAYMENT_PENDING"].includes(
            advanceRequest.status
          ) &&
          !["PAID", "REFUNDED"].includes(advanceRequest.payment_status || ""),

        owner_token,
        requester_token,
      });

      if (isNew) {
        const receiver_token =
          user.token === owner_token ? requester_token : owner_token;

        const sender_token = user.token;

        const ownerName = await db.vendor.findOne({
          where: { token: owner_token },
          attributes: ["first_name", "last_name"],
          raw: true,
        });

        const notificationPayload = {
          booking_token: booking?.token || booking_token,
          booking_request_token: bookingRequest?.token || null,
          conversation_token: conversation.token,
          owner_token,
          requester_token,
          sender_token,
          receiver_token,
          secure_booking: booking?.secure_booking ?? false,
          accept_type: booking?.accept_type ?? null,
          booking_request_status: bookingRequest?.status || null,
          chat_unlocked: bookingRequest?.chat_unlocked ?? false,

          advance_request_token: advanceRequest?.token ?? undefined,
          advance_request_status: advanceRequest?.status ?? undefined,
          advance_payment_status: advanceRequest?.payment_status ?? undefined,
          requested_advance_amount: advanceRequest?.requested_advance_amount ?? undefined,
          final_advance_amount: advanceRequest?.final_advance_amount ?? undefined,
          advance_requested_at: advanceRequest?.requested_at ?? undefined,
          requested_advance_amount: advanceRequest?.requested_advance_amount || null,
          responded_advance_amount: advanceRequest?.responded_advance_amount || null,
          final_advance_amount: advanceRequest?.final_advance_amount || null,
          advance_currency: advanceRequest?.currency || "INR",
          advance_expires_at: advanceRequest?.expires_at || null,
          advance_requested_at: advanceRequest?.requested_at || null,
          advance_accepted_at: advanceRequest?.accepted_at || null,

          show_pay_button:
            receiver_token === requester_token &&
            !!advanceRequest &&
            ["REQUESTED", "COUNTERED", "ACCEPTED", "PAYMENT_PENDING"].includes(
              advanceRequest.status
            ) &&
            !["PAID", "REFUNDED"].includes(advanceRequest.payment_status || ""),
        };

        await Notification.create({
          sender_token,
          receiver_token,
          type: "NEW_CHAT",
          title: "New Chat Started",
          message: `Vendor ${ownerName?.first_name || ""} ${ownerName?.last_name || ""
            } आपसे चैट करना चाहते हैं।`,
          payload: notificationPayload,
        });

        socket.nsp.to(`user:${receiver_token}`).emit("new_chat_started", {
          notification_type: "NEW_CHAT",
          title: "New Chat Started",
          message: `Vendor ${ownerName?.first_name || ""} ${ownerName?.last_name || ""
            } आपसे चैट करना चाहते हैं।`,
          booking_token: booking?.token || booking_token,
          booking_request_token: bookingRequest?.token || null,
          conversation_token: conversation.token,
          sender_token,
          receiver_token,
          owner_token,
          requester_token,
          secure_booking: booking?.secure_booking ?? false,
          accept_type: booking?.accept_type ?? null,
          booking_request_status: bookingRequest?.status || null,
          chat_unlocked: bookingRequest?.chat_unlocked ?? false,

          advance_request_token: advanceRequest?.token ?? undefined,
          advance_request_status: advanceRequest?.status ?? undefined,
          advance_payment_status: advanceRequest?.payment_status ?? undefined,
          requested_advance_amount: advanceRequest?.requested_advance_amount ?? undefined,
          final_advance_amount: advanceRequest?.final_advance_amount ?? undefined,
          advance_requested_at: advanceRequest?.requested_at ?? undefined,
          requested_advance_amount: advanceRequest?.requested_advance_amount || null,
          responded_advance_amount: advanceRequest?.responded_advance_amount || null,
          final_advance_amount: advanceRequest?.final_advance_amount || null,
          advance_currency: advanceRequest?.currency || "INR",
          advance_expires_at: advanceRequest?.expires_at || null,
          advance_requested_at: advanceRequest?.requested_at || null,
          advance_accepted_at: advanceRequest?.accepted_at || null,

          show_pay_button:
            receiver_token === requester_token &&
            !!advanceRequest &&
            ["REQUESTED", "COUNTERED", "ACCEPTED", "PAYMENT_PENDING"].includes(
              advanceRequest.status
            ) &&
            !["PAID", "REFUNDED"].includes(advanceRequest.payment_status || ""),

          payload: notificationPayload,
        });

        await chatNotificationQueue.add(
          "send-new-chat-notification",
          {
            sender_token,
            receiver_token,
            title: "New Chat Started",
            message: `Vendor ${ownerName?.first_name || ""} ${ownerName?.last_name || ""
              } आपसे चैट करना चाहते हैं।`,
            payload: notificationPayload,
          },
          {
            removeOnComplete: true,
            removeOnFail: false,
          }
        );
      }
    } catch (err) {
      console.error("joinBooking error:", err);
    }
  });

  // SEND MESSAGE
  socket.on("sendMessage", async (data = {}) => {
    try {
      const {
        booking_token,
        owner_token,
        requester_token,
        receiver_token,
        message,
        message_type = "TEXT",
        attachment_url,
      } = data;

      const sender_token = user.token;

      if (!booking_token || !owner_token || !requester_token || !receiver_token) {
        return;
      }

      if (!MESSAGE_TYPES.includes(message_type)) return;

      const trimmedMessage = (message || "").trim();
      if (message_type === "TEXT" && !trimmedMessage) return;

      const { conversation } = await findOrCreateConversation({
        booking_token,
        owner_token,
        requester_token,
      });

      const token = randomstring(32);
      const createdAt = new Date().toISOString();

      const chatMessage = {
        token,
        conversation_token: conversation.token,
        booking_token,
        sender_token,
        receiver_token,
        message: trimmedMessage,
        message_type,
        attachment_url,
        status: "SENT",
        created_at: createdAt,
      };

      const redisKey = `conversation:${conversation.token}:messages`;

      await redisClient.rPush(redisKey, JSON.stringify(chatMessage));
      await redisClient.expire(redisKey, 86400);
      await redisClient.set(`message:${token}`, JSON.stringify(chatMessage));

      const updatePayload = {
        last_message_token: token,
        last_message: trimmedMessage,
        last_message_type: message_type,
        last_message_sender_token: sender_token,
        last_message_at: createdAt,
      };

      let unreadCount = 0;

      if (sender_token === owner_token) {
        unreadCount = (conversation.unread_count_requester || 0) + 1;
        updatePayload.unread_count_requester = unreadCount;
      } else {
        unreadCount = (conversation.unread_count_owner || 0) + 1;
        updatePayload.unread_count_owner = unreadCount;
      }

      await Conversation.update(updatePayload, {
        where: { id: conversation.id },
      });

      const [bookingDetails, senderVendor, ownerVendor] = await Promise.all([
        Booking.findOne({
          where: { token: booking_token },
          attributes: ["id", "token", "pickup_location", "vehicle_type"],
          raw: true,
        }),
        db.vendor.findOne({
          where: { token: sender_token },
          attributes: ["token", "first_name", "last_name"],
          raw: true,
        }),
        db.vendor.findOne({
          where: { token: owner_token },
          attributes: ["token", "first_name", "last_name"],
          raw: true,
        }),
      ]);

      let senderName = "Someone";
      if (senderVendor) {
        senderName =
          `${senderVendor.first_name || ""} ${senderVendor.last_name || ""}`.trim() ||
          "Someone";
      }

      let ownerName = "Owner";
      if (ownerVendor) {
        ownerName =
          `${ownerVendor.first_name || ""} ${ownerVendor.last_name || ""}`.trim() ||
          "Owner";
      }

      const bookingId = bookingDetails?.id ?? null;
      const bookingTokenValue = bookingDetails?.token || booking_token;

      const bookingIdLabel = bookingId
        ? `Booking ID: ${bookingId}`
        : "Booking ID: N/A";

      const bookingInfo = bookingDetails
        ? `(${bookingDetails.pickup_location || "N/A"} • ${bookingDetails.vehicle_type || "N/A"})`
        : "";

      const notificationTitle = bookingId
        ? `New Message • Booking #${bookingId}`
        : "New Message";

      const notificationMessage = (() => {
        switch (message_type) {
          case "TEXT":
            return `${bookingIdLabel}\n${senderName} ${bookingInfo}: ${trimmedMessage}`;

          case "IMAGE":
            return `${bookingIdLabel}\n${senderName} ${bookingInfo} ने आपको एक फोटो भेजी है 📷`;

          case "VIDEO":
            return `${bookingIdLabel}\n${senderName} ${bookingInfo} ने आपको एक वीडियो भेजा है 🎥`;

          case "FILE":
            return `${bookingIdLabel}\n${senderName} ${bookingInfo} ने आपको एक फ़ाइल भेजी है 📎`;

          case "LOCATION":
            return `${bookingIdLabel}\n${senderName} ${bookingInfo} ने आपको लोकेशन भेजी है 📍`;

          default:
            return `${bookingIdLabel}\n${senderName} ${bookingInfo} ने आपको नया संदेश भेजा है`;
        }
      })();

      const notificationPayload = {
        type: "NEW_CHAT",
        conversation: {
          token: conversation.token,
        },
        booking: {
          id: bookingId,
          token: bookingTokenValue,
          booking_id: bookingId,
          pickup_location: bookingDetails?.pickup_location || null,
          vehicle_type: bookingDetails?.vehicle_type || null,
        },
        sender: {
          token: sender_token,
          name: senderName,
        },
        receiver: {
          token: receiver_token,
        },
        owner: {
          token: owner_token,
          name: ownerName,
        },
        requester: {
          token: requester_token,
        },
        message: {
          token,
          text: trimmedMessage,
          type: message_type,
          attachment_url: attachment_url || null,
          created_at: createdAt,
        },
      };

      const userRoom = socket.nsp.adapter.rooms.get(`user:${receiver_token}`);
      const isReceiverConnected = userRoom && userRoom.size > 0;

      if (isReceiverConnected) {
        await Notification.create({
          sender_token,
          receiver_token,
          type: "NEW_CHAT",
          title: notificationTitle,
          message: notificationMessage,
          payload: notificationPayload,
        });

        socket.nsp.to(`user:${receiver_token}`).emit("new_chat_started", {
          notification_type: "NEW_CHAT",
          title: notificationTitle,
          message: notificationMessage,
          conversation: {
            token: conversation.token,
          },
          booking: {
            id: bookingId,
            token: bookingTokenValue,
            booking_id: bookingId,
            pickup_location: bookingDetails?.pickup_location || null,
            vehicle_type: bookingDetails?.vehicle_type || null,
          },
          sender: {
            token: sender_token,
            name: senderName,
          },
          receiver: {
            token: receiver_token,
          },
          owner: {
            token: owner_token,
            name: ownerName,
          },
          requester: {
            token: requester_token,
          },
          payload: notificationPayload,
        });
      } else {
        await chatNotificationQueue.add(
          "chat-notification",
          {
            sender_token,
            receiver_token,
            title: notificationTitle,
            message: notificationMessage,
            payload: notificationPayload,
          },
          {
            removeOnComplete: true,
            removeOnFail: false,
          }
        );
      }

      await chatQueue.add("persist-message", {
        messages: [chatMessage],
      });

      const room = `conversation:${conversation.token}`;

      socket.to(room).emit("newMessage", chatMessage);
      socket.emit("messageSent", chatMessage);

      await chatQueue.add("persist-message", {
        messages: [chatMessage],
      });

      socket.nsp.to(`user:${receiver_token}`).emit("conversationUpdated", {
        booking: {
          id: bookingId,
          token: bookingTokenValue,
          booking_id: bookingId,
          pickup_location: bookingDetails?.pickup_location || null,
          vehicle_type: bookingDetails?.vehicle_type || null,
        },
        conversation: {
          token: conversation.token,
        },
        owner: {
          token: owner_token,
          name: ownerName,
        },
        sender: {
          token: sender_token,
          name: senderName,
        },
        last_message: trimmedMessage,
        last_message_type: message_type,
        last_message_at: createdAt,
      });

      socket.nsp.to(`user:${receiver_token}`).emit("chatUnreadCountUpdated", {
        conversation_token: conversation.token,
        unread_count: unreadCount,
      });
    } catch (err) {
      console.error("sendMessage error:", err);
    }
  });

  // MARK SINGLE MESSAGE AS SEEN
  socket.on("markAsSeen", async ({ message_token } = {}) => {
    try {
      if (!message_token) return;

      const msgStr = await redisClient.get(`message:${message_token}`);
      if (!msgStr) {
        const dbMsg = await Chat.findOne({ where: { token: message_token } });
        if (!dbMsg) return;

        if (dbMsg.status !== "SEEN") {
          await Chat.update(
            { status: "SEEN" },
            { where: { token: message_token } }
          );
        }

        socket.nsp.to(`user:${dbMsg.sender_token}`).emit("messageSeen", {
          token: message_token,
        });
        return;
      }

      const msg = JSON.parse(msgStr);

      if (msg.status === "SEEN") return;

      msg.status = "SEEN";

      await redisClient.set(`message:${message_token}`, JSON.stringify(msg));

      await Chat.update(
        { status: "SEEN" },
        { where: { token: message_token } }
      );

      socket.nsp.to(`user:${msg.sender_token}`).emit("messageSeen", {
        token: message_token,
      });
    } catch (err) {
      console.error("markAsSeen error:", err);
    }
  });

  // MARK WHOLE CONVERSATION AS SEEN ON OPEN
  socket.on("markConversationSeen", async (data = {}) => {
    try {
      const { booking_token, owner_token, requester_token } = data;

      if (!booking_token || !owner_token || !requester_token) return;

      const conversation = await Conversation.findOne({
        where: { booking_token, owner_token, requester_token },
      });

      if (!conversation) return;

      await Chat.update(
        { status: "SEEN" },
        {
          where: {
            conversation_token: conversation.token,
            receiver_token: user.token,
            status: { [Op.ne]: "SEEN" },
          },
        }
      );

      if (user.token === owner_token) {
        await Conversation.update(
          { unread_count_owner: 0 },
          { where: { id: conversation.id } }
        );
      } else if (user.token === requester_token) {
        await Conversation.update(
          { unread_count_requester: 0 },
          { where: { id: conversation.id } }
        );
      }

      socket.emit("chatUnreadCountUpdated", {
        conversation_token: conversation.token,
        unread_count: 0,
      });
    } catch (err) {
      console.error("markConversationSeen error:", err);
    }
  });

  socket.on("leaveBooking", async (data = {}) => {
    try {
      const { booking_token, owner_token, requester_token } = data;

      if (!booking_token || !owner_token || !requester_token) return;

      const conversation = await Conversation.findOne({
        where: { booking_token, owner_token, requester_token },
      });

      if (!conversation) return;

      socket.leave(`conversation:${conversation.token}`);
    } catch (err) {
      console.error("leaveBooking error:", err.message);
    }
  });
};

