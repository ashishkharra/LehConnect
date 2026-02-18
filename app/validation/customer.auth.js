const { body } = require("express-validator");
const { validatorMiddlewareAdmin } = require("../shared/utils/validation");

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

                validatorMiddlewareAdmin
            ];
        }

    }
};
