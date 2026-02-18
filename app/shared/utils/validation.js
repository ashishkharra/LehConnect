const { validationResult } = require('express-validator')
const { responseData_ } = require('./helper')

function validateEmail(email) {
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
}

function validatePhone(phone) {
    if (!phone) return false;

    phone = phone.replace(/[\s-]/g, "");

    if (phone.startsWith("+91")) {
        phone = phone.slice(3);
    } else if (phone.startsWith("91") && phone.length === 12) {
        phone = phone.slice(2);
    }

    if (!/^\d{10}$/.test(phone)) {
        return false;
    }

    if (!/^[6-9]/.test(phone)) {
        return false;
    }

    if (/^(\d)\1{9}$/.test(phone)) {
        return false;
    }

    return true;
}

function validatorMiddleware(req, res, next) {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res
            .status(422)
            .json(responseData_(errors.errors[0].msg, {}, false))
    } else {
        next()
    }
}

function validatorMiddlewareAdmin(req, res, next) {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        const firstError = errors.array()[0].msg;
        req.setFlash('error', firstError);
        const backURL = req.get('Referer') || '/';
        return res.redirect(backURL);
    }
    next();
}


module.exports = { 
    validateEmail, 
    validatePhone,
    validatorMiddleware,
    validatorMiddlewareAdmin 
};