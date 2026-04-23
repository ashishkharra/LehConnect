const { Queue } = require("bullmq");
const bullConnection = require("../../../config/bullMq");

const enquiryNotificationQueue = new Queue("enquiry-notification", {
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

module.exports = enquiryNotificationQueue;