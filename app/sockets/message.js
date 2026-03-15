const db = require("../models/index");
const { redisClient } = require("../config/redis.config.js");
const { randomstring } = require("../shared/utils/helper");
const chatQueue = require("../queues/vendor/chat.queue.js");

const Chat = db.chat;
const Conversation = db.conversation;
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

  if (!conversation) {
    conversation = await Conversation.create({
      token: randomstring(32),
      booking_token,
      owner_token,
      requester_token,
    });
  }

  return conversation;
}

module.exports = (socket) => {
  const user = socket.user;

  if (!user || !user.token) {
    socket.disconnect();
    return;
  }

  socket.join(`user:${user.token}`);

  // JOIN CHAT
  socket.on("joinBooking", async (data = {}) => {
    try {
      const { booking_token, owner_token, requester_token } = data;

      if (!booking_token || !owner_token || !requester_token) return;

      const conversation = await findOrCreateConversation({
        booking_token,
        owner_token,
        requester_token,
      });

      const room = `conversation:${conversation.token}`;
      socket.join(room);

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

      socket.emit("bookingMessages", messages);

      // optional event so list can react instantly if you want later
      socket.emit("conversationSeen", {
        conversation_token: conversation.token,
        booking_token,
      });
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

      const conversation = await findOrCreateConversation({
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

      const room = `conversation:${conversation.token}`;

      socket.to(room).emit("newMessage", chatMessage);
      socket.emit("messageSent", chatMessage);

      await chatQueue.add("persist-message", {
        messages: [chatMessage],
      });

      socket.nsp.to(`user:${receiver_token}`).emit("conversationUpdated", {
        booking_token,
        conversation_token: conversation.token,
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
        // fallback: if redis key missing, update DB at least
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