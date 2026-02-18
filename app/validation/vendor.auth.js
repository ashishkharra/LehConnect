const { body, param, query } = require("express-validator");
const { validatorMiddleware } = require('../shared/utils/validation')

module.exports.validate = (method) => {
    switch (method) {
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

                body('vehicle_name')
                    .trim()
                    .notEmpty()
                    .withMessage('vechile is required'),

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
                    .optional(),

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

    }
}