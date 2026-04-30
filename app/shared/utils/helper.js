const crypto = require('crypto');
const { enc_key } = require("../../config/globals.js");
const db = require('../../models/index.js')
const buff_key = Buffer.from(enc_key, "hex");
const { redisClient } = require('../../config/redis.config.js');
const vendorReminderQueue = require('../../queues/vendor/vendor_reminder.queue.js')

const fillMissingContactsFromCustomer = async (rows = [], customerTokenField = "customer_token") => {
  if (!Array.isArray(rows) || !rows.length) return rows;

  const missingContactTokens = [
    ...new Set(
      rows
        .filter((item) => !item.contact && item[customerTokenField])
        .map((item) => item[customerTokenField])
    ),
  ];

  if (!missingContactTokens.length) return rows;

  const customers = await db.tbl_customer.findAll({
    where: {
      token: {
        [Op.in]: missingContactTokens,
      },
    },
    attributes: ["token", "contact"],
    raw: true,
  });

  const customerContactMap = Object.fromEntries(
    customers.map((item) => [item.token, item.contact])
  );

  return rows.map((item) => {
    if (!item.contact && item[customerTokenField] && customerContactMap[item[customerTokenField]]) {
      return {
        ...item,
        contact: customerContactMap[item[customerTokenField]],
      };
    }

    return item;
  });
};

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

async function sendAdvanceRequestMessage({
  booking_token,
  owner_token,
  requester_token,
  requested_advance_amount,
}) {
  try {
    const { conversation } = await findOrCreateConversation({
      booking_token,
      owner_token,
      requester_token,
    });

    const token = randomstring(32);
    const createdAt = new Date().toISOString();

    const chatMessage = {
      token,
      conversation_token: conversation.token,
      booking_token,
      sender_token: owner_token,
      receiver_token: requester_token,
      message: `Advance request of ₹${requested_advance_amount}`,
      message_type: "COMMISSION_REQUEST", // 🔥 MAIN FIX
      status: "SENT",
      created_at: createdAt,
      meta: {
        requestedAmount: requested_advance_amount,
      },
    };

    const redisKey = `conversation:${conversation.token}:messages`;

    await redisClient.rPush(redisKey, JSON.stringify(chatMessage));
    await redisClient.expire(redisKey, 86400);

    await chatQueue.add("persist-message", {
      messages: [chatMessage],
    });

    const room = `conversation:${conversation.token}`;

    // 🔥 EMIT TO BOTH USERS
    global.io.to(room).emit("newMessage", chatMessage);

    console.log("Advance request chat message sent");
  } catch (err) {
    console.error("sendAdvanceRequestMessage error:", err);
  }
}


const formatReadableDate = (date) => {
    if (!date) return null;

    return new Date(date).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Kolkata'
    });
};


const queuePartialVendorReminder = async ({ triggeredBy, requestedBy = 'SYSTEM' }) => {
    await vendorReminderQueue.add('REMIND_PARTIAL_VENDORS', {
        triggeredBy,
        requestedBy
    });
};



const toArray = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean);

    return String(value)
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);
};

const toNumber = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

const escapeLike = (value = '') => {
    return String(value).replace(/[\\%_]/g, '\\$&');
};

const safeJsonParse = (value) => {
    try {
        return JSON.parse(value);
    } catch (error) {
        return {};
    }
};

const getMethodName = (method) => {
    const map = {
        razorpay: 'Razorpay',
        wallet: 'Wallet',
        upi: 'UPI',
        card: 'Card',
        credit_card: 'Credit Card',
        debit_card: 'Debit Card',
        netbanking: 'Net Banking',
        cash: 'Cash',
        bank_transfer: 'Bank Transfer',
        refund: 'Refund'
    };

    return map[method] || method || 'N/A';
};

const getTypeName = (type) => {
    const map = {
        booking_payment: 'Booking Payment',
        customer_refund: 'Customer Refund'
    };

    return map[type] || type || 'Other';
};

const getStatusColor = (status) => {
    const map = {
        success: 'success',
        pending: 'warning',
        failed: 'danger',
        refunded: 'info',
        cancelled: 'secondary'
    };

    return map[status] || 'secondary';
};

const getTypeColor = (type) => {
    const map = {
        booking_payment: 'primary',
        customer_refund: 'info'
    };

    return map[type] || 'secondary';
};

