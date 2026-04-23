const { body, param, query } = require('express-validator')
const { validatorMiddlewareAdmin } = require('../shared/utils/validation')

module.exports.validate = (method) => {
    switch (method) {
        case 'admin-login': {
            return [
                body('email')
                    .notEmpty().withMessage('Email is required')
                    .trim()
                    .isEmail().withMessage('Email must be a valid email address')
                    .normalizeEmail(),

                body('password')
                    .notEmpty().withMessage('Password is required')
                    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
                    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
                    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
                    .matches(/[0-9]/).withMessage('Password must contain at least one number')
                    .matches(/[^A-Za-z0-9]/).withMessage('Password must contain at least one special character')
                    .trim(),

                validatorMiddlewareAdmin
            ]
        }

        case 'add-vehicle': {
            return [
                body('make')
                    .notEmpty().withMessage('Make is required')
                    .trim()
                    .isString().withMessage('Make must be a string'),

                body('model')
                    .notEmpty().withMessage('Model is required')
                    .trim()
                    .isString().withMessage('Model must be a string'),

                body('year')
                    .notEmpty().withMessage('Year is required')
                    .isInt({ min: 1900, max: new Date().getFullYear() })
                    .withMessage(`Year must be between 1900 and ${new Date().getFullYear()}`),

                body('type')
                    .notEmpty().withMessage('Type is required')
                    .trim()
                    .isString().withMessage('Type must be a string'),

                validatorMiddlewareAdmin
            ]
        }

        case 'edit-profile': {
            return [
                body('username')
                    .optional()
                    .trim()
                    .isString()
                    .withMessage('Username must be string'),

                body('email')
                    .optional()
                    .trim()
                    .isEmail().withMessage('Email must be a valid email address')
                    .normalizeEmail(),

                validatorMiddlewareAdmin
            ]
        }

        case 'edit-password': {
            return [
                body('currentPassword')
                    .notEmpty().withMessage('Current password is required'),

                body('newPassword')
                    .notEmpty().withMessage('New password is required')
                    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
                    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
                    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
                    .matches(/[0-9]/).withMessage('Password must contain at least one number')
                    .matches(/[^A-Za-z0-9]/).withMessage('Password must contain at least one special character'),

                body('confirmPassword')
                    .notEmpty().withMessage('Confirm password is required')
                    .custom((value, { req }) => {
                        if (value !== req.body.newPassword) {
                            throw new Error('Confirm password does not match new password');
                        }
                        return true;
                    }),

                validatorMiddlewareAdmin
            ];
        }

        case 'upload-video': {
            return [
                body('source_type')
                    .notEmpty()
                    .isString()
                    .trim()
                    .withMessage('Source type is required'),

                body('title')
                    .notEmpty()
                    .trim()
                    .withMessage('Title is required'),

                body('description')
                    .optional()
                    .ltrim().rtrim(),

                body('category')
                    .notEmpty()
                    .trim()
                    .withMessage('Category is required'),

                body('url')
                    .optional()
                    .isString().withMessage('Url must be string')
                    .trim(),

                validatorMiddlewareAdmin
            ]
        }

        case 'vendor-profile-reject': {
            return [
                body('token')
                    .notEmpty()
                    .trim()
                    .withMessage('Token is required'),

                body('action')
                    .isIn(["reject"])
                    .withMessage("action must be reject"),

                body('reject_reason_code')
                    .notEmpty()
                    .trim()
                    .withMessage('Reject reason code is required'),

                body('reject_notes')
                    .notEmpty()
                    .trim()
                    .withMessage('Reject notes is required'),

                validatorMiddlewareAdmin
            ]
        }

        case 'review-create': {
            return [
                body('name')
                    .trim()
                    .notEmpty()
                    .withMessage('Name is required')
                    .isString()
                    .withMessage('Name must be a string'),

                body('rating')
                    .notEmpty()
                    .withMessage('Rating is required')
                    .isInt({ min: 1, max: 5 })
                    .withMessage('Rating must be between 1 and 5'),

                body('comment')
                    .trim()
                    .notEmpty()
                    .withMessage('Comment is required')
                    .isLength({ min: 5 })
                    .withMessage('Comment must be at least 5 characters long'),

                body('review_by')
                    .optional()
                    .isIn(['CUSTOMER', 'VENDOR'])
                    .withMessage('Invalid review_by value'),

                body('review_for')
                    .optional()
                    .isIn(['VENDOR', 'PLATFORM', 'CUSTOMER'])
                    .withMessage('Invalid review_for value'),

                body('status')
                    .optional()
                    .isIn(['PENDING', 'APPROVED', 'REJECTED'])
                    .withMessage('Invalid review status'),

                validatorMiddlewareAdmin
            ];
        }

        case 'add-service': {
            return [
                body('name')
                    .notEmpty().withMessage('Service name is required')
                    .trim()
                    .isString().withMessage('Service name is invalid'),

                body('description')
                    .ltrim().rtrim()
                    .optional(),

                validatorMiddlewareAdmin
            ]
        }

        case 'delete-request-action': {
            return [
                body('token')
                    .notEmpty().withMessage('Token is required')
                    .trim()
                    .isString().withMessage('Token invalid type'),

                body('action')
                    .isIn(["approve", "reject"]).withMessage("Invalid action type")
                    .trim(),

                body('remark')
                    .optional(),

                validatorMiddlewareAdmin
            ]
        }

        case 'add-faq': {
            return [
                body('question')
                    .notEmpty().withMessage('Question is required')
                    .isLength({ min: 5 }).withMessage('Question must be at least 5 characters')
                    .trim(),

                body('answer')
                    .notEmpty().withMessage('Answer is required')
                    .isLength({ min: 10 }).withMessage('Answer must be at least 10 characters')
                    .trim(),

                body('status')
                    .optional()
                    .isIn(['active', 'inactive'])
                    .withMessage('Invalid status'),

                body('position')
                    .optional()
                    .isInt({ min: 0 })
                    .withMessage('Position must be a positive number'),

                validatorMiddlewareAdmin
            ];
        }

        case 'add-about': {
            return [
                body('heading')
                    .notEmpty().withMessage('Heading is required')
                    .trim()
                    .isLength({ min: 2, max: 100 }).withMessage('Heading must be between 2 to 100 characters'),

                body('title')
                    .notEmpty().withMessage('Title is required')
                    .trim()
                    .isLength({ min: 2, max: 150 }).withMessage('Title must be between 2 to 150 characters'),

                body('description')
                    .notEmpty().withMessage('Description is required')
                    .trim()
                    .isLength({ min: 10 }).withMessage('Description must be at least 10 characters'),

                body('status')
                    .optional()
                    .isIn(['active', 'inactive']).withMessage('Invalid status'),

                validatorMiddlewareAdmin
            ];
        }

        case 'set-referral': {
            return [
                body('referrer_bonus')
                    .exists().withMessage('Referrer bonus is required')
                    .isNumeric().withMessage('Referrer bonus must be a number')
                    .custom(value => value >= 0)
                    .withMessage('Referrer bonus cannot be negative')
                    .custom(value => value <= 100000)
                    .withMessage('Bonus amount too large'),

                body('referee_bonus')
                    .exists().withMessage('Referee bonus is required')
                    .isNumeric().withMessage('Referee bonus must be a number')
                    .custom(value => value >= 0)
                    .withMessage('Referee bonus cannot be negative')
                    .custom(value => value <= 100000)
                    .withMessage('Bonus amount too large'),

                validatorMiddlewareAdmin
            ]
        }

    }
}
