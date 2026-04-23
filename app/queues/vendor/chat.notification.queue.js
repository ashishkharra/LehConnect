const { Queue } = require("bullmq");
const bullConnection = require("../../config/bullMq");

const chatNotificationQueue = new Queue("chat-notification", {
  connection: bullConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

module.exports = chatNotificationQueue;