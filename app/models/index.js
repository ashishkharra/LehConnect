const dbConfig = require("../config/db.config.js");
const Sequelize = require("sequelize");

const sequelize = new Sequelize(dbConfig.DB, dbConfig.USER, dbConfig.PASSWORD, {
  host: dbConfig.HOST,
  dialect: dbConfig.dialect,
  timezone: '+05:30',
  dialectOptions: {
    timezone: '+05:30',
  },
  pool: {
    max: dbConfig.pool.max,
    min: dbConfig.pool.min,
    acquire: dbConfig.pool.acquire,
    idle: dbConfig.pool.idle
  },
  logging: false,
});

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

db.chat = require('./chat.model.js')(sequelize, Sequelize);
db.session = require('./session.model')(sequelize, Sequelize);
db.admin = require("./admin.model.js")(sequelize, Sequelize);
db.customer = require("./customer.model.js")(sequelize, Sequelize);
db.vendor = require('./vendor.model.js')(sequelize, Sequelize);
db.vendorRating = require('./vendor_rating.model.js')(sequelize, Sequelize);
db.notification = require('./notification.model.js')(sequelize, Sequelize);
db.requestFreeVehicle = require('./freeVehicleRequest.model.js')(sequelize, Sequelize);
db.freeVehicle = require('./freeVehicle.model.js')(sequelize, Sequelize);
db.enquiry = require('./enquiry.model.js')(sequelize, Sequelize);
db.booking = require('./booking.model.js')(sequelize, Sequelize);
db.bookingRequest = require('./booking_request.model.js')(sequelize, Sequelize)
db.bookingRejection = require('./booking_rejection.model.js')(sequelize, Sequelize)
db.otp = require('./otp.model.js')(sequelize, Sequelize);
db.counter = require('./counter.model.js')(sequelize, Sequelize);
db.sliderSeting = require('./site_slider.model.js')(sequelize, Sequelize)
db.bookingSlider = require('./booking_slider.model.js')(sequelize, Sequelize)
db.helpVideo = require('./help_video.model.js')(sequelize, Sequelize)
db.review = require('./review.model.js')(sequelize, Sequelize)
db.bookingRating = require('./booking_rating.model.js')(sequelize, Sequelize);
db.service = require('./services.model.js')(sequelize, Sequelize)
db.vendor_service = require('./vendor_service.model.js')(sequelize, Sequelize)
db.vendor_acc_delete_req = require('./vendor_acc_delete_req.model.js')(sequelize, Sequelize)
db.faqs = require('./faqs.model.js')(sequelize, Sequelize)
db.about = require('./about.model.js')(sequelize, Sequelize)
db.vendor_device_fcm = require('./vendor_device_fcm.js')(sequelize, Sequelize)
db.customer_device_fcm = require('./customer_device_fcm.js')(sequelize, Sequelize)
db.booking_cancel = require('./booking_cancle.model.js')(sequelize, Sequelize)
db.freeVehicle_cancel = require('./freeVehicle_cancel.model.js')(sequelize, Sequelize)
db.vendor_help = require('./vendor_help.model.js')(sequelize, Sequelize)
db.vendor_help_answer = require('./vendor_help_answer.model.js')(sequelize, Sequelize)
db.wallet = require('./wallet.model.js')(sequelize, Sequelize)
db.wallet_transaction = require('./wallet_transaction.model.js')(sequelize, Sequelize)
db.wallet_hold = require('./wallet_holds.model.js')(sequelize, Sequelize)
db.referral_setting = require('./referral_setting.model.js')(sequelize, Sequelize)
db.referral_history = require('./referral_history.model.js')(sequelize, Sequelize)
db.holydaypackageEnquiry = require('./holidaypackageEnquiry.model.js')(sequelize, Sequelize)
db.insuranceEnquiry = require('./insuranceEnquiry.model.js')(sequelize, Sequelize)
db.hotelEnquiry = require('./hotelEnquiry.model.js')(sequelize, Sequelize)
db.flightEnquiry = require('./flightEnquiry.model.js')(sequelize, Sequelize)
db.CabEnquiry = require('./cabEnquiry.model.js')(sequelize, Sequelize)
db.siteSettings = require('./settings.model.js')(sequelize, Sequelize)
db.conversation = require('./conversation.js')(sequelize, Sequelize)
db.enquiryRequest = require('./enquiryRequests.model.js')(sequelize, Sequelize)
db.bookingPayment = require('./booking_payment.model.js')(sequelize, Sequelize)
db.bookingRefund = require('./booking_refunds.model.js')(sequelize, Sequelize);
db.vendorPayout = require('./vendor_payouts.model.js')(sequelize, Sequelize);
db.bookingAdvanceRequest = require('./booking_advance_request.js')(sequelize, Sequelize)
db.bookingAdvanceRequestHistory = require('./booking_advance_request_history.js')(sequelize, Sequelize)
db.customerReferralHistory = require('./customerReferralHistory.js')(sequelize, Sequelize)
db.EnquiryCalls = require('./enquiryCalls.model.js')(sequelize, Sequelize)
db.AddVehicle = require('./Add_vehicle.model.js')(sequelize, Sequelize)
db.customerFaqs = require('./customerFaq.model.js')(sequelize, Sequelize)
db.customerHelp = require('./customer_help.model.js')(sequelize, Sequelize)
db.customerHelpAnswer = require('./customer_help_answer.model.js')(sequelize, Sequelize)
db.customerBooking = require('./customer_booking.model.js')(sequelize, Sequelize)
db.customerBookingPayment = require('./customer_booking_payment.model.js')(sequelize, Sequelize)


