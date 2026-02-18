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
db.sliderSeting = require('./site_slider.model.js')(sequelize,Sequelize)
db.bookingSlider = require('./booking_slider.model.js')(sequelize,Sequelize)
db.helpVideo = require('./help_video.model.js')(sequelize,Sequelize)
db.review = require('./review.model.js')(sequelize, Sequelize)
db.bookingRating = require('./booking_rating.model.js')(sequelize, Sequelize);
db.service = require('./services.model.js')(sequelize,Sequelize)
db.vendor_service = require('./vendor_service.model.js')(sequelize,Sequelize)
db.vendor_acc_delete_req = require('./vendor_acc_delete_req.model.js')(sequelize,Sequelize)
db.faqs = require('./faqs.model.js')(sequelize,Sequelize)
db.about = require('./about.model.js')(sequelize,Sequelize)
db.vendor_device_fcm = require('./vendor_device_fcm.js')(sequelize,Sequelize)
db.booking_cancel = require('./booking_cancle.model.js')(sequelize,Sequelize)
db.freeVehicle_cancel = require('./freeVehicle_cancel.model.js')(sequelize,Sequelize)
db.vendor_help = require('./vendor_help.model.js')(sequelize,Sequelize)
db.vendor_help_answer = require('./vendor_help_answer.model.js')(sequelize,Sequelize)
db.wallet = require('./wallet.model.js')(sequelize,Sequelize)
db.wallet_transaction = require('./wallet_transaction.model.js')(sequelize,Sequelize)
db.wallet_hold = require('./wallet_holds.model.js')(sequelize,Sequelize)
db.referral_setting = require('./referral_setting.model.js')(sequelize,Sequelize)
db.referral_history = require('./referral_history.model.js')(sequelize,Sequelize)


db.freeVehicle.belongsTo(db.vendor, { as: 'vendor', constraints: false });
db.vendor.hasMany(db.freeVehicle, { as: 'freeVehicles', constraints: false });

db.requestFreeVehicle.belongsTo(db.freeVehicle, { as: 'freeVehicle', constraints: false });
db.freeVehicle.hasMany(db.requestFreeVehicle, { as: 'requests', constraints: false });

db.requestFreeVehicle.belongsTo(db.vendor, { as: 'requester', constraints: false });
db.requestFreeVehicle.belongsTo(db.vendor, { as: 'owner', constraints: false });

db.booking.belongsTo(db.vendor, { as: 'vendor', constraints: false });
db.vendor.hasMany(db.booking, { as: 'bookings', constraints: false });

db.booking.hasMany(db.bookingRequest, { as: 'booking_requests', constraints: false });
db.booking.hasMany(db.bookingRejection, { as: 'booking_rejections', constraints: false });

db.bookingRequest.belongsTo(db.booking, { constraints: false });
db.bookingRejection.belongsTo(db.booking, { constraints: false });

db.bookingRequest.belongsTo(db.vendor, { as: 'requester', constraints: false });
db.bookingRejection.belongsTo(db.vendor, { as: 'rejecter', constraints: false });

db.booking.hasMany(db.bookingRating, { as: 'ratings', constraints: false });
db.bookingRating.belongsTo(db.booking, { as: 'booking', constraints: false });

db.vendor.hasMany(db.vendorRating, { as: 'ratings', constraints: false });
db.vendorRating.belongsTo(db.vendor, { as: 'vendor', constraints: false });
db.vendorRating.belongsTo(db.customer, { as: 'customer', constraints: false });
db.customer.hasMany(db.vendorRating, { as: 'givenRatings', constraints: false });

db.vendor.belongsToMany(db.service, { through: db.vendor_service, as: 'services', constraints: false });
db.service.belongsToMany(db.vendor, { through: db.vendor_service, as: 'vendors', constraints: false });

db.vendor_acc_delete_req.belongsTo(db.vendor, { constraints: false });
db.vendor.hasMany(db.vendor_acc_delete_req, { constraints: false });

db.vendor_help.hasMany(db.vendor_help_answer, { as: 'help_answers', constraints: false });
db.vendor_help_answer.belongsTo(db.vendor_help, { as: 'help', constraints: false });

db.referral_history.belongsTo(db.vendor, { as: 'Referrer', constraints: false });
db.referral_history.belongsTo(db.vendor, { as: 'Referee', constraints: false });

db.review.belongsTo(db.vendor, { as: 'reviewer', constraints: false });
db.vendor.hasMany(db.review, { as: 'reviews', constraints: false });

module.exports = db;