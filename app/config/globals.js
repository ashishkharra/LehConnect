const enc_key = 'f7275a9f1f2715b1f450a2d486e7b5b3ccad2d820e96c69a783a8a8edfc550f0';
const api_key = 'wefadsfwedcjkd';
const admin_url = 'http://192.168.29.176:3001'
const verifyByAdmin = true
const ENV = 'development';
const RUN_CRON = true
const PORT = 3001
const isWeb = false
const REQUEST_FEE = 30;
const RAZORPAY_KEY_ID = 'rzp_live_ScqNFqHI9PwGtX'
const RAZORPAY_KEY_SECRET = 'urgk7FX5rD0IHZ8fYeBwvXwZ'
const SESSION_SECRET = 'dkfai8e4acnkadiflksd'

// dummy razorpay keys for testing without hitting actual razorpay APIs
// const RAZORPAY_KEY_ID = 'rzp_test_SBxG4YiBq9OvkC'
// const RAZORPAY_KEY_SECRET = 'vFyQBJf1XoX01oycDz4Ze6Lw'

const ONESIGNAL_APP_ID='4e062b93-70bc-42b3-8d55-c6648dfe8582'
const ONESIGNAL_REST_API_KEY='os_v2_org_cpudtmjd3veslpebtbpkbvfeo3w7saoh7flemceddp5r67sbcecugjvluugwng4mpbdreewefbqvlndrogr6n5gmvxyg6ng6gqpdava'

const testNumbers = [
    '8278617951',
    '7014452255',
    '7023300145'
];

const transporterData = {
    host: "asdf",
    port: 123,
    secure: false,
    user: "asdfasdf",
    password: "asdfawew",
    email: "asdfasdfW@gmail.com",
}

module.exports = {
    ONESIGNAL_APP_ID,
    ONESIGNAL_REST_API_KEY,
    enc_key,
    admin_url,
    admin_url,
    api_key,
    transporterData,
    ENV,
    RUN_CRON,
    PORT,
    verifyByAdmin,
    isWeb,
    RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET,
    SESSION_SECRET,
    testNumbers,
    REQUEST_FEE
};