// BookingPayment <-> Booking
db.bookingPayment.belongsTo(db.booking, {
  foreignKey: "booking_token",
  targetKey: "token",
  as: "booking",
  constraints: false
});

db.booking.hasMany(db.bookingPayment, {
  foreignKey: "booking_token",
  sourceKey: "token",
  as: "booking_payments",
  constraints: false
});

// BookingAdvanceRequest <-> Booking
db.bookingAdvanceRequest.belongsTo(db.booking, {
  foreignKey: "booking_token",
  targetKey: "token",
  as: "booking",
  constraints: false
});

db.booking.hasMany(db.bookingAdvanceRequest, {
  foreignKey: "booking_token",
  sourceKey: "token",
  as: "advance_requests",
  constraints: false
});

// BookingAdvanceRequest <-> BookingRequest
db.bookingAdvanceRequest.belongsTo(db.bookingRequest, {
  foreignKey: "booking_request_token",
  targetKey: "token",
  as: "booking_request",
  constraints: false
});

db.bookingRequest.hasMany(db.bookingAdvanceRequest, {
  foreignKey: "booking_request_token",
  sourceKey: "token",
  as: "advance_requests",
  constraints: false
});

// BookingAdvanceRequest <-> Vendor (Owner)
db.bookingAdvanceRequest.belongsTo(db.vendor, {
  foreignKey: "owner_vendor_token",
  targetKey: "token",
  as: "owner_vendor",
  constraints: false
});

db.vendor.hasMany(db.bookingAdvanceRequest, {
  foreignKey: "owner_vendor_token",
  sourceKey: "token",
  as: "owned_advance_requests",
  constraints: false
});

// BookingAdvanceRequest <-> Vendor (Bidder)
db.bookingAdvanceRequest.belongsTo(db.vendor, {
  foreignKey: "bidder_vendor_token",
  targetKey: "token",
  as: "bidder_vendor",
  constraints: false
});

db.vendor.hasMany(db.bookingAdvanceRequest, {
  foreignKey: "bidder_vendor_token",
  sourceKey: "token",
  as: "bidder_advance_requests",
  constraints: false
});

// BookingAdvanceRequest <-> BookingPayment
db.bookingAdvanceRequest.belongsTo(db.bookingPayment, {
  foreignKey: "payment_token",
  targetKey: "token",
  as: "payment",
  constraints: false
});

db.bookingPayment.hasMany(db.bookingAdvanceRequest, {
  foreignKey: "payment_token",
  sourceKey: "token",
  as: "advance_requests",
  constraints: false
});

// BookingAdvanceRequest <-> WalletHold
db.bookingAdvanceRequest.belongsTo(db.wallet_hold, {
  foreignKey: "wallet_hold_token",
  targetKey: "token",
  as: "wallet_hold",
  constraints: false
});

db.wallet_hold.hasMany(db.bookingAdvanceRequest, {
  foreignKey: "wallet_hold_token",
  sourceKey: "token",
  as: "advance_requests",
  constraints: false
});

