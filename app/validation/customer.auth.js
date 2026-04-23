const { body, query } = require("express-validator");
const { validatorMiddleware } = require("../shared/utils/validation");

module.exports.validate = (method) => {
    switch (method) {
        case "create-enquiry": {
            return [

                // 👤 NAME
                body("name")
                    .trim()
                    .notEmpty()
                    .withMessage("Name is required")
                    .isLength({ min: 2, max: 100 })
                    .withMessage("Name must be between 2 and 100 characters"),

                // 📧 EMAIL (optional)
                body("email")
                    .optional()
                    .trim()
                    .isEmail()
                    .withMessage("Invalid email address"),

                // 📱 MOBILE
                body("mobile")
                    .trim()
                    .notEmpty()
                    .withMessage("Mobile number is required")
                    .isNumeric()
                    .withMessage("Mobile number must contain only digits")
                    .isLength({ min: 10, max: 15 })
                    .withMessage("Mobile number must be between 10 and 15 digits"),

                // 📦 REQUIREMENT TYPE
                body("requirement_type")
                    .notEmpty()
                    .withMessage("Requirement type is required")
                    .isIn([
                        "hotel",
                        "cab",
                        "tour",
                        "package",
                        "event",
                        "other"
                    ])
                    .withMessage("Invalid requirement type"),

                // 📅 DATE
                body("enquiry_date")
                    .notEmpty()
                    .withMessage("Date is required")
                    .isISO8601()
                    .withMessage("Invalid date format"),

                // ⏰ TIME
                body("enquiry_time")
                    .notEmpty()
                    .withMessage("Time is required")
                    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
                    .withMessage("Time must be in HH:mm format"),

                // 📍 LOCATION
                body("location")
                    .trim()
                    .notEmpty()
                    .withMessage("Location is required")
                    .isLength({ max: 255 })
                    .withMessage("Location is too long"),

                // 👥 ADULTS
                body("adults")
                    .optional()
                    .isInt({ min: 1 })
                    .withMessage("Adults must be at least 1"),

                // 👶 CHILDREN
                body("children")
                    .optional()
                    .isInt({ min: 0 })
                    .withMessage("Children cannot be negative"),

                // 📝 COMMENTS
                body("comments")
                    .optional()
                    .trim()
                    .isLength({ max: 1000 })
                    .withMessage("Comments cannot exceed 1000 characters"),

                // 🔎 SOURCE (optional)
                body("source")
                    .optional()
                    .isIn(["web", "app", "whatsapp", "admin"])
                    .withMessage("Invalid source"),

                validatorMiddleware
            ];
        }

        case "customer-enquiries-list": {
            return [
                query("number")
                    .notEmpty()
                    .withMessage("Number is required")
                    .isLength({ min: 8, max: 20 })
                    .withMessage("Number must be between 8 and 20 characters"),

                query("token")
                    .optional({ nullable: true })
                    .isLength({ min: 5, max: 100 })
                    .withMessage("Token must be valid"),

                query("page")
                    .optional()
                    .isInt({ min: 1 })
                    .withMessage("Page must be a positive integer")
                    .toInt(),

                query("limit")
                    .optional()
                    .isInt({ min: 1, max: 100 })
                    .withMessage("Limit must be between 1 and 100")
                    .toInt(),

                query("enquiry_type")
                    .optional({ nullable: true })
                    .isIn(["flight", "hotel", "holiday_package", "insurance"])
                    .withMessage("Invalid enquiry type"),

                validatorMiddleware,
            ];
        }

        case 'post-holiday-package': {
            return [
                body("from_city")
                    .notEmpty()
                    .withMessage("From city is required")
                    .isLength({ min: 2, max: 150 })
                    .withMessage("From city must be between 2 and 150 characters"),


                body("to_city")
                    .notEmpty()
                    .withMessage("To city is required")
                    .isLength({ min: 2, max: 150 })
                    .withMessage("To city must be between 2 and 150 characters"),


                body("departure_date")
                    .notEmpty()
                    .withMessage("Departure date is required")
                    .isISO8601()
                    .withMessage("Departure date must be valid date"),


                body("adults")
                    .optional()
                    .isInt({ min: 1, max: 12 })
                    .withMessage("Adults must be between 1 and 12"),


                body("children")
                    .optional()
                    .isInt({ min: 0, max: 6 })
                    .withMessage("Children must be between 0 and 6"),


                body("rooms")
                    .optional()
                    .isInt({ min: 1, max: 6 })
                    .withMessage("Rooms must be between 1 and 6"),

                body('contact')
                    .optional(),

                body('from_web')
                    .optional()
                    .isBoolean().withMessage('from_web must be boolean')
                    .toBoolean(),

                validatorMiddleware
            ]
        }

        case 'post-cab-enquiry': {
            return [
                body('trip_type')
                    .notEmpty().withMessage('Trip type is required')
                    .isIn(['oneway', 'round_trip', 'local'])
                    .withMessage('Trip type must be oneway, round_trip, or local'),

                body('from_location')
                    .notEmpty().withMessage('From location is required')
                    .isString().withMessage('Invalid from location')
                    .trim()
                    .isLength({ min: 2, max: 255 })
                    .withMessage('From location must be between 2 and 255 characters'),

                body('to_location')
                    .if(body('trip_type').isIn(['oneway', 'round_trip']))
                    .notEmpty().withMessage('To location is required for oneway and round trip')
                    .isString().withMessage('Invalid to location')
                    .trim()
                    .isLength({ min: 2, max: 255 })
                    .withMessage('To location must be between 2 and 255 characters'),

                body('departure_date')
                    .notEmpty().withMessage('Departure date is required')
                    .isISO8601().withMessage('Invalid departure date format')
                    .toDate(),

                body('return_date')
                    .if(body('trip_type').equals('round_trip'))
                    .notEmpty().withMessage('Return date is required for round trip')
                    .isISO8601().withMessage('Invalid return date format')
                    .toDate()
                    .custom((value, { req }) => {
                        if (value && new Date(value) <= new Date(req.body.departure_date)) {
                            throw new Error('Return date must be after departure date');
                        }
                        return true;
                    }),

                body('car_type')
                    .optional()
                    .isString().withMessage('Invalid car type')
                    .isIn(['Sedan', 'SUV', 'hatchback', 'tempo traveller', 'bus'])
                    .withMessage('Invalid car type selected'),

                body('contact')
                    .optional(),

                body('from_web')
                    .optional()
                    .isBoolean().withMessage('from_web must be boolean')
                    .toBoolean(),

                validatorMiddleware
            ]
        }

        case 'post-flight-enquiry': {
            return [
                body('trip_type')
                    .notEmpty().withMessage('Trip type is required')
                    .isIn(['one_way', 'round_trip', 'multi_city']).withMessage('Trip type must be oneway, round, or multi'),

                body('from_location')
                    .optional({ nullable: true })
                    .isString().withMessage('Invalid from location')
                    .trim()
                    .isLength({ min: 2, max: 100 }).withMessage('From location must be between 2 and 100 characters'),

                body('to_location')
                    .optional({ nullable: true })
                    .isString().withMessage('Invalid to location')
                    .trim()
                    .isLength({ min: 2, max: 100 }).withMessage('To location must be between 2 and 100 characters'),

                body('departure_date')
                    .optional({ nullable: true })
                    .isISO8601().withMessage('Invalid departure date format'),

                body('return_date')
                    .optional({ nullable: true })
                    .isISO8601().withMessage('Invalid return date format')
                    .custom((value, { req }) => {
                        if (req.body.trip_type === 'round') {
                            if (!value) {
                                throw new Error('Return date is required for round trip');
                            }
                            if (new Date(value) <= new Date(req.body.departure_date)) {
                                throw new Error('Return date must be after departure date');
                            }
                        }
                        return true;
                    }),

                body('segments')
                    .optional()
                    .isArray({ min: 1 }).withMessage('Segments must be a non-empty array')
                    .custom((segments, { req }) => {
                        if (req.body.trip_type === 'multi') {
                            if (!Array.isArray(segments) || segments.length < 2) {
                                throw new Error('At least 2 segments are required for multi trip');
                            }

                            for (let i = 0; i < segments.length; i++) {
                                const seg = segments[i];

                                if (!seg.from_location || typeof seg.from_location !== 'string') {
                                    throw new Error(`from_location is required in segment ${i + 1}`);
                                }

                                if (!seg.to_location || typeof seg.to_location !== 'string') {
                                    throw new Error(`to_location is required in segment ${i + 1}`);
                                }

                                if (!seg.departure_date || isNaN(Date.parse(seg.departure_date))) {
                                    throw new Error(`Valid departure_date is required in segment ${i + 1}`);
                                }
                            }
                        }
                        return true;
                    }),

                body().custom((value, { req }) => {
                    const { trip_type, from_location, to_location, departure_date, segments } = req.body;

                    if (trip_type === 'oneway' || trip_type === 'round') {
                        if (!from_location) throw new Error('From location is required');
                        if (!to_location) throw new Error('To location is required');
                        if (!departure_date) throw new Error('Departure date is required');
                    }

                    if (trip_type === 'multi') {
                        if (!segments || !Array.isArray(segments) || segments.length === 0) {
                            throw new Error('Segments are required for multi trip');
                        }
                    }

                    return true;
                }),

                body('adults')
                    .optional()
                    .isInt({ min: 1, max: 9 }).withMessage('Adults must be between 1 and 9'),

                body('children')
                    .optional()
                    .isInt({ min: 0, max: 8 }).withMessage('Children must be between 0 and 8'),

                body('class_type')
                    .notEmpty().withMessage('Class type is required')
                    .isIn(['economy', 'business', 'first']).withMessage('Class type must be economy, business, or first'),

                body('contact')
                    .optional(),

                body('from_web')
                    .optional()
                    .isBoolean().withMessage('from_web must be boolean')
                    .toBoolean(),

                validatorMiddleware
            ];
        }

        case 'post-hotel-enquiry': {
            return [
                body('area')
                    .notEmpty().withMessage('Area is required')
                    .isString().withMessage('Invalid area')
                    .trim()
                    .isLength({ min: 2, max: 255 }).withMessage('Area must be between 2 and 255 characters'),

                body('check_in')
                    .notEmpty().withMessage('Check-in date is required')
                    .isISO8601().withMessage('Invalid check-in date format')
                    .toDate(),

                body('check_out')
                    .notEmpty().withMessage('Check-out date is required')
                    .isISO8601().withMessage('Invalid check-out date format')
                    .toDate()
                    .custom((value, { req }) => {
                        if (new Date(value) <= new Date(req.body.check_in)) {
                            throw new Error('Check-out date must be after check-in date');
                        }
                        return true;
                    }),

                body('adults')
                    .optional()
                    .isInt({ min: 1, max: 20 }).withMessage('Adults must be between 1 and 20'),

                body('children')
                    .optional()
                    .isInt({ min: 0, max: 10 }).withMessage('Children must be between 0 and 10'),

                body('rooms')
                    .optional()
                    .isInt({ min: 1, max: 10 }).withMessage('Rooms must be between 1 and 10'),

                body('contact')
                    .optional(),

                body('from_web')
                    .optional()
                    .isBoolean().withMessage('from_web must be boolean')
                    .toBoolean(),


                validatorMiddleware
            ];
        }

        case 'post-insurance-enquiry': {
            return [
                body('car_number')
                    .notEmpty().withMessage('Car number is required')
                    .isString().withMessage('Invalid car number')
                    .trim(),
                body('name')
                    .notEmpty().withMessage('Name is required')
                    .isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
                body('contact')
                    .notEmpty().withMessage('Contact is required')
                    .isMobilePhone().withMessage('Invalid contact number'),
                body('agree_policy')
                    .isBoolean().withMessage('agree_policy must be true/false'),
                body('whatsapp')
                    .optional()
                    .isBoolean().withMessage('whatsapp must be true/false'),
                body('from_web')
                    .optional()
                    .isBoolean().withMessage('from_web must be boolean')
                    .toBoolean(),
                validatorMiddleware
            ];
        }

        case 'basic-details': {
            return [
                body('first_name')
                    .notEmpty().withMessage('first_name is required')
                    .trim()
                    .isLength({ min: 3 }).withMessage("Minimum length required is 3")
                    .isString().withMessage('Invalid first_name type'),

                body('last_name')
                    .notEmpty().withMessage('last_name is required')
                    .trim()
                    .isLength({ min: 3 }).withMessage("Minimum length required is 3")
                    .isString().withMessage('Invalid last_name type'),

                body('email')
                    .notEmpty().withMessage('Email is required')
                    .isEmail().withMessage("Invalid email type")
                    .trim(),

                body('country')
                    .notEmpty().withMessage('Country is required')
                    .trim(),

                body('city')
                    .notEmpty().withMessage('City is required')
                    .trim(),

                body('state')
                    .notEmpty().withMessage('State is required')
                    .trim(),

                body('about_me')
                    .optional()
                    .ltrim().rtrim()
                    .isString().withMessage('Invalid about me type'),

                validatorMiddleware
            ]
        }
    }
};
