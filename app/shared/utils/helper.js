const crypto = require('crypto');
const { enc_key } = require("../../config/globals.js");
const buff_key = Buffer.from(enc_key, "hex");
const { redisClient } = require('../../config/redis.config.js');


const calculateVerificationPercentage = (vendor, vp, vp_status) => {
    if (vendor.name && vendor.city && vendor.state) {
        vp += 30
    } else if (vendor.aadhaar_number !== null && vendor.otp !== null) {
        vp += 40
    } else if (vendor.dl_number && vendor.birth_date) {
        vp += 30
    }

    if (vp > 100) vp = 100

    if (vp === 0) vp_status = 'NOT_STARTED'
    else if (vp < 50) vp_status = 'PARTIAL'
    else if (vp < 100) vp_status = 'ALMOST_COMPLETED'
    else vp_status = 'VERIFIED'

    return { vp, vp_status }
}

const calculateVerificationPercentage_dummy = (operation, vp, vp_status) => {
    if (operation === 'PROFILE_VERIFICATION') {
        vp += 25
    } else if (operation === 'AADHAAR_VERIFICATION') {
        vp += 25
    } else if (operation === 'DRIVING_LICENSE_VERIFICATION') {
        vp += 25
    } else if (operation === 'VEHICLE_VERIFICATION') {
        vp += 25
    }

    if (vp > 100) vp = 100

    if (vp === 0) vp_status = 'NOT_STARTED'
    else if (vp < 50) vp_status = 'PARTIAL'
    else if (vp < 100) vp_status = 'ALMOST_COMPLETED'
    else vp_status = 'VERIFIED'

    return { vp, vp_status }
}

function responseData(message, result, req, success) {
    let response = {}
    response.success = success
    response.message = message
    response.results = result
    return response
}

function responseData_(message, result, success) {
    let response = {}
    response.success = success
    response.message = message
    response.results = result

    return response
}

function getFormattedDate(format = "YYYY-MM-DD") {
    const date = new Date();

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    if (format === "YYYY-MM-DD") {
        return `${year}-${month}-${day}`;
    }

    if (format === "DD-MM-YYYY") {
        return `${day}-${month}-${year}`;
    }

    if (format === "MM-DD-YYYY") {
        return `${month}-${day}-${year}`;
    }

    // fallback
    return `${year}-${month}-${day}`;
}

function generateOTP() {
    return crypto.randomInt(100000, 999999);
}

// const getSequelizePagination = async ({
//     page = 1,
//     limit = 12,
//     order = [],
//     where = {},
//     include = [],
//     attributes,
//     model,
//     group
// }) => {
//     page = Math.max(parseInt(page, 10) || 1, 1);
//     limit = Math.min(Math.max(parseInt(limit, 10) || 12, 1), 50);

//     const offset = (page - 1) * limit;
//     const totalDocs = await model.count({ where });

//     const rows = await model.findAll({
//         where,
//         include,
//         attributes,
//         order,
//         limit,
//         offset,
//         group,
//         subQuery: false
//     });

//     return {
//         docs: rows,
//         totalDocs,
//         limit,
//         page,
//         totalPages: Math.ceil(totalDocs / limit)
//     };
// };

const getSequelizePagination = async ({
    page = 1,
    limit = 12,
    order = [],
    where = {},
    include = [],
    attributes,
    model,
    group
}) => {
    page = Math.max(parseInt(page, 10) || 1, 1);
    limit = Math.min(Math.max(parseInt(limit, 10) || 12, 1), 50);

    const offset = (page - 1) * limit;

    const { count, rows } = await model.findAndCountAll({
        where,
        include,
        attributes,
        order,
        limit,
        offset,
        group,
        distinct: true,
        subQuery: false
    });

    return {
        docs: rows,
        totalDocs: Array.isArray(count) ? count.length : count,
        limit,
        page,
        totalPages: Math.ceil((Array.isArray(count) ? count.length : count) / limit)
    };
};

function getIconForCounter(key) {
    const iconMap = {
        'happy_customers': 'ti-users',
        'verified_vendors': 'ti-building-store',
        'app_rating': 'ti-star',
        'total_cities': 'ti-map-pin',
        'total_bookings': 'ti-calendar',
        'active_users': 'ti-user',
        'support_rating': 'ti-headset',
        'app_downloads': 'ti-download',
        'show_counters': 'ti-eye',
        'auto_update': 'ti-refresh'
    };
    return iconMap[key] || 'ti-circle';
}

function getSuffixForCounter(key) {
    const suffixMap = {
        'happy_customers': 'K+',
        'verified_vendors': '+',
        'app_rating': '/5',
        'total_cities': '+',
        'support_rating': '%',
        'app_downloads': 'K+'
    };
    return suffixMap[key] || '';
}

function getCategoryForCounter(key) {
    const mainCounters = ['happy_customers', 'verified_vendors', 'app_rating', 'total_cities'];
    const systemCounters = ['show_counters', 'auto_update'];

    if (mainCounters.includes(key)) return 'main';
    if (systemCounters.includes(key)) return 'system';
    return 'secondary';
}

function getPositionForCounter(key) {
    const positionMap = {
        'happy_customers': 1,
        'verified_vendors': 2,
        'app_rating': 3,
        'total_cities': 4,
        'total_bookings': 5,
        'active_users': 6,
        'support_rating': 7,
        'app_downloads': 8,
        'show_counters': 1,
        'auto_update': 2
    };
    return positionMap[key] || 99;
}