// BookingAdvanceRequestHistory <-> BookingAdvanceRequest
db.bookingAdvanceRequestHistory.belongsTo(db.bookingAdvanceRequest, {
  foreignKey: "advance_request_token",
  targetKey: "token",
  as: "advance_request",
  constraints: false
});

db.bookingAdvanceRequest.hasMany(db.bookingAdvanceRequestHistory, {
  foreignKey: "advance_request_token",
  sourceKey: "token",
  as: "history",
  constraints: false
});

// BookingAdvanceRequestHistory <-> Booking
db.bookingAdvanceRequestHistory.belongsTo(db.booking, {
  foreignKey: "booking_token",
  targetKey: "token",
  as: "booking",
  constraints: false
});

db.booking.hasMany(db.bookingAdvanceRequestHistory, {
  foreignKey: "booking_token",
  sourceKey: "token",
  as: "advance_request_history",
  constraints: false
});

// BookingAdvanceRequestHistory <-> BookingRequest
db.bookingAdvanceRequestHistory.belongsTo(db.bookingRequest, {
  foreignKey: "booking_request_token",
  targetKey: "token",
  as: "booking_request",
  constraints: false
});

db.bookingRequest.hasMany(db.bookingAdvanceRequestHistory, {
  foreignKey: "booking_request_token",
  sourceKey: "token",
  as: "advance_request_history",
  constraints: false
});

// BookingAdvanceRequestHistory <-> Vendor (Actor)
db.bookingAdvanceRequestHistory.belongsTo(db.vendor, {
  foreignKey: "actor_token",
  targetKey: "token",
  as: "actor",
  constraints: false
});

db.vendor.hasMany(db.bookingAdvanceRequestHistory, {
  foreignKey: "actor_token",
  sourceKey: "token",
  as: "advance_request_actions",
  constraints: false
});

// BookingPayment <-> Vendor (payer)
db.bookingPayment.belongsTo(db.vendor, {
  foreignKey: "payer_token",
  targetKey: "token",
  as: "payer_vendor",
  constraints: false
});

db.vendor.hasMany(db.bookingPayment, {
  foreignKey: "payer_token",
  sourceKey: "token",
  as: "paid_booking_payments",
  constraints: false
});

// BookingPayment <-> Vendor (payee)
db.bookingPayment.belongsTo(db.vendor, {
  foreignKey: "payee_vendor_token",
  targetKey: "token",
  as: "payee_vendor",
  constraints: false
});

db.CabEnquiry.belongsTo(db.vendor, {
  foreignKey: "vendor_token",
  targetKey: "token",
  as: "vendor_details",
  constraints: false
});

db.vendor.hasMany(db.CabEnquiry, {
  foreignKey: "vendor_token",
  sourceKey: "token",
  as: "cab_enquiries",
  constraints: false
});

db.flightEnquiry.belongsTo(db.vendor, {
  foreignKey: "vendor_token",
  targetKey: "token",
  as: "vendor_details",
  constraints: false
});

db.vendor.hasMany(db.flightEnquiry, {
  foreignKey: "vendor_token",
  sourceKey: "token",
  as: "flight_enquiries",
  constraints: false
});

db.hotelEnquiry.belongsTo(db.vendor, {
  foreignKey: "vendor_token",
  targetKey: "token",
  as: "vendor_details",
  constraints: false
});

db.vendor.hasMany(db.hotelEnquiry, {
  foreignKey: "vendor_token",
  sourceKey: "token",
  as: "hotel_enquiries",
  constraints: false
});

db.holydaypackageEnquiry.belongsTo(db.vendor, {
  foreignKey: "vendor_token",
  targetKey: "token",
  as: "vendor_details",
  constraints: false
});

db.vendor.hasMany(db.holydaypackageEnquiry, {
  foreignKey: "vendor_token",
  sourceKey: "token",
  as: "holiday_enquiries",
  constraints: false
});

db.insuranceEnquiry.belongsTo(db.vendor, {
  foreignKey: "vendor_token",
  targetKey: "token",
  as: "vendor_details",
  constraints: false
});

db.vendor.hasMany(db.insuranceEnquiry, {
  foreignKey: "vendor_token",
  sourceKey: "token",
  as: "insurance_enquiries",
  constraints: false
});

