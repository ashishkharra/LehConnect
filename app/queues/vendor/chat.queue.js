const { Queue } = require("bullmq");
const bullConnection = require("../../config/bullMq");

const chatQueue = new Queue("chat-message-persist", {
  connection: bullConnection,
});

module.exports = chatQueue;