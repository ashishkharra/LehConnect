const { validationResult } = require("express-validator");

exports.runSocketValidation = async (rules, data) => {
    const req = {
        body: data,
        params: {},
        query: {}
    };

    for (const rule of rules) {
        await rule.run(req);
    }

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return {
            valid: false,
            errors: errors.array()
        };
    }

    return { valid: true };
};