db.vendor.hasMany(db.bookingPayment, {
  foreignKey: "payee_vendor_token",
  sourceKey: "token",
  as: "receivable_booking_payments",
  constraints: false
});

// BookingRefund <-> Booking
db.bookingRefund.belongsTo(db.booking, {
  foreignKey: "booking_token",
  targetKey: "token",
  as: "booking",
  constraints: false
});

db.booking.hasMany(db.bookingRefund, {
  foreignKey: "booking_token",
  sourceKey: "token",
  as: "booking_refunds",
  constraints: false
});

// BookingRefund <-> BookingPayment
db.bookingRefund.belongsTo(db.bookingPayment, {
  foreignKey: "payment_token",
  targetKey: "token",
  as: "payment",
  constraints: false
});

db.bookingPayment.hasMany(db.bookingRefund, {
  foreignKey: "payment_token",
  sourceKey: "token",
  as: "refunds",
  constraints: false
});

// VendorPayout <-> Booking
db.vendorPayout.belongsTo(db.booking, {
  foreignKey: "booking_token",
  targetKey: "token",
  as: "booking",
  constraints: false
});

db.booking.hasMany(db.vendorPayout, {
  foreignKey: "booking_token",
  sourceKey: "token",
  as: "vendor_payouts",
  constraints: false
});

// VendorPayout <-> BookingPayment
db.vendorPayout.belongsTo(db.bookingPayment, {
  foreignKey: "payment_token",
  targetKey: "token",
  as: "payment",
  constraints: false
});

db.bookingPayment.hasMany(db.vendorPayout, {
  foreignKey: "payment_token",
  sourceKey: "token",
  as: "payouts",
  constraints: false
});

// VendorPayout <-> Vendor
db.vendorPayout.belongsTo(db.vendor, {
  foreignKey: "vendor_token",
  targetKey: "token",
  as: "vendor",
  constraints: false
});

db.vendor.hasMany(db.vendorPayout, {
  foreignKey: "vendor_token",
  sourceKey: "token",
  as: "vendor_payouts",
  constraints: false
});

db.enquiryRequest.belongsTo(db.CabEnquiry, {
  foreignKey: "enquiry_token",
  targetKey: "token",
  as: "cab_enquiry",
  constraints: false,
  scope: {
    enquiry_type: "cab"
  }
});


// CabEnquiry <-> Vehicle
db.CabEnquiry.belongsTo(db.AddVehicle, {
  foreignKey: "vehicle_token",
  targetKey: "token",
  as: "vehicle_details",
  constraints: false
});

db.AddVehicle.hasMany(db.CabEnquiry, {
  foreignKey: "vehicle_token",
  sourceKey: "token",
  as: "cab_enquiries",
  constraints: false
});

db.CabEnquiry.hasMany(db.enquiryRequest, {
  foreignKey: "enquiry_token",
  sourceKey: "token",
  as: "cab_requests",
  constraints: false
});

db.enquiryRequest.belongsTo(db.flightEnquiry, {
  foreignKey: "enquiry_token",
  targetKey: "token",
  as: "flight_enquiry",
  constraints: false,
  scope: {
    enquiry_type: "flight"
  }
});

db.flightEnquiry.hasMany(db.enquiryRequest, {
  foreignKey: "enquiry_token",
  sourceKey: "token",
  as: "flight_requests",
  constraints: false
});


db.enquiryRequest.belongsTo(db.hotelEnquiry, {
  foreignKey: "enquiry_token",
  targetKey: "token",
  as: "hotel_enquiry",
  constraints: false,
  scope: {
    enquiry_type: "hotel"
  }
});

db.hotelEnquiry.hasMany(db.enquiryRequest, {
  foreignKey: "enquiry_token",
  sourceKey: "token",
  as: "hotel_requests",
  constraints: false
});

db.enquiryRequest.belongsTo(db.holydaypackageEnquiry, {
  foreignKey: "enquiry_token",
  targetKey: "token",
  as: "holiday_enquiry",
  constraints: false,
  scope: {
    enquiry_type: "holiday_package"
  }
});

db.holydaypackageEnquiry.hasMany(db.enquiryRequest, {
  foreignKey: "enquiry_token",
  sourceKey: "token",
  as: "holiday_requests",
  constraints: false
});

