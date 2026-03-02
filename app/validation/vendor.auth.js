const { body, param, query } = require("express-validator");
const { validatorMiddleware } = require('../shared/utils/validation')

module.exports.validate = (method) => {
    switch (method) {
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

                validatorMiddleware
            ]
        }

        case 'free-vehicle-request-action': {
            return [
                body('action')
                    .isIn(['reject', 'accept', 'REJECT', 'ACCEPT'])
                    .withMessage("Invalid action type"),

                body('reason')
                    .isLength({ min: 20, max: 100 })
                    .withMessage('Reason must be between 20 to 100 words'),

                validatorMiddleware
            ]
        }

        case 'bid-booking': {
            return [
                // 🔹 Booking token (URL param)
                param('token')
                    .notEmpty()
                    .withMessage('Booking token is required')
                    .isLength({ min: 10 })
                    .withMessage('Invalid booking token'),

                // 🔹 Bid Amount
                body('bid_amount')
                    .notEmpty()
                    .withMessage('Bid amount is required')
                    .isFloat({ gt: 0 })
                    .withMessage('Bid amount must be greater than 0'),

                // 🔹 Remarks (optional)
                body('remarks')
                    .optional()
                    .isLength({ max: 255 })
                    .withMessage('Remarks cannot exceed 255 characters'),

                validatorMiddleware
            ];
        }

        case 'add-services': {
            return [
                body('service')
                    .isArray({ min: 1 })
                    .withMessage('Service must be an array with at least one item'),

                body('service.*')
                    .isString()
                    .notEmpty()
                    .withMessage('Each service token must be a valid string'),

                validatorMiddleware
            ];
        }

        case 'update-service': {
            return [
                param('token').notEmpty().withMessage('Service ID token is required'),
                body('service_token').optional().isString().withMessage('Valid service token required'),
                validatorMiddleware
            ];
        }

        case 'delete-service': {
            return [
                param('token').notEmpty().withMessage('Service ID token is required'),
                validatorMiddleware
            ];
        }

        case 'add-preferences': {
            return [
                param('token').notEmpty().withMessage('Unauthorized'),

                body('preference-state')
                    .notEmpty()
                    .withMessage('Preference state is required')
                    .trim(),

                body('preference-city')
                    .isArray({ max: 5 })
                    .withMessage('Preference city must be an array and max 5 cities'),

                body('preference-city.*')
                    .isString()
                    .trim()
                    .notEmpty()
                    .withMessage('City name must be a valid string'),
            ]
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

        case 'location-preferences': {
            return [
                body('state_preference')
                    .isString().withMessage('Invalid state type')
                    .trim()
                    .notEmpty().withMessage('State preference is required'),

                body('city_preferences')
                    .isArray({ min: 1, max: 5 })
                    .withMessage('City preferences must be an array with maximum 5 cities'),

                body('city_preferences.*')
                    .isString().withMessage('Invalid city name')
                    .trim()
                    .notEmpty().withMessage('City name cannot be empty'),

                validatorMiddleware
            ];
        }

        case 'aadhaar-verify': {
            return [
                body('aadhaar_number')
                    .isString().withMessage('Invalid aadhaar number type')
                    .trim()
                    .isLength({ min: 12, max: 12 }).withMessage('Aadhaar number length must be 12'),
                validatorMiddleware
            ]
        }

        case 'aadhaar-otp': {
            return [
                body('otp')
                    .notEmpty().withMessage('Otp is required')
                    .trim()
                    .isNumeric().withMessage('Invalid otp type'),
                validatorMiddleware
            ]
        }

        case 'dl-verify': {
            return [
                body('dl_number')
                    .trim()
                    .notEmpty().withMessage("Driving license is required"),

                body('birth_date')
                    .trim()
                    .notEmpty().withMessage('Birth date is required'),

                validatorMiddleware
            ]
        }

        case 'get-free-vehicle': {
            return [
                param('token')
                    .notEmpty()
                    .trim()
                    .withMessage('Token is required'),

                validatorMiddleware
            ]
        }

        case 'post-free-vehicle': {
            return [
                body('vehicle_type')
                    .notEmpty().withMessage('Vehicle type is required')
                    .isString()
                    .withMessage('Invalid vehicle type'),

                body('vehicle_name')
                    .notEmpty().withMessage('Vehicle name is required')
                    .isString().withMessage('Invalid vehicle name'),

                body('accept_type')
                    .isIn(['instant', 'approval'])
                    .withMessage('Invalid accept type'),

                body('state')
                    .trim()
                    .toLowerCase()
                    .notEmpty()
                    .withMessage('State is required')
                    .isLength({ min: 2, max: 50 })
                    .withMessage('State must be between 2 and 50 characters'),

                body('city')
                    .trim()
                    .toLowerCase()
                    .notEmpty()
                    .withMessage('City is required')
                    .isLength({ min: 2, max: 50 })
                    .withMessage('City must be between 2 and 50 characters'),

                body('location')
                    .trim()
                    .toLowerCase()
                    .notEmpty()
                    .withMessage('Location is required')
                    .isLength({ min: 5 })
                    .withMessage('Location is too short'),

                // Latitude (optional but if provided must be valid)

                // body('latitude')
                //     .optional()
                //     .isFloat({ min: -90, max: 90 })
                //     .withMessage('Invalid latitude'),

                // // Longitude (optional but if provided must be valid)
                // body('longitude')
                //     .optional()
                //     .isFloat({ min: -180, max: 180 })
                //     .withMessage('Invalid longitude'),

                body('free_start_time')
                    .notEmpty()
                    .withMessage('Free start time is required')
                    .isISO8601()
                    .withMessage('Invalid start time format'),

                body('free_end_time')
                    .notEmpty()
                    .withMessage('Free end time is required')
                    .isISO8601()
                    .withMessage('Invalid end time format')
                    .custom((value, { req }) => {
                        if (new Date(value) <= new Date(req.body.free_start_time)) {
                            throw new Error('End time must be after start time');
                        }
                        return true;
                    }),

                body('available_anywhere')
                    .optional()
                    .isBoolean()
                    .withMessage('available_anywhere must be boolean'),

                body('notes')
                    .optional()
                    .isLength({ max: 500 })
                    .withMessage('Notes cannot exceed 500 characters'),

                validatorMiddleware
            ]
        }

        case 'accept-vehicle-request': {
            return [
                param('token')
                    .notEmpty()
                    .trim()
                    .withMessage('Invalid vehicle token')
            ]
        }

        case 'post-booking': {
            return [
                body('trip_type')
                    .isIn(['one_way', 'round_trip'])
                    .withMessage('trip_type must be one_way or round_trip'),

                body('vehicle_type')
                    .trim()
                    .notEmpty()
                    .withMessage('vehicle_type is required'),

                body('pickup_datetime')
                    .isISO8601()
                    .withMessage('pickup_datetime must be a valid datetime'),

                body('return_datetime')
                    .if(body('trip_type').equals('round_trip'))
                    .isISO8601()
                    .withMessage('return_datetime is required for round_trip')
                    .custom((value, { req }) => {
                        if (new Date(value) <= new Date(req.body.pickup_datetime)) {
                            throw new Error('return_datetime must be after pickup_datetime');
                        }
                        return true;
                    }),

                body('pickup_location')
                    .trim()
                    .notEmpty()
                    .withMessage('pickup_location is required'),

                body('drop_location')
                    .trim()
                    .notEmpty()
                    .withMessage('drop_location is required'),

                body('city')
                    .trim()
                    .notEmpty()
                    .withMessage('city is required'),

                body('state')
                    .trim()
                    .notEmpty()
                    .withMessage('state is required'),

                body('booking_amount')
                    .optional(),

                body('commission')
                    .optional(),

                body('total_amount')
                    .notEmpty()
                    .withMessage('Total amount is required')
                    .isFloat({ min: 0 })
                    .withMessage('Total amount must be a positive number')
                    .custom((value) => {
                        if (!/^\d+(\.\d{1,2})?$/.test(value)) {
                            throw new Error('Total amount can have up to 2 decimal places');
                        }
                        return true;
                    }),

                body('is_negotiable')
                    .optional()
                    .isBoolean()
                    .withMessage('is_negotiable must be boolean'),

                body('secure_booking')
                    .optional()
                    .isBoolean()
                    .withMessage('secure_booking must be boolean'),

                body('accept_type')
                    .isIn(['instant', 'approval', 'bidding'])
                    .withMessage('accept_type can be Instant or approval'),

                body('visibility')
                    .optional()
                    .isIn(['public', 'my_network'])
                    .withMessage('visibility must be public or my_network'),

                body('extra_requirements')
                    .optional()
                    .isObject()
                    .withMessage('extra_requirements must be a JSON object'),

                validatorMiddleware
            ]
        }

        case 'get-booking': {
            return [
                param('token')
                    .notEmpty()
                    .trim()
                    .withMessage('Invalid token'),
                validatorMiddleware
            ]
        }

        case 'booking-accept': {
            return [
                param('token')
                    .notEmpty()
                    .trim()
                    .withMessage('Invalid token'),
                validatorMiddleware
            ]
        }

        case 'booking-reject': {
            return [
                param('token')
                    .notEmpty()
                    .trim()
                    .withMessage('Invalid token'),

                body('reason')
                    .notEmpty()
                    .isString()
                    .ltrim().rtrim()
                    .withMessage('Reason is required'),
                validatorMiddleware
            ]
        }

        case 'booking-request-action': {
            return [
                param('token')
                    .notEmpty()
                    .trim()
                    .withMessage('Invalid token'),

                body('action')
                    .isIn(['accept', 'reject', 'ACCEPT', 'REJECT'])
                    .trim()
                    .withMessage('Action is required'),

                body('reason')
                    .optional(),

                validatorMiddleware
            ]
        }

        case 'rate-booking': {
            return [
                param('token')
                    .notEmpty()
                    .trim()
                    .withMessage('Invalid booking token'),
                body('stars')
                    .isInt({ min: 1, max: 5 })
                    .withMessage('Stars must be an integer between 1 and 5'),
                body('comment')
                    .optional()
                    .isString()
                    .withMessage('Comment must be a string'),
                validatorMiddleware
            ]
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

                validatorMiddleware
            ];
        }


        case 'post-flight-enquiry': {
            return [
                body('trip_type')
                    .notEmpty().withMessage('Trip type is required')
                    .isIn(['one_way', 'round_trip']).withMessage('Trip type must be one_way or round_trip'),

                body('from_location')
                    .notEmpty().withMessage('From location is required')
                    .isString().withMessage('Invalid from location')
                    .trim()
                    .isLength({ min: 2, max: 100 }).withMessage('From location must be between 2 and 100 characters'),

                body('to_location')
                    .notEmpty().withMessage('To location is required')
                    .isString().withMessage('Invalid to location')
                    .trim()
                    .isLength({ min: 2, max: 100 }).withMessage('To location must be between 2 and 100 characters'),

                body('departure_date')
                    .notEmpty().withMessage('Departure date is required')
                    .isISO8601().withMessage('Invalid departure date format')
                    .toDate(),

                body('return_date')
                    .optional()
                    .isISO8601().withMessage('Invalid return date format')
                    .toDate()
                    .custom((value, { req }) => {
                        // If trip is round_trip, return_date is mandatory
                        if (req.body.trip_type === 'round_trip' && !value) {
                            throw new Error('Return date is required for round trip');
                        }
                        // If provided, ensure it's after departure
                        if (value && new Date(value) <= new Date(req.body.departure_date)) {
                            throw new Error('Return date must be after departure date');
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

                validatorMiddleware
            ];
        }

    }
}