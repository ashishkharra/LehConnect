const { Queue } = require("bullmq");
const bullConnection = require("../../config/bullMq");

const leadRequestCustomerNotificationQueue = new Queue(
  "lead-request-customer-notification",
  {
    connection: bullConnection,
    defaultJobOptions: {
      removeOnComplete: 50,
      removeOnFail: 100,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000
      }
    }
  }
);

module.exports = leadRequestCustomerNotificationQueue;