db.enquiryRequest.belongsTo(db.insuranceEnquiry, {
  foreignKey: "enquiry_token",
  targetKey: "token",
  as: "insurance_enquiry",
  constraints: false,
  scope: {
    enquiry_type: "insurance"
  }
});

db.insuranceEnquiry.hasMany(db.enquiryRequest, {
  foreignKey: "enquiry_token",
  sourceKey: "token",
  as: "insurance_requests",
  constraints: false
});

db.enquiryRequest.belongsTo(db.vendor, {
  foreignKey: "requester_token",
  targetKey: "token",
  as: "requester",
  constraints: false
});

db.vendor.hasMany(db.enquiryRequest, {
  foreignKey: "requester_token",
  sourceKey: "token",
  as: "enquiry_requests",
  constraints: false
});


db.conversation.belongsTo(db.booking, {
  foreignKey: "booking_token",
  targetKey: "token",
  as: "booking",
  constraints: false
});

db.booking.hasMany(db.conversation, {
  foreignKey: "booking_token",
  sourceKey: "token",
  as: "conversations",
  constraints: false
});

db.conversation.belongsTo(db.vendor, {
  foreignKey: "owner_token",
  targetKey: "token",
  as: "owner",
  constraints: false
});

db.vendor.hasMany(db.conversation, {
  foreignKey: "owner_token",
  sourceKey: "token",
  as: "owner_conversations",
  constraints: false
});

db.conversation.belongsTo(db.vendor, {
  foreignKey: "requester_token",
  targetKey: "token",
  as: "requester",
  constraints: false
});

db.vendor.hasMany(db.conversation, {
  foreignKey: "requester_token",
  sourceKey: "token",
  as: "requester_conversations",
  constraints: false
});

db.requestFreeVehicle.belongsTo(db.freeVehicle, {
  as: 'freeVehicle',
  foreignKey: 'free_vehicle_token',
  targetKey: 'token',
  constraints: false
});
// db.freeVehicle.hasMany(db.requestFreeVehicle, { as: 'requests', constraints: false });

db.requestFreeVehicle.belongsTo(db.vendor, {
  as: 'requester',
  foreignKey: 'requested_by_vendor_token',
  targetKey: 'token',
  constraints: false
});
// db.requestFreeVehicle.belongsTo(db.vendor, {
//   as: 'owner',
//   foreignKey: 'owner_vendor_token',
//   targetKey: 'token',
//   constraints: false
// });

db.booking.belongsTo(db.vendor, {
  as: 'vendor',
  foreignKey: 'vendor_token',
  targetKey: 'token',
  constraints: false
});

db.vendor.hasMany(db.booking, {
  as: 'bookings',
  foreignKey: 'vendor_token',
  sourceKey: 'token',
  constraints: false
});

db.booking.hasMany(db.bookingRequest, {
  as: 'booking_requests',
  foreignKey: 'booking_token',
  sourceKey: 'token',
  constraints: false
});

db.bookingRequest.belongsTo(db.booking, {
  as: 'booking',
  foreignKey: 'booking_token',
  targetKey: 'token',
  constraints: false
});

db.booking.hasMany(db.bookingRejection, {
  as: 'booking_rejections',
  foreignKey: 'booking_token',
  sourceKey: 'token',
  constraints: false
});

db.bookingRejection.belongsTo(db.booking, {
  as: 'booking',
  foreignKey: 'booking_token',
  targetKey: 'token',
  constraints: false
});

db.bookingRequest.belongsTo(db.vendor, {
  as: 'requester',
  foreignKey: 'requested_by_vendor_token',
  targetKey: 'token',
  constraints: false
});

db.bookingRejection.belongsTo(db.vendor, {
  as: 'rejecter',
  foreignKey: 'rejected_by_token',
  targetKey: 'token',
  constraints: false
});

db.booking.hasMany(db.bookingRating, {
  as: 'ratings',
  foreignKey: 'booking_token',
  sourceKey: 'token',
  constraints: false
});

db.bookingRating.belongsTo(db.booking, {
  as: 'booking',
  foreignKey: 'booking_token',
  targetKey: 'token',
  constraints: false
});

db.vendor.hasMany(db.vendorRating, {
  as: 'received_ratings',
  foreignKey: 'vendor_token',
  sourceKey: 'token',
  constraints: false
});