const getMethodIcon = (method) => {
    const map = {
        razorpay: 'ti-credit-card',
        wallet: 'ti-wallet',
        upi: 'ti-device-mobile',
        card: 'ti-credit-card',
        credit_card: 'ti-credit-card',
        debit_card: 'ti-credit-card',
        netbanking: 'ti-building-bank',
        cash: 'ti-cash',
        bank_transfer: 'ti-building-bank',
        refund: 'ti-refund'
    };

    return map[method] || 'ti-currency-rupee';
};

const getDateRangeFromQuickRange = (quickRange) => {
    const now = new Date();
    const start = new Date(now);

    const format = (d) => d.toISOString().slice(0, 10);

    switch (quickRange) {
        case 'today':
            return { from: format(now), to: format(now) };

        case 'yesterday': {
            const y = new Date(now);
            y.setDate(y.getDate() - 1);
            return { from: format(y), to: format(y) };
        }

        case 'week': {
            const day = now.getDay();
            start.setDate(now.getDate() - day);
            return { from: format(start), to: format(now) };
        }

        case 'month':
            start.setDate(1);
            return { from: format(start), to: format(now) };

        case 'last_month': {
            const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const e = new Date(now.getFullYear(), now.getMonth(), 0);
            return { from: format(s), to: format(e) };
        }

        case 'quarter': {
            const quarter = Math.floor(now.getMonth() / 3);
            const s = new Date(now.getFullYear(), quarter * 3, 1);
            return { from: format(s), to: format(now) };
        }

        case 'year': {
            const s = new Date(now.getFullYear(), 0, 1);
            return { from: format(s), to: format(now) };
        }

        default:
            return { from: null, to: null };
    }
};

const buildOrderClause = (sort) => {
    switch (sort) {
        case 'oldest':
            return 'ORDER BY ledger.created_at ASC';
        case 'amount_high':
            return 'ORDER BY ABS(ledger.amount) DESC, ledger.created_at DESC';
        case 'amount_low':
            return 'ORDER BY ABS(ledger.amount) ASC, ledger.created_at DESC';
        default:
            return 'ORDER BY ledger.created_at DESC';
    }
};

const buildPaymentLedgerWhere = (query) => {
    const where = [];
    const replacements = {};

    let {
        from,
        to,
        quickRange,
        types,
        methods,
        statuses,
        min_amount,
        max_amount,
        user,
        transaction_id,
        unsettled
    } = query;

    if ((!from || !to) && quickRange) {
        const range = getDateRangeFromQuickRange(quickRange);
        from = from || range.from;
        to = to || range.to;
    }

    if (from) {
        where.push(`DATE(ledger.created_at) >= :from`);
        replacements.from = from;
    }

    if (to) {
        where.push(`DATE(ledger.created_at) <= :to`);
        replacements.to = to;
    }

    const typeArr = toArray(types);
    if (typeArr.length) {
        where.push(`ledger.transaction_type IN (:types)`);
        replacements.types = typeArr;
    }

    const methodArr = toArray(methods);
    if (methodArr.length) {
        where.push(`ledger.payment_method IN (:methods)`);
        replacements.methods = methodArr;
    }

    const statusArr = toArray(statuses);
    if (statusArr.length) {
        where.push(`ledger.status IN (:statuses)`);
        replacements.statuses = statusArr;
    }

    if (min_amount !== undefined && min_amount !== null && min_amount !== '') {
        where.push(`ABS(ledger.amount) >= :min_amount`);
        replacements.min_amount = toNumber(min_amount);
    }

    if (max_amount !== undefined && max_amount !== null && max_amount !== '') {
        where.push(`ABS(ledger.amount) <= :max_amount`);
        replacements.max_amount = toNumber(max_amount);
    }

    if (user) {
        where.push(`
            (
                ledger.user_name LIKE :userSearch ESCAPE '\\\\'
                OR ledger.user_email LIKE :userSearch ESCAPE '\\\\'
                OR ledger.user_phone LIKE :userSearch ESCAPE '\\\\'
                OR ledger.user_token LIKE :userSearch ESCAPE '\\\\'
            )
        `);
        replacements.userSearch = `%${escapeLike(user)}%`;
    }

    if (transaction_id) {
        where.push(`
            (
                ledger.transaction_id LIKE :transactionSearch ESCAPE '\\\\'
                OR ledger.gateway_transaction_id LIKE :transactionSearch ESCAPE '\\\\'
                OR ledger.booking_token LIKE :transactionSearch ESCAPE '\\\\'
            )
        `);
        replacements.transactionSearch = `%${escapeLike(transaction_id)}%`;
    }

    if (String(unsettled) === 'true' || String(unsettled) === '1') {
        where.push(`ledger.settled_at IS NULL`);
    }

    return {
        whereClause: where.length ? `WHERE ${where.join(' AND ')}` : '',
        replacements,
        resolvedFrom: from || null,
        resolvedTo: to || null
    };
};

