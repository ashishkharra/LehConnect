const { Worker } = require("bullmq");
const bullConnection = require("../../config/bullMq");
const db = require("../../models/index");

const Chat = db.chat;

new Worker(
  "chat-message-persist",
  async (job) => {
    const messages = job.data.messages;

    if (!messages || !messages.length) return;

    await Chat.bulkCreate(
      messages.map((m) => ({
        token: m.token,
        conversation_token: m.conversation_token,
        booking_token: m.booking_token,
        sender_token: m.sender_token,
        receiver_token: m.receiver_token,
        message: m.message,
        message_type: m.message_type,
        attachment_url: m.attachment_url,
        status: m.status,
        created_at: m.created_at,
      })),
      {
        ignoreDuplicates: true,
      }
    );
  },
  {
    connection: bullConnection,
    concurrency: 10,
  }
);