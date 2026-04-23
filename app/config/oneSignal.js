const OneSignal = require("@onesignal/node-onesignal");
const { ONESIGNAL_REST_API_KEY } = require('./globals')

// Configuration with REST API Key
const configuration = OneSignal.createConfiguration({
  restApiKey: ONESIGNAL_REST_API_KEY,
});

// Client instance
const client = new OneSignal.DefaultApi(configuration);

module.exports = {
  OneSignal,
  client,
};