const getLedgerBaseSubquery = () => {
    return `
        (
            SELECT
                bp.id,
                bp.token AS transaction_id,
                bp.razorpay_payment_id AS gateway_transaction_id,
                bp.booking_token,
                b.id AS booking_id,
                bp.payer_token AS user_token,
                TRIM(CONCAT(COALESCE(vp.first_name, ''), ' ', COALESCE(vp.last_name, ''))) AS user_name,
                vp.email AS user_email,
                vp.contact AS user_phone,
                vp.profile_image AS user_avatar,
                'vendor' AS user_type,
                'booking_payment' AS transaction_type,
                CAST(bp.amount AS DECIMAL(14,2)) AS amount,
                bp.currency,
                CASE
                    WHEN JSON_UNQUOTE(JSON_EXTRACT(bp.meta, '$.payment_method')) IS NOT NULL
                        THEN LOWER(JSON_UNQUOTE(JSON_EXTRACT(bp.meta, '$.payment_method')))
                    WHEN JSON_UNQUOTE(JSON_EXTRACT(bp.meta, '$.method')) IS NOT NULL
                        THEN LOWER(JSON_UNQUOTE(JSON_EXTRACT(bp.meta, '$.method')))
                    WHEN bp.razorpay_payment_id IS NOT NULL THEN 'razorpay'
                    ELSE 'wallet'
                END AS payment_method,
                CASE
                    WHEN bp.refund_status IN ('REFUNDED', 'PARTIALLY_REFUNDED') THEN 'refunded'
                    WHEN bp.order_status = 'PAID' THEN 'success'
                    WHEN bp.order_status IN ('CREATED', 'ATTEMPTED') THEN 'pending'
                    WHEN bp.order_status = 'FAILED' THEN 'failed'
                    ELSE 'pending'
                END AS status,
                NULL AS settled_at,
                bp.paid_at,
                bp.refunded_at,
                bp.created_at,
                bp.updated_at,
                JSON_OBJECT(
                    'source_table', 'tbl_booking_payments',
                    'payment_for', bp.payment_for,
                    'order_status', bp.order_status,
                    'refund_status', bp.refund_status,
                    'payee_vendor_token', bp.payee_vendor_token,
                    'assigned_vendor_name', TRIM(CONCAT(COALESCE(vpayee.first_name, ''), ' ', COALESCE(vpayee.last_name, ''))),
                    'booking_status', b.status,
                    'accept_type', b.accept_type,
                    'secure_booking', b.secure_booking
                ) AS extra_meta
            FROM tbl_booking_payments bp
            LEFT JOIN tbl_vendor vp
                ON vp.token = bp.payer_token
            LEFT JOIN tbl_vendor vpayee
                ON vpayee.token = bp.payee_vendor_token
            LEFT JOIN tbl_booking b
                ON b.token = bp.booking_token
            WHERE COALESCE(bp.flag, 0) = 0

            UNION ALL

            SELECT
                br.id,
                br.token AS transaction_id,
                br.razorpay_refund_id AS gateway_transaction_id,
                br.booking_token,
                b.id AS booking_id,
                br.refund_to_token AS user_token,
                TRIM(CONCAT(COALESCE(vto.first_name, ''), ' ', COALESCE(vto.last_name, ''))) AS user_name,
                vto.email AS user_email,
                vto.contact AS user_phone,
                vto.profile_image AS user_avatar,
                'vendor' AS user_type,
                'customer_refund' AS transaction_type,
                CAST(br.refund_amount * -1 AS DECIMAL(14,2)) AS amount,
                br.currency,
                'refund' AS payment_method,
                CASE
                    WHEN br.refund_status = 'PROCESSED' THEN 'refunded'
                    WHEN br.refund_status = 'FAILED' THEN 'failed'
                    ELSE 'pending'
                END AS status,
                br.updated_at AS settled_at,
                NULL AS paid_at,
                br.updated_at AS refunded_at,
                br.created_at,
                br.updated_at,
                JSON_OBJECT(
                    'source_table', 'tbl_booking_refunds',
                    'refund_status', br.refund_status,
                    'reason', br.reason,
                    'refunded_by_token', br.refunded_by_token,
                    'refunded_by_name', TRIM(CONCAT(COALESCE(vby.first_name, ''), ' ', COALESCE(vby.last_name, ''))),
                    'refund_to_token', br.refund_to_token,
                    'booking_status', b.status
                ) AS extra_meta
            FROM tbl_booking_refunds br
            LEFT JOIN tbl_vendor vto
                ON vto.token = br.refund_to_token
            LEFT JOIN tbl_vendor vby
                ON vby.token = br.refunded_by_token
            LEFT JOIN tbl_booking b
                ON b.token = br.booking_token
            WHERE COALESCE(br.flag, 0) = 0
        ) ledger
    `;
};

