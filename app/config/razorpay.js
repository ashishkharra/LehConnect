const Razorpay = require('razorpay');
const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = require('./globals')

const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET 
});

module.exports = razorpay;