function codeGenerator(raw) {
    const code = raw
        .toUpperCase()
        .replace(/[^A-Z ]/g, '')
        .replace(/\s+/g, '_');

    return code
}

const generateRefCode = ({ role, state }) => {
    
    const prefix = "LEH";

    const roleCode = role?.toLowerCase() === "customer" ? "C" : "V";

    const stateCodes = {
        andhra_pradesh: "AP",
        arunachal_pradesh: "AR",
        assam: "AS",
        bihar: "BR",
        chhattisgarh: "CG",
        goa: "GA",
        gujarat: "GJ",
        haryana: "HR",
        himachal_pradesh: "HP",
        jharkhand: "JH",
        karnataka: "KA",
        kerala: "KL",
        madhya_pradesh: "MP",
        maharashtra: "MH",
        manipur: "MN",
        meghalaya: "ML",
        mizoram: "MZ",
        nagaland: "NL",
        odisha: "OD",
        punjab: "PB",
        rajasthan: "RJ",
        sikkim: "SK",
        tamil_nadu: "TN",
        telangana: "TS",
        tripura: "TR",
        uttar_pradesh: "UP",
        uttarakhand: "UK",
        west_bengal: "WB",
        andaman_and_nicobar_islands: "AN",
        chandigarh: "CH",
        dadra_and_nagar_haveli_and_daman_and_diu: "DN",
        delhi: "DL",
        jammu_and_kashmir: "JK",
        ladakh: "LA",
        lakshadweep: "LD",
        puducherry: "PY"
    };

    const normalizedState = state
        ?.toLowerCase()
        .trim()
        .replace(/\s+/g, "_");

    const stateCode = stateCodes[normalizedState] || "NA";

    const randomNumber = Math.floor(100000 + Math.random() * 900000);

    return `${prefix}${roleCode}${stateCode}${randomNumber}`;
};

const getDeviceHash = (req) => {
    const raw = [
        req.get('User-Agent') || '',
        req.headers['x-device-id'] || ''
    ].join('|');

    return crypto
        .createHash('sha256')
        .update(raw)
        .digest('hex');
};

const encryptRefreshToken = (refreshToken) => {
    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv(
        "aes-256-gcm",
        buff_key,
        iv
    );

    const encrypted = Buffer.concat([
        cipher.update(refreshToken, "utf8"),
        cipher.final()
    ]);

    return {
        iv: iv.toString("hex"),
        content: encrypted.toString("hex"),
        tag: cipher.getAuthTag().toString("hex"),
    };
};

const decryptRefreshToken = (encryptedData) => {
    const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        buff_key,
        Buffer.from(encryptedData.iv, "hex")
    );

    decipher.setAuthTag(Buffer.from(encryptedData.tag, "hex"));

    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encryptedData.content, "hex")),
        decipher.final()
    ]);

    return decrypted.toString("utf8");
};

const hashPassword = (password) => {
    const salt = crypto.randomBytes(16);
    const derivedKey = crypto.scryptSync(password, salt, 64);

    return {
        salt: salt.toString('hex'),
        hash: derivedKey.toString('hex'),
    };
}

const verifyPassword = (password, storedHash, storedSalt) => {
    const derivedKey = crypto.scryptSync(password, Buffer.from(storedSalt, 'hex'), 64);
    return derivedKey.toString('hex') === storedHash;
}

const randomstring = (option) => {
    if (typeof option === "number") {
        option = { length: option };
    }

    const letters = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let string = "";

    const isNumeric = option.type === "numeric";
    const max = isNumeric ? 10 : letters.length;

    for (let i = 0; i < option.length; i++) {
        let index = Math.floor(Math.random() * max);
        if (i === 0 && index === 0) {
            i--;
            continue;
        }
        string += letters[index];
    }
    return string;
};

async function getCache(key) {
    try {
        const data = await redisClient.get(key);
        return data ? JSON.parse(data) : null;
    } catch (err) {
        console.error('Redis GET error:', err);
        return null;
    }
}

async function setCache(key, value, ttl = 60) {
    try {
        await redisClient.setEx(key, ttl, JSON.stringify(value));
    } catch (err) {
        console.error('Redis SET error:', err);
    }
}

async function delCache(key) {
    try {
        await redisClient.del(key);
    } catch (err) {
        console.error('Redis DEL error:', err);
    }
}

function asyncHandler(fn) {
    return function (req, res, next) {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

const viewHelper = (req, res, next) => {
    res.locals.success_msg = res.getFlash('success');
    res.locals.error_msg = res.getFlash('error');
    res.locals.capitalize = (str) => {
        return str.charAt(0).toUpperCase() + str.slice(1);
    };

    res.locals.formatInr = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR'
        }).format(amount);
    };

    res.locals.formatDate = (date) => {
        return new Date(date).toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    },

        res.locals.capitalizeWords = (str) => {
            return str
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
        };
    next();

};


module.exports = {
    calculateVerificationPercentage,
    calculateVerificationPercentage_dummy,
    responseData,
    responseData_,
    getFormattedDate,
    generateOTP,
    getSequelizePagination,
    getIconForCounter,
    getSuffixForCounter,
    getCategoryForCounter,
    getPositionForCounter,
    codeGenerator,
    generateRefCode,
    getDeviceHash,
    encryptRefreshToken,
    decryptRefreshToken,
    hashPassword,
    verifyPassword,
    randomstring,
    getCache,
    setCache,
    delCache,
    asyncHandler,
    viewHelper
}