// const getDateRangeFromQuickRange = (quickRange) => {
//     const now = new Date();
//     const start = new Date(now);

//     const format = (d) => d.toISOString().slice(0, 10);

//     switch (quickRange) {
//         case 'today':
//             return { from: format(now), to: format(now) };

//         case 'yesterday': {
//             const y = new Date(now);
//             y.setDate(y.getDate() - 1);
//             return { from: format(y), to: format(y) };
//         }

//         case 'week': {
//             const day = now.getDay();
//             start.setDate(now.getDate() - day);
//             return { from: format(start), to: format(now) };
//         }

//         case 'month':
//             start.setDate(1);
//             return { from: format(start), to: format(now) };

//         case 'last_month': {
//             const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
//             const e = new Date(now.getFullYear(), now.getMonth(), 0);
//             return { from: format(s), to: format(e) };
//         }

//         case 'quarter': {
//             const quarter = Math.floor(now.getMonth() / 3);
//             const s = new Date(now.getFullYear(), quarter * 3, 1);
//             return { from: format(s), to: format(now) };
//         }

//         case 'year': {
//             const s = new Date(now.getFullYear(), 0, 1);
//             return { from: format(s), to: format(now) };
//         }

//         default:
//             return { from: null, to: null };
//     }
// };


const getClientIp = (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return String(forwarded).split(',')[0].trim();
    }

    return (
        req.ip ||
        req.connection?.remoteAddress ||
        req.socket?.remoteAddress ||
        req.connection?.socket?.remoteAddress ||
        '0.0.0.0'
    );
};

const registerCustomerIfNotExists = async (req, data = {}) => {
    try {
        const {
            contact = null,
            name = null,
            email = null,
            first_name = null,
            last_name = null,
            location = null,
            address = null
        } = data;

        if (!contact) {
            return null;
        }

        let customer = await db.customer.findOne({
            where: { contact }
        });

        if (customer) {
            const updatePayload = {};

            if (!customer.first_name && (first_name || name)) {
                updatePayload.first_name = first_name || String(name).trim();
            }

            if (!customer.last_name && last_name) {
                updatePayload.last_name = last_name;
            }

            if (!customer.email && email) {
                updatePayload.email = email;
            }

            if (!customer.location && location) {
                updatePayload.location = location;
            }

            if (!customer.address && address) {
                updatePayload.address = address;
            }

            if (Object.keys(updatePayload).length > 0) {
                await customer.update(updatePayload);
            }

            return customer;
        }

        customer = await db.customer.create({
            token: randomstring(64),
            ref_code: null,
            referer_code: null,
            referer_code_used: 0,
            first_name: first_name || (name ? String(name).trim() : null),
            last_name: last_name || null,
            contact,
            alt_contact: null,
            email: email || null,
            password: null,
            role: 'CUSTOMER',
            create_date: new Date(),
            location: location || null,
            address: address || null,
            ip: getClientIp(req),
            user_agent: req.headers['user-agent'] || null,
            feedback: null,
            image: null,
            status: 1,
            flag: 0
        });

        return customer;
    } catch (error) {
        console.log('Customer auto registration error:', error);
        throw error;
    }
};


module.exports = {
    sendAdvanceRequestMessage,
    getClientIp,
    registerCustomerIfNotExists,
    getDateRangeFromQuickRange,
    toArray,
    getMethodName,
    getTypeName,
    getStatusColor,
    getTypeColor,
    getMethodIcon,
    buildPaymentLedgerWhere,
    buildOrderClause,
    getLedgerBaseSubquery,
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
    viewHelper,
    formatReadableDate,
    queuePartialVendorReminder,
    safeJsonParse,
    fillMissingContactsFromCustomer
}