db.vendorRating.belongsTo(db.vendor, {
  as: 'rated_vendor',
  foreignKey: 'vendor_token',
  targetKey: 'token',
  constraints: false
});
db.vendorRating.belongsTo(db.customer, { as: 'customer', constraints: false });
db.customer.hasMany(db.vendorRating, { as: 'givenRatings', constraints: false });

db.vendor.belongsToMany(db.service, { through: db.vendor_service, as: 'services', constraints: false });
db.service.belongsToMany(db.vendor, { through: db.vendor_service, as: 'vendors', constraints: false });

db.vendor_acc_delete_req.belongsTo(db.vendor, { constraints: false });
db.vendor.hasMany(db.vendor_acc_delete_req, { constraints: false });

db.vendor_help.hasMany(db.vendor_help_answer, {
  as: 'help_answers',
  foreignKey: 'help_token',
  sourceKey: 'token',
  constraints: false
});

db.vendor_help_answer.belongsTo(db.vendor_help, {
  as: 'help',
  foreignKey: 'help_token',
  targetKey: 'token',
  constraints: false
});


db.customerHelp.hasMany(db.customerHelpAnswer, {
  as: 'help_answers',
  foreignKey: 'help_token',
  sourceKey: 'token',
  constraints: false
});

db.customerHelpAnswer.belongsTo(db.customerHelp, {
  as: 'help',
  foreignKey: 'help_token',
  targetKey: 'token',
  constraints: false
});



db.referral_history.belongsTo(db.vendor, {
  as: 'Referrer',
  foreignKey: 'referrer_id',
  targetKey: 'id',
  constraints: false
});

db.referral_history.belongsTo(db.vendor, {
  as: 'Referee',
  foreignKey: 'referee_id',
  targetKey: 'id',
  constraints: false
});

db.vendor.hasMany(db.referral_history, {
  as: 'ReferralsGiven',
  foreignKey: 'referrer_id',
  sourceKey: 'id',
  constraints: false
});

db.vendor.hasMany(db.referral_history, {
  as: 'ReferralsReceived',
  foreignKey: 'referee_id',
  sourceKey: 'id',
  constraints: false
});

db.review.belongsTo(db.customer, {
  as: 'customer_reviewer',
  foreignKey: 'reviewer_token',
  targetKey: 'token',
  constraints: false
});

db.customer.hasMany(db.review, {
  as: 'customer_reviews',
  foreignKey: 'reviewer_token',
  sourceKey: 'token',
  constraints: false
});

db.review.belongsTo(db.vendor, {
  as: 'vendor_reviewer',
  foreignKey: 'reviewer_token',
  targetKey: 'token',
  constraints: false
});

db.vendor.hasMany(db.review, {
  as: 'vendor_reviews',
  foreignKey: 'reviewer_token',
  sourceKey: 'token',
  constraints: false
});

db.freeVehicle.belongsTo(db.vendor, {
  as: 'vendor',
  foreignKey: 'vendor_token',
  targetKey: 'token',
  constraints: false
});

db.freeVehicle.hasMany(db.requestFreeVehicle, {
  as: 'requests',
  foreignKey: 'free_vehicle_token',
  sourceKey: 'token',
  constraints: false
});

db.conversation.hasMany(db.chat, {
  foreignKey: "conversation_token",
  sourceKey: "token",
  as: "messages",
  constraints: false
});

db.chat.belongsTo(db.conversation, {
  foreignKey: "conversation_token",
  targetKey: "token",
  as: "conversation",
  constraints: false
});

db.customerBooking.belongsTo(db.AddVehicle, {
    foreignKey: "vehicle_token",
    targetKey: "token",
    as: "vehicle_details",
    constraints: false
});

db.AddVehicle.hasMany(db.customerBooking, {
    foreignKey: "vehicle_token",
    sourceKey: "token",
    as: "customer_bookings",
    constraints: false
});

db.customerBooking.belongsTo(db.AddVehicle, {
    foreignKey: "vehicle_token",
    targetKey: "token",
    as: "booking_vehicle_details",
    constraints: false
});

db.customerBooking.belongsTo(db.vendor, {
    foreignKey: "vendor_token",
    targetKey: "token",
    as: "booking_vendor_details",
    constraints: false
});

module.exports = db;