const { Queue } = require("bullmq");
const bullConnection = require("../../config/bullMq");

const customerNotificationQueue = new Queue("customer-notification", {
  connection: bullConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000
    },
    removeOnComplete: true,
    removeOnFail: false
  }
});

module.exports = customerNotificationQueue;