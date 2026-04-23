const express = require('express');
const router = express.Router();
const sequelize = require('sequelize')

const { asyncHandler } = require('../shared/utils/helper.js')
const adminController = require('../controller/adminController.js');
const { authMiddleware } = require('../middleware/auth.js');
const validationRule = require('../validation/admin.auth.js')
const { uploadProfileImage, siteSlider, updateSliderMulter, aboutImage, vehicleImage } = require('../middleware/multer.js')
const uploadVideo = require('../middleware/videoMulter.js')
const sessMiddleware = require('../middleware/sessionMiddleware.js');

// auth page

router.get('/login', sessMiddleware, (req, res) => {
    res.render('auth/login', {
        title: 'Admin login || Leh connect',
        error: null,
        user: null
    });
})

router.post('/login', [sessMiddleware], adminController?.login);
router.post('/register', adminController?.register)
router.get('/logout', [authMiddleware], adminController?.logout)

// dashboard page
router.get('/', [authMiddleware], asyncHandler(async (req, res) => {
    const admin = req?.session?.user

    res.render('dashboard/index', {
        title: 'LehConnect | Admin',
        admin: admin || null,
        currentPage: 'dashboard'
    });
}))

// vendors page
router.get('/view-vendor/:token', [authMiddleware], asyncHandler(async (req, res) => {
    const admin = req?.session?.user
    const { token } = req.params
    const vendor = await adminController.getVendor(token)

    if (!vendor?.success) {
        req.setFlash('error', vendor?.message)
        res.redirect('/vendor-requests')
    } else {
        res.render('vendor/view', {
            title: 'LehConnect | view vendor',
            admin: admin || null,
            data: vendor?.results?.docs[0] || null,
            currentPage: 'vendor' // Changed from vendor-profile to vendor
        })
    }
}))

router.get('/vendor-requests', [authMiddleware], asyncHandler(async (req, res) => {
    const admin = req?.session?.user
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 12;
    const search = req.query.search || '';
    const status = req.query.status || 'all';
    const vendorData = await adminController.getVendorRequests(page, limit, status, search)

    res.render('vendor/requests', {
        title: 'LehConnect | vendor requests',
        admin: admin || null,
        data: vendorData || null,
        query: req.query || {},
        currentPage: 'vendor-requests'
    })
}))

router.get('/vendor-delete/request', [authMiddleware], asyncHandler(async (req, res) => {
    const admin = req?.session?.user;
    const response = await adminController.getDeleteRequests(req);

    const renderData = {
        title: 'LehConnect | Deletion Requests',
        admin: admin || null,
        currentPage: 'vendor-del-request',
        currentLimit: parseInt(req.query.limit) || 10,
        currentStatus: req.query.status || 'PENDING',
        currentSearch: req.query.search || '',
        data: response.success ? response.results : { docs: [], totalDocs: 0, totalPages: 0, page: 1, query: {} }
    };

    if (req.query.partial === 'true') {
        return res.render('shared/partials/_delete_request_table', renderData);
    }

    res.render('vendor/acc_del_req', renderData);
}));

router.get('/vendor', [authMiddleware], (async (req, res) => {
    const admin = req?.session?.user
    const result = await adminController.getAllVendorsInfo(req)

    res.render('vendor/index', {
        title: 'LehConnect | Vendors',
        admin: admin || null,
        data: result.results,
        currentPage: 'vendor'
    });
}))

router.get('/vendor/exports', [authMiddleware], adminController.exportVendors)

router.get('/vendor-duties', [authMiddleware], asyncHandler(async (req, res) => {

    const admin = req?.session?.user;

    const {
        duty_type,
        accept_type,
        trip_type,
        search,
        range,
        page = 1,
        limit = 12
    } = req.query;

    const duties = await adminController.getOpenDuties({
        duty_type,
        accept_type,
        trip_type,
        search,
        range,
        page,
        limit
    });

    req.setFlash('success', 'Duties fetched successfully')
    res.render('vendor/duties', {
        title: 'LehConnect | Vendor Duties',
        admin: admin || null,
        query: req.query || {},
        data: duties,
        currentPage: 'vendor-duties'
    });

}));

router.get('/view-duty/:duty_type/:token', [authMiddleware], async (req, res) => {
    const { duty_type, token } = req.params
    const admin = req?.session?.user

    const duty = await adminController.showDuty({
        duty_type,
        token
    })

    return res.render('vendor/viewDuty', {
        title: 'LehConnect || Vendor Duty',
        admin: admin || null,
        data: duty,
        currentPage: 'vendor-duties'
    })
})

router.get('/vendor-profile/:token', [authMiddleware], asyncHandler(async (req, res) => {
    const admin = req?.session?.user
    const vendor = await adminController.getVendor(req.params.token)
    res.render('vendor/profile', {
        title: 'LehConnect | Vendor Profile',
        admin: admin || null,
        data: vendor || null,
        currentPage: 'vendor' // Changed from vendor-profile to vendor
    });
}))

router.post('/remind-partial/vendors', [authMiddleware], async (req, res) => {
    await adminController?.remindPartialVendors({
        triggeredBy: 'ADMIN'
    }, req, res);
});

router.get('/vendor/help', [authMiddleware], asyncHandler(async (req, res) => {
    const admin = req.session.user;
    const page = req.query.page || 1;

    const helpData = await adminController.getHelpData(page);
    req.setFlash(helpData.success ? 'success' : 'error', helpData.message)
    return res.render('vendor/vendor_help', {
        admin,
        title: 'Vendor Help Desk',
        currentPage: 'vendor-help',
        data: helpData.results || {},
    });
}));
router.get('/vendor/help/:token', [authMiddleware], asyncHandler(async (req, res) => {
    const admin = req.session.user;
    const token = req.params.token;
    const helpData = await adminController.getHelpByToken(token);
    req.setFlash(helpData?.success ? 'success' : 'error', helpData?.message)
    return res.render('vendor/view_vendor_help', {
        admin,
        title: 'Help Details',
        currentPage: 'vendor-help',
        help: helpData.results
    });
}));
router.post('/vendor/help/reply/:token', [authMiddleware], adminController.replyToHelp);
router.post('/vendor/help/delete/:token', [authMiddleware], adminController.deleteHelp);

router.post('/remind/vendor', [authMiddleware], adminController.remindVendor)

router.post('/vendor-profile/accept', [authMiddleware], adminController.vendorAcceptProfile)

router.post('/vendor-profile/reject', [authMiddleware, validationRule.validate('vendor-profile-reject')], adminController.vendorRejectProfile)

router.post('/review/vendor', [authMiddleware], adminController.reviewVendor)

router.post('/process-delete-request', [authMiddleware, validationRule.validate('delete-request-action')], adminController.processDeleteRequest)


// customer page
router.get('/customer', [authMiddleware], asyncHandler(async (req, res) => {
    const admin = req?.session?.user

    res.render('customer/index', {
        title: 'LehConnect | Customers',
        admin: admin || null,
        currentPage: 'customer',
    });
}))

// booking page
router.get('/bookings', [authMiddleware], asyncHandler(async (req, res) => {
    const admin = req?.session?.user

    res.render('booking/index', {
        title: 'LehConnect | Bookings',
        admin: admin || null,
        currentPage: 'bookings',
    });
}))

// bids page
router.get('/bids', [authMiddleware], asyncHandler(async (req, res) => {
    const admin = req?.session?.user

    res.render('bids/index', {
        title: 'LehConnect | Bids',
        admin: admin || null,
        currentPage: 'bids',
    });
}))

// enquiry page
router.get('/taxi-enquiry', [authMiddleware], asyncHandler(async (req, res) => {
    const admin = req?.session?.user

    res.render('enquiry/taxi', {
        title: 'LehConnect | Taxi-enquiry',
        admin: admin || null,
        taxiEnquiries: [],
        currentPage: 'taxi-enquiry'
    });
}))

router.get('/hotel-enquiry', [authMiddleware], asyncHandler(async (req, res) => {
    const admin = req?.session?.user
    const result = await adminController.getAllHotelEnquiries();
    req.setFlash(result.success ? 'success' : 'error', result.message)
    res.render('enquiry/hotel', {
        title: 'LehConnect | Hotel-enquiry',
        admin: admin || null,
        hotelEnquiries: result.results || [],
        currentPage: 'hotel-enquiry'
    });
}))

router.get('/flight-enquiry', [authMiddleware], asyncHandler(async (req, res) => {
    const admin = req?.session?.user

    res.render('enquiry/flight', {
        title: 'LehConnect | flight-enquiry',
        admin: admin || null,
        flightEnquiries: [],
        currentPage: 'flight-enquiry'
    });
}))

router.get('/insurance', [authMiddleware], asyncHandler(async (req, res) => {
    const admin = req?.session?.user

    res.render('enquiry/insurance', {
        title: 'LehConnect | Insurance',
        admin: admin || null,
        insuranceEnquiries: [],
        currentPage: 'insurance'
    });
}))

// referral page
router.get('/customer-referral', [authMiddleware], asyncHandler(async (req, res) => {
    const admin = req?.session?.user

    res.render('referral/customer', {
        title: 'LehConnect | Customer-referral',
        admin: admin || null,
        currentPage: 'customer-referral'
    });
}))

router.get('/vendor-referral', [authMiddleware], asyncHandler(async (req, res) => {
    const admin = req?.session?.user
    const page = parseInt(req.query.page) || 1;
    const limit = 12;
    const data = await adminController.getReferralPage(page, limit)
    req.setFlash(!data?.success ? 'error' : 'success', data?.message)
    res.render('referral/vendor', {
        title: 'LehConnect | Vendor-referral',
        admin: admin || null,
        currentPage: 'vendor-referral',
        data: data.results
    });
}))
router.get('/vendor-referral-details/:id', [authMiddleware], asyncHandler(async (req, res) => {
    const admin = req?.session?.user;
    const page = parseInt(req.query.page) || 1;
    const limit = 12;
    const { id } = req.params

    const filters = {
        search: req.query.search || '',
        status: req.query.status || '',
        sort: req.query.sort || 'latest'
    };

    const data = await adminController.getReferralDetailsPage(id, page, limit, filters);

    req.setFlash(!data?.success ? 'error' : 'success', data?.message);

    res.render('referral/show', {
        title: 'LehConnect | Vendor Referral Details',
        admin: admin || null,
        currentPage: 'vendor-referral-details',
        data: data.results,
        filters
    });
}));
router.post('/update-referral', [authMiddleware, validationRule.validate('set-referral')], adminController.updateReferralSettings)

// payment
router.get('/payment-today', [authMiddleware], asyncHandler(async (req, res) => {
    const admin = req?.session?.user

    res.render('payment/today', {
        title: "LehConnect | Today's Payments",
        admin: admin || null,
        summary: {},
        paymentMethods: [],
        recentTransactions: [],
        todayTransactions: [],
        settlementSummary: {},
        defaultFromDate: null,
        defaultToDate: null,
        currentPage: 'payment-today'
    });
}))

router.get('/payment-all', [authMiddleware], asyncHandler(async (req, res) => {
    const admin = req?.session?.user

    const paymentPageData = await adminController.getAllPaymentsPage(req);

    res.render('payment/all', {
        admin: admin || null,
        title: "LehConnect | All Payments",
        ...paymentPageData,
        currentPage: 'payment-all'
    });
}))

router.get('/admin-refund-ledger', [authMiddleware], asyncHandler(async (req, res) => {
    const admin = req?.session?.user;

    res.render('payment/admin-refund-ledger', {
        admin: admin || null,
        title: 'LehConnect | Admin Refund Ledger',
        currentPage: 'admin-refund-ledger'
    });
}));

router.get('/admin/payments/ledger-dashboard', [authMiddleware], asyncHandler(async (req, res) => {
    try {
        let {
            page = 1,
            limit = 10,
            from = null,
            to = null,
            quickRange = null,
            booking_token = null,
            payment_status = null,
            refund_status = null,
            ledger_type = null,
            search = null,
            sort = 'newest'
        } = req.query;

        page = parseInt(page) || 1;
        limit = parseInt(limit) || 10;

        if (page < 1) page = 1;
        if (limit < 1) limit = 10;

        const offset = (page - 1) * limit;

        if ((!from || !to) && quickRange) {
            const range = getDateRangeFromQuickRange(quickRange);
            from = from || range.from;
            to = to || range.to;
        }

        const replacements = { limit, offset };
        const whereParts = [];

        if (from) {
            whereParts.push(`DATE(ledger.created_at) >= :from`);
            replacements.from = from;
        }

        if (to) {
            whereParts.push(`DATE(ledger.created_at) <= :to`);
            replacements.to = to;
        }

        if (booking_token) {
            whereParts.push(`ledger.booking_token = :booking_token`);
            replacements.booking_token = booking_token;
        }

        if (ledger_type && ['PAYMENT', 'REFUND', 'PAYOUT'].includes(ledger_type)) {
            whereParts.push(`ledger.ledger_type = :ledger_type`);
            replacements.ledger_type = ledger_type;
        }

        if (payment_status) {
            whereParts.push(`ledger.payment_status = :payment_status`);
            replacements.payment_status = payment_status;
        }

        if (refund_status) {
            whereParts.push(`ledger.refund_status = :refund_status`);
            replacements.refund_status = refund_status;
        }

        if (search) {
            whereParts.push(`
                (
                    ledger.booking_token LIKE :search
                    OR ledger.transaction_token LIKE :search
                    OR ledger.gateway_transaction_id LIKE :search
                    OR ledger.user_name LIKE :search
                    OR ledger.user_email LIKE :search
                    OR ledger.user_phone LIKE :search
                    OR ledger.vehicle_type LIKE :search
                    OR ledger.vehicle_name LIKE :search
                    OR ledger.pickup_location LIKE :search
                    OR ledger.drop_location LIKE :search
                    OR ledger.city LIKE :search
                    OR ledger.state LIKE :search
                )
            `);
            replacements.search = `%${search}%`;
        }

        const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

        const ledgerBaseSql = `
            (
                SELECT
                    bp.id,
                    'PAYMENT' AS ledger_type,
                    'DEBIT' AS direction,
                    CASE
                        WHEN bp.order_status = 'PAID' THEN 'PAID'
                        WHEN bp.order_status = 'FAILED' THEN 'FAILED'
                        ELSE 'PENDING'
                    END AS display_status,
                    bp.token AS transaction_token,
                    bp.razorpay_payment_id AS gateway_transaction_id,
                    bp.razorpay_order_id,
                    bp.booking_token,
                    bp.payer_token AS user_token,
                    bp.payee_vendor_token,
                    CAST(bp.amount AS DECIMAL(14,2)) AS amount,
                    bp.currency,
                    bp.payment_status,
                    bp.order_status,
                    bp.refund_status,
                    bp.paid_at,
                    bp.refunded_at,
                    bp.created_at,
                    bp.updated_at,

                    b.id AS booking_id,
                    b.status AS booking_status,
                    b.trip_type,
                    b.vehicle_type,
                    b.vehicle_name,
                    b.pickup_location,
                    b.drop_location,
                    b.pickup_datetime,
                    b.return_datetime,
                    b.city,
                    b.state,
                    b.secure_booking,
                    b.accept_type,

                    CONCAT(COALESCE(v.first_name, ''), ' ', COALESCE(v.last_name, '')) AS user_name,
                    v.email AS user_email,
                    v.contact AS user_phone,
                    v.image AS user_avatar,
                    'vendor' AS user_type,

                    NULL AS refund_reason,
                    NULL AS refunded_by_token,
                    NULL AS refunded_by_name,

                    CASE
                        WHEN bp.payment_status = 'PAID' THEN CAST(bp.amount * 0.03 AS DECIMAL(14,2))
                        ELSE 0
                    END AS deduction_amount,

                    CASE
                        WHEN bp.payment_status = 'PAID' THEN CAST(bp.amount - (bp.amount * 0.03) AS DECIMAL(14,2))
                        ELSE 0
                    END AS net_refundable_amount
                FROM tbl_booking_payments bp
                LEFT JOIN tbl_booking b ON b.token = bp.booking_token
                LEFT JOIN tbl_vendor v ON v.token = bp.payer_token
                WHERE COALESCE(bp.flag, 0) = 0

                UNION ALL

                SELECT
                    br.id,
                    'REFUND' AS ledger_type,
                    'CREDIT' AS direction,
                    CASE
                        WHEN br.refund_status = 'PROCESSED' THEN 'REFUNDED'
                        WHEN br.refund_status = 'FAILED' THEN 'REFUND_FAILED'
                        ELSE 'REFUND_PENDING'
                    END AS display_status,
                    br.token AS transaction_token,
                    br.razorpay_refund_id AS gateway_transaction_id,
                    NULL AS razorpay_order_id,
                    br.booking_token,
                    br.refund_to_token AS user_token,
                    NULL AS payee_vendor_token,
                    CAST(br.refund_amount AS DECIMAL(14,2)) AS amount,
                    br.currency,
                    NULL AS payment_status,
                    NULL AS order_status,
                    br.refund_status,
                    NULL AS paid_at,
                    br.updated_at AS refunded_at,
                    br.created_at,
                    br.updated_at,

                    b.id AS booking_id,
                    b.status AS booking_status,
                    b.trip_type,
                    b.vehicle_type,
                    b.vehicle_name,
                    b.pickup_location,
                    b.drop_location,
                    b.pickup_datetime,
                    b.return_datetime,
                    b.city,
                    b.state,
                    b.secure_booking,
                    b.accept_type,

                    CONCAT(COALESCE(v_ref.first_name, ''), ' ', COALESCE(v_ref.last_name, '')) AS user_name,
                    v_ref.email AS user_email,
                    v_ref.contact AS user_phone,
                    v_ref.image AS user_avatar,
                    'vendor' AS user_type,

                    br.reason AS refund_reason,
                    br.refunded_by_token,
                    CONCAT(COALESCE(v_by.first_name, ''), ' ', COALESCE(v_by.last_name, '')) AS refunded_by_name,

                    0 AS deduction_amount,
                    0 AS net_refundable_amount
                FROM tbl_booking_refunds br
                LEFT JOIN tbl_booking b ON b.token = br.booking_token
                LEFT JOIN tbl_vendor v_ref ON v_ref.token = br.refund_to_token
                LEFT JOIN tbl_vendor v_by ON v_by.token = br.refunded_by_token
                WHERE COALESCE(br.flag, 0) = 0
            ) ledger
        `;

        const orderClause = (() => {
            switch (sort) {
                case 'oldest':
                    return `ORDER BY ledger.created_at ASC`;
                case 'amount_high':
                    return `ORDER BY ledger.amount DESC`;
                case 'amount_low':
                    return `ORDER BY ledger.amount ASC`;
                default:
                    return `ORDER BY ledger.created_at DESC`;
            }
        })();

        const listSql = `
            SELECT ledger.*
            FROM ${ledgerBaseSql}
            ${whereClause}
            ${orderClause}
            LIMIT :limit OFFSET :offset
        `;

        const countSql = `
            SELECT COUNT(*) AS totalCount
            FROM ${ledgerBaseSql}
            ${whereClause}
        `;

        const summarySql = `
            SELECT
                COUNT(*) AS total_entries,
                COUNT(CASE WHEN ledger.ledger_type = 'PAYMENT' THEN 1 END) AS total_payments,
                COUNT(CASE WHEN ledger.ledger_type = 'REFUND' THEN 1 END) AS total_refunds,
                COALESCE(SUM(CASE WHEN ledger.ledger_type = 'PAYMENT' THEN ledger.amount ELSE 0 END), 0) AS total_paid_amount,
                COALESCE(SUM(CASE WHEN ledger.ledger_type = 'REFUND' THEN ledger.amount ELSE 0 END), 0) AS total_refund_amount,
                COALESCE(SUM(CASE WHEN ledger.ledger_type = 'PAYMENT' THEN ledger.deduction_amount ELSE 0 END), 0) AS total_deduction_amount,
                COALESCE(
                    SUM(CASE WHEN ledger.ledger_type = 'PAYMENT' THEN ledger.amount ELSE 0 END)
                    - SUM(CASE WHEN ledger.ledger_type = 'REFUND' THEN ledger.amount ELSE 0 END),
                0) AS net_amount
            FROM ${ledgerBaseSql}
            ${whereClause}
        `;

        const todaySql = `
            SELECT
                COUNT(*) AS total_entries,
                COALESCE(SUM(CASE WHEN ledger.ledger_type = 'PAYMENT' THEN ledger.amount ELSE 0 END), 0) AS total_paid_amount,
                COALESCE(SUM(CASE WHEN ledger.ledger_type = 'REFUND' THEN ledger.amount ELSE 0 END), 0) AS total_refund_amount,
                COALESCE(SUM(CASE WHEN ledger.ledger_type = 'PAYMENT' THEN ledger.deduction_amount ELSE 0 END), 0) AS total_deduction_amount,
                COALESCE(
                    SUM(CASE WHEN ledger.ledger_type = 'PAYMENT' THEN ledger.amount ELSE 0 END)
                    - SUM(CASE WHEN ledger.ledger_type = 'REFUND' THEN ledger.amount ELSE 0 END),
                0) AS net_amount
            FROM ${ledgerBaseSql}
            WHERE DATE(ledger.created_at) = CURDATE()
        `;

        const currentWeekSql = `
            SELECT
                COUNT(*) AS total_entries,
                COALESCE(SUM(CASE WHEN ledger.ledger_type = 'PAYMENT' THEN ledger.amount ELSE 0 END), 0) AS total_paid_amount,
                COALESCE(SUM(CASE WHEN ledger.ledger_type = 'REFUND' THEN ledger.amount ELSE 0 END), 0) AS total_refund_amount,
                COALESCE(SUM(CASE WHEN ledger.ledger_type = 'PAYMENT' THEN ledger.deduction_amount ELSE 0 END), 0) AS total_deduction_amount,
                COALESCE(
                    SUM(CASE WHEN ledger.ledger_type = 'PAYMENT' THEN ledger.amount ELSE 0 END)
                    - SUM(CASE WHEN ledger.ledger_type = 'REFUND' THEN ledger.amount ELSE 0 END),
                0) AS net_amount
            FROM ${ledgerBaseSql}
            WHERE YEARWEEK(ledger.created_at, 1) = YEARWEEK(CURDATE(), 1)
        `;

        const currentMonthSql = `
            SELECT
                COUNT(*) AS total_entries,
                COALESCE(SUM(CASE WHEN ledger.ledger_type = 'PAYMENT' THEN ledger.amount ELSE 0 END), 0) AS total_paid_amount,
                COALESCE(SUM(CASE WHEN ledger.ledger_type = 'REFUND' THEN ledger.amount ELSE 0 END), 0) AS total_refund_amount,
                COALESCE(SUM(CASE WHEN ledger.ledger_type = 'PAYMENT' THEN ledger.deduction_amount ELSE 0 END), 0) AS total_deduction_amount,
                COALESCE(
                    SUM(CASE WHEN ledger.ledger_type = 'PAYMENT' THEN ledger.amount ELSE 0 END)
                    - SUM(CASE WHEN ledger.ledger_type = 'REFUND' THEN ledger.amount ELSE 0 END),
                0) AS net_amount
            FROM ${ledgerBaseSql}
            WHERE MONTH(ledger.created_at) = MONTH(CURDATE())
              AND YEAR(ledger.created_at) = YEAR(CURDATE())
        `;

        const dailySql = `
            SELECT
                DATE(ledger.created_at) AS date,
                DATE_FORMAT(ledger.created_at, '%d %b %Y') AS label,
                COUNT(*) AS total_entries,
                COALESCE(SUM(CASE WHEN ledger.ledger_type = 'PAYMENT' THEN ledger.amount ELSE 0 END), 0) AS total_paid_amount,
                COALESCE(SUM(CASE WHEN ledger.ledger_type = 'REFUND' THEN ledger.amount ELSE 0 END), 0) AS total_refund_amount,
                COALESCE(SUM(CASE WHEN ledger.ledger_type = 'PAYMENT' THEN ledger.deduction_amount ELSE 0 END), 0) AS total_deduction_amount,
                COALESCE(
                    SUM(CASE WHEN ledger.ledger_type = 'PAYMENT' THEN ledger.amount ELSE 0 END)
                    - SUM(CASE WHEN ledger.ledger_type = 'REFUND' THEN ledger.amount ELSE 0 END),
                0) AS net_amount
            FROM ${ledgerBaseSql}
            ${whereClause}
            GROUP BY DATE(ledger.created_at), DATE_FORMAT(ledger.created_at, '%d %b %Y')
            ORDER BY DATE(ledger.created_at) DESC
            LIMIT 15
        `;

        const weeklySql = `
            SELECT
                YEAR(ledger.created_at) AS year,
                WEEK(ledger.created_at, 1) AS week_number,
                MIN(DATE(ledger.created_at)) AS week_start_date,
                MAX(DATE(ledger.created_at)) AS week_end_date,
                COUNT(*) AS total_entries,
                COALESCE(SUM(CASE WHEN ledger.ledger_type = 'PAYMENT' THEN ledger.amount ELSE 0 END), 0) AS total_paid_amount,
                COALESCE(SUM(CASE WHEN ledger.ledger_type = 'REFUND' THEN ledger.amount ELSE 0 END), 0) AS total_refund_amount,
                COALESCE(SUM(CASE WHEN ledger.ledger_type = 'PAYMENT' THEN ledger.deduction_amount ELSE 0 END), 0) AS total_deduction_amount,
                COALESCE(
                    SUM(CASE WHEN ledger.ledger_type = 'PAYMENT' THEN ledger.amount ELSE 0 END)
                    - SUM(CASE WHEN ledger.ledger_type = 'REFUND' THEN ledger.amount ELSE 0 END),
                0) AS net_amount
            FROM ${ledgerBaseSql}
            ${whereClause}
            GROUP BY YEAR(ledger.created_at), WEEK(ledger.created_at, 1)
            ORDER BY year DESC, week_number DESC
            LIMIT 12
        `;

        const monthlySql = `
            SELECT
                DATE_FORMAT(ledger.created_at, '%Y-%m') AS month_key,
                DATE_FORMAT(ledger.created_at, '%b %Y') AS month_label,
                COUNT(*) AS total_entries,
                COALESCE(SUM(CASE WHEN ledger.ledger_type = 'PAYMENT' THEN ledger.amount ELSE 0 END), 0) AS total_paid_amount,
                COALESCE(SUM(CASE WHEN ledger.ledger_type = 'REFUND' THEN ledger.amount ELSE 0 END), 0) AS total_refund_amount,
                COALESCE(SUM(CASE WHEN ledger.ledger_type = 'PAYMENT' THEN ledger.deduction_amount ELSE 0 END), 0) AS total_deduction_amount,
                COALESCE(
                    SUM(CASE WHEN ledger.ledger_type = 'PAYMENT' THEN ledger.amount ELSE 0 END)
                    - SUM(CASE WHEN ledger.ledger_type = 'REFUND' THEN ledger.amount ELSE 0 END),
                0) AS net_amount
            FROM ${ledgerBaseSql}
            ${whereClause}
            GROUP BY DATE_FORMAT(ledger.created_at, '%Y-%m'), DATE_FORMAT(ledger.created_at, '%b %Y')
            ORDER BY month_key DESC
            LIMIT 12
        `;

        const [
            ledgerRows,
            countRows,
            summaryRows,
            todayRows,
            currentWeekRows,
            currentMonthRows,
            dailyRows,
            weeklyRows,
            monthlyRows
        ] = await Promise.all([
            sequelize.query(listSql, { type: sequelize.QueryTypes.SELECT, replacements }),
            sequelize.query(countSql, { type: sequelize.QueryTypes.SELECT, replacements }),
            sequelize.query(summarySql, { type: sequelize.QueryTypes.SELECT, replacements }),
            sequelize.query(todaySql, { type: sequelize.QueryTypes.SELECT }),
            sequelize.query(currentWeekSql, { type: sequelize.QueryTypes.SELECT }),
            sequelize.query(currentMonthSql, { type: sequelize.QueryTypes.SELECT }),
            sequelize.query(dailySql, { type: sequelize.QueryTypes.SELECT, replacements }),
            sequelize.query(weeklySql, { type: sequelize.QueryTypes.SELECT, replacements }),
            sequelize.query(monthlySql, { type: sequelize.QueryTypes.SELECT, replacements })
        ]);

        const totalCount = Number(countRows?.[0]?.totalCount || 0);
        const totalPages = Math.ceil(totalCount / limit) || 1;

        return res.status(200).json({
            success: true,
            message: 'Admin payments ledger dashboard fetched successfully',
            data: {
                summary: {
                    overall: {
                        total_entries: Number(summaryRows?.[0]?.total_entries || 0),
                        total_paid_amount: Number(summaryRows?.[0]?.total_paid_amount || 0),
                        total_refund_amount: Number(summaryRows?.[0]?.total_refund_amount || 0),
                        total_deduction_amount: Number(summaryRows?.[0]?.total_deduction_amount || 0),
                        net_amount: Number(summaryRows?.[0]?.net_amount || 0)
                    },
                    today: {
                        total_entries: Number(todayRows?.[0]?.total_entries || 0),
                        total_paid_amount: Number(todayRows?.[0]?.total_paid_amount || 0),
                        total_refund_amount: Number(todayRows?.[0]?.total_refund_amount || 0),
                        total_deduction_amount: Number(todayRows?.[0]?.total_deduction_amount || 0),
                        net_amount: Number(todayRows?.[0]?.net_amount || 0)
                    },
                    current_week: {
                        total_entries: Number(currentWeekRows?.[0]?.total_entries || 0),
                        total_paid_amount: Number(currentWeekRows?.[0]?.total_paid_amount || 0),
                        total_refund_amount: Number(currentWeekRows?.[0]?.total_refund_amount || 0),
                        total_deduction_amount: Number(currentWeekRows?.[0]?.total_deduction_amount || 0),
                        net_amount: Number(currentWeekRows?.[0]?.net_amount || 0)
                    },
                    current_month: {
                        total_entries: Number(currentMonthRows?.[0]?.total_entries || 0),
                        total_paid_amount: Number(currentMonthRows?.[0]?.total_paid_amount || 0),
                        total_refund_amount: Number(currentMonthRows?.[0]?.total_refund_amount || 0),
                        total_deduction_amount: Number(currentMonthRows?.[0]?.total_deduction_amount || 0),
                        net_amount: Number(currentMonthRows?.[0]?.net_amount || 0)
                    }
                },
                analytics: {
                    daily_ledger: dailyRows.map((row) => ({
                        date: row.date,
                        label: row.label,
                        total_entries: Number(row.total_entries || 0),
                        total_paid_amount: Number(row.total_paid_amount || 0),
                        total_refund_amount: Number(row.total_refund_amount || 0),
                        total_deduction_amount: Number(row.total_deduction_amount || 0),
                        net_amount: Number(row.net_amount || 0)
                    })),
                    weekly_ledger: weeklyRows.map((row) => ({
                        year: Number(row.year || 0),
                        week_number: Number(row.week_number || 0),
                        week_start_date: row.week_start_date,
                        week_end_date: row.week_end_date,
                        total_entries: Number(row.total_entries || 0),
                        total_paid_amount: Number(row.total_paid_amount || 0),
                        total_refund_amount: Number(row.total_refund_amount || 0),
                        total_deduction_amount: Number(row.total_deduction_amount || 0),
                        net_amount: Number(row.net_amount || 0)
                    })),
                    monthly_ledger: monthlyRows.map((row) => ({
                        month_key: row.month_key,
                        month_label: row.month_label,
                        total_entries: Number(row.total_entries || 0),
                        total_paid_amount: Number(row.total_paid_amount || 0),
                        total_refund_amount: Number(row.total_refund_amount || 0),
                        total_deduction_amount: Number(row.total_deduction_amount || 0),
                        net_amount: Number(row.net_amount || 0)
                    }))
                },
                pagination: {
                    current_page: page,
                    per_page: limit,
                    total_count: totalCount,
                    total_pages: totalPages,
                    has_next_page: page < totalPages,
                    has_prev_page: page > 1
                },
                filters: {
                    from,
                    to,
                    quickRange,
                    booking_token,
                    payment_status,
                    refund_status,
                    ledger_type,
                    search,
                    sort
                },
                transactions: ledgerRows.map((row) => ({
                    id: row.id,
                    ledger_type: row.ledger_type,
                    direction: row.direction,
                    display_status: row.display_status,
                    transaction_token: row.transaction_token,
                    gateway_transaction_id: row.gateway_transaction_id,
                    razorpay_order_id: row.razorpay_order_id,
                    booking_token: row.booking_token,
                    booking_id: row.booking_id,
                    user_token: row.user_token,
                    user_name: row.user_name,
                    user_email: row.user_email,
                    user_phone: row.user_phone,
                    user_avatar: row.user_avatar,
                    user_type: row.user_type,
                    amount: Number(row.amount || 0),
                    deduction_amount: Number(row.deduction_amount || 0),
                    net_refundable_amount: Number(row.net_refundable_amount || 0),
                    currency: row.currency || 'INR',
                    payment_status: row.payment_status,
                    order_status: row.order_status,
                    refund_status: row.refund_status,
                    paid_at: row.paid_at,
                    refunded_at: row.refunded_at,
                    created_at: row.created_at,
                    updated_at: row.updated_at,
                    refund_reason: row.refund_reason || null,
                    refunded_by_token: row.refunded_by_token || null,
                    refunded_by_name: row.refunded_by_name || null,
                    booking: {
                        status: row.booking_status,
                        trip_type: row.trip_type,
                        vehicle_type: row.vehicle_type,
                        vehicle_name: row.vehicle_name,
                        pickup_location: row.pickup_location,
                        drop_location: row.drop_location,
                        pickup_datetime: row.pickup_datetime,
                        return_datetime: row.return_datetime,
                        city: row.city,
                        state: row.state,
                        secure_booking: row.secure_booking,
                        accept_type: row.accept_type
                    }
                }))
            }
        });
    } catch (error) {
        console.error('admin payments ledger dashboard error:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Something went wrong'
        });
    }
}));

router.post('/booking/:bookingToken/refund', [authMiddleware], adminController.adminProcessBookingRefund);

// report page
router.get('/report', [authMiddleware], asyncHandler(async (req, res) => {
    const admin = req?.session?.user
    res.render('report/index', {
        title: 'LehConnect || Report Management',
        admin: admin || null,
        currentPage: 'report',
        // KPI Data
        kpis: {
            revenue: 0,
            revenueTrend: 0,
            bookings: 0,
            bookingsTrend: 0,
            newCustomers: 0,
            customersTrend: 0,
            avgBookingValue: 0,
            avgValueTrend: 0
        },

        // Financial Summary
        financialSummary: {
            totalIncome: 0,
            totalExpense: 0,
            netProfit: 0,
            profitMargin: 0
        },

        // Top Revenue Sources - Empty Array
        topRevenueSources: [],

        // Monthly Performance - Empty Array
        monthlyPerformance: [],

        // Payment Method Analysis - Empty Array
        paymentMethodAnalysis: [],

        // Booking Statistics
        bookingStats: {
            totalBookings: 0,
            completed: 0,
            pending: 0,
            cancelled: 0,
            conversionRate: 0,
            avgValue: 0,
            avgProcessingTime: 0
        },

        // Top Services - Empty Array
        topServices: [],

        // Status Breakdown - Empty Array
        statusBreakdown: [],

        // Source Analysis - Empty Array
        sourceAnalysis: [],

        // Customer Metrics
        customerMetrics: {
            totalCustomers: 0,
            activeCustomers: 0,
            newCustomers: 0,
            avgLTV: 0,
            retentionRate: 0,
            churnRate: 0,
            avgFrequency: 0
        },

        // Top Customers - Empty Array
        topCustomers: [],

        // Demographics - Empty Array
        demographics: [],

        // CAC Analysis - Empty Array
        cacAnalysis: [],

        // Vendor Stats
        vendorStats: {
            totalVendors: 0,
            activeVendors: 0,
            newVendors: 0,
            avgRating: 0,
            totalPayouts: 0,
            commissionPaid: 0,
            avgResponseTime: 0
        },

        // Top Vendors - Empty Array
        topVendors: [],

        // Vendor Metrics - Empty Array
        vendorMetrics: [],

        // Commission Analysis - Empty Array
        commissionAnalysis: [],

        // Referral Stats
        referralStats: {
            totalReferrals: 0,
            successfulReferrals: 0,
            pendingReferrals: 0,
            totalCommission: 0,
            conversionRate: 0,
            avgCommission: 0,
            roi: 0
        },

        // Top Referrers - Empty Array
        topReferrers: [],

        // Referral Channels - Empty Array
        referralChannels: [],

        // Fraud Analysis - Empty Array
        fraudAnalysis: [],

        // Operational Metrics
        operationalMetrics: {
            avgResponseTime: 0,
            resolutionRate: 0,
            slaCompliance: 0,
            customerSatisfaction: 0,
            systemUptime: 0,
            avgProcessingTime: 0,
            errorRate: 0
        },

        // System Performance
        systemPerformance: {
            serverUptime: 0,
            apiResponseTime: 0,
            dbPerformance: 0,
            activeUsers: 0
        },

        // Department Performance - Empty Array
        departmentPerformance: [],

        // Quality Metrics - Empty Array
        qualityMetrics: [],

        // Saved Reports - Empty Array
        savedReports: [],

        // Scheduled Reports - Empty Array
        scheduledReports: [],

        // Chart Data
        revenueChartLabels: [],
        revenueChartData: [],
        incomeCategories: [],
        incomeData: [],
        expenseCategories: [],
        expenseData: [],

        // Date Range
        defaultFromDate: null,
        defaultToDate: null
    });
}))

// profile page
router.get('/profile', [authMiddleware], asyncHandler(async (req, res) => {
    const admin = req?.session?.user;
    res.render('profile/index', {
        title: 'LehConnect Admin Profile',
        admin: admin || null,
        currentPage: 'profile'
    });
}));
router.post('/edit-profile-pic', [authMiddleware], uploadProfileImage, adminController?.updateProfilePic)
router.post('/edit-profile', [authMiddleware, validationRule.validate('edit-profile')], adminController?.editProfile)
router.post('/edit-password', [authMiddleware, validationRule.validate('edit-password')], adminController?.editPassword)

// data page
router.get('/data', [authMiddleware], asyncHandler(async (req, res) => {
    const admin = req?.session?.user
    res.render('data/index', {
        title: 'LehConnect data',
        admin: admin || null,
        carData: [],
        reqData: [],
        currentPage: 'data'
    });
}))

// settings page
router.get('/setting/content', [authMiddleware], asyncHandler(async (req, res) => {
    const admin = req?.session?.user
    res.render('setting/content', {
        title: 'LehConnect content',
        admin: admin || null,
        stat: {},
        currentPage: 'setting-content'
    });
}))

/* --------------- App management ----------------- */

// about
router.get('/about', [authMiddleware], asyncHandler(async (req, res) => {
    const admin = req?.session?.user;

    const about = await adminController.getAboutData();
    req.setFlash(about?.success ? 'success' : 'error', about?.message)
    res.render('app_management/about', {
        title: 'LehConnect || About Section',
        admin,
        about: about?.results,
        currentPage: 'about'
    });
}));
router.post('/update/about', [authMiddleware, aboutImage, validationRule.validate('add-about')], adminController.updateAbout)

// faqs
router.get('/faqs', [authMiddleware], asyncHandler(async (req, res) => {
    const admin = req?.session?.user;
    const data = await adminController.getFaqs(req);

    req.setFlash(data.success ? 'success' : 'error', data.message);

    res.render('app_management/faq', {
        title: 'LehConnect || Faqs',
        admin: admin || null,
        data: data?.results?.docs || [],
        pagination: data?.results || {},
        query: req.query || {},
        currentPage: 'faqs',
    });
}));
router.post('/add-faq', [authMiddleware, validationRule.validate('add-faq')], adminController.addFaq)
router.get('/edit-faq/:token', [authMiddleware], asyncHandler(adminController.editFaqPage));
router.post('/update-faq/:token', [authMiddleware, validationRule.validate('add-faq')], asyncHandler(adminController.updateFaq));
router.post('/delete-faq/:token', [authMiddleware], asyncHandler(adminController.deleteFaq));

// counter
router.get('/counter', [authMiddleware], asyncHandler(async (req, res) => {
    const admin = req?.session?.user
    const data = await adminController.getCounterList(req, res)

    return res.render('app_management/counter', {
        title: 'LehConnect || Counter Management',
        admin: admin || null,
        data: data?.results,
        currentPage: 'counter',
    });
}));
router.post('/set/counter', [authMiddleware], adminController.setCounter);
router.delete('/counter/:key', [authMiddleware], adminController.deleteCounter);

//slider
router.get('/slider', [authMiddleware], asyncHandler(async (req, res) => {
    const admin = req?.session?.user;

    const sliderData = await adminController.siteSliderList(req, res)

    if (!sliderData?.success) {
        req.setFlash('error', sliderData?.message || 'Error fetching slider data');
        return res.redirect('/slider');
    }

    req.setFlash('success', sliderData?.message || 'Slider data fetched successfully');
    res.render('app_management/slider', {
        title: 'LehConnect | Dashboard Slider',
        admin: admin || null,
        query: req.query || {},
        data: sliderData,
        currentPage: 'slider'
    });
}));
router.post('/site-slider/upload', [authMiddleware, siteSlider], adminController.siteSliderCreate);
router.post('/site-slider/:token/status', [authMiddleware], adminController.siteSliderToggleStatus);
router.post('/site-slider/reorder', [authMiddleware], adminController.siteSliderReorder);
router.post('/site-slider/:token/update', [authMiddleware, updateSliderMulter], adminController.siteSliderUpdate);
router.post('/site-slider/enable-all', [authMiddleware], adminController.siteSliderEnableAll);
router.post('/site-slider/disable-all', [authMiddleware], adminController.siteSliderDisableAll);
router.post('/site-slider/clear-all', [authMiddleware], adminController.siteSliderClearAll);


router.get('/booking-slider', [authMiddleware], asyncHandler(async (req, res) => {
    const admin = req?.session?.user;

    const sliderData = await adminController.bookingSliderList(req, res)

    if (!sliderData?.success) {
        req.setFlash('error', sliderData?.message || 'Error fetching slider data');
        return res.redirect('/slider');
    }

    req.setFlash('success', sliderData?.message || 'Slider data fetched successfully');
    res.render('app_management/booking_slider', {
        title: 'LehConnect | Booking Slider',
        admin: admin || null,
        query: req.query || {},
        data: sliderData,
        currentPage: 'booking-slider'
    });
}));
router.post('/booking-slider/upload', [authMiddleware, siteSlider], adminController.bookingSliderCreate);
router.post('/booking-slider/:token/status', [authMiddleware], adminController.bookingSliderToggleStatus);
router.post('/booking-slider/reorder', [authMiddleware], adminController.bookingSliderReorder);
router.post('/booking-slider/:token/update', [authMiddleware, updateSliderMulter], adminController.bookingSliderUpdate);
router.post('/booking-slider/enable-all', [authMiddleware], adminController.bookingSliderEnableAll);
router.post('/booking-slider/disable-all', [authMiddleware], adminController.bookingSliderDisableAll);
router.post('/booking-slider/clear-all', [authMiddleware], adminController.bookingSliderClearAll);


// videos
router.get('/videos', [authMiddleware], asyncHandler(async (req, res) => {
    const admin = req?.session?.user;

    // Dummy videos data
    const videosData = await adminController.listVideo(req, res);
    res.render('app_management/videos', {
        title: 'LehConnect | Helping Videos',
        admin: admin || null,
        query: req.query || {},
        data: videosData,
        currentPage: 'videos'
    });
}))
router.post("/upload/video", [authMiddleware, uploadVideo, validationRule.validate('upload-video')], adminController.createVideo);
// router.put("/update/video/:token", [authMiddleware], adminController.updateVideo);
router.delete("/remove/video/:token", [authMiddleware], adminController.removeVideo);
router.post("/manage/video/toggle-status", [authMiddleware], adminController.toggleStatusVideo);
router.get('/video/stream/:token', [authMiddleware], adminController.streamVideo)

// services
router.get('/services', [authMiddleware], asyncHandler(async (req, res) => {
    const admin = req?.session?.user;
    const query = req.query
    const services = await adminController.getAllServices(query)

    req.setFlash(services.success ? 'success' : 'error', services.message)
    res.render('app_management/services', {
        admin,
        title: 'Service Management',
        currentPage: 'service',
        data: services?.results
    });
}));
router.post('/add-services', [authMiddleware, validationRule.validate('add-service')], adminController.addService)
router.post('/manage/status/:token', [authMiddleware], adminController.toggleServiceStatus)

// feedback
router.get('/feedback', [authMiddleware], asyncHandler(async (req, res) => {
    const admin = req?.session?.user;

    const result = await adminController.getReviews(req.query);

    if (!result?.success) {
        req.setFlash('error', result?.message);
        return res.redirect('/feedback');
    }

    req.setFlash('success', result?.message);
    return res.render('app_management/feedback', {
        title: 'LehConnect || Feedback Management',
        admin: admin || null,
        data: {
            customerReviewsData: result?.results?.customer,
            vendorReviewsData: result?.results?.vendor,
            stats: result.results.stats,
        },
        currentPage: 'feedback',
        query: result?.results?.filters,
    });
}));
router.get('/feedback/vendor-table', [authMiddleware], asyncHandler(async (req, res) => {
    const result = await adminController.getReviews(req.query);

    if (!result?.success) {
        req.setFlash('error', 'Vendor reviews not found')
        return res.status(500).send('<tr><td colspan="8">Error loading reviews</td></tr>');
    }

    const vendorReviewsData = result?.results?.vendor;

    res.render('shared/partials/vendorReviewRows', { vendorReviews: vendorReviewsData, query: req.query });
}));
router.get('/feedback/customer-table', [authMiddleware], asyncHandler(async (req, res) => {
    const result = await adminController.getReviews(req.query);

    if (!result?.success) {
        req.setFlash('error', 'Customer reviews not found')
        return res.status(500).send('<tr><td colspan="8">Error loading reviews</td></tr>');
    }

    const customerReviewsData = result?.results?.customer

    res.render('shared/partials/customerReviewRows', { customerReviews: customerReviewsData, query: req.query });
}));

router.post('/review/create', [authMiddleware, validationRule.validate('review-create')], adminController.reviewCreate)

router.get('/manage-notifications', [authMiddleware], asyncHandler(async (req, res) => {
    const admin = req?.session?.user;
    const settings = await adminController.getNotificationSettings();
    const cities = [
        { id: 1, name: 'Leh' },
        { id: 2, name: 'Kargil' },
        { id: 3, name: 'Srinagar' },
        { id: 4, name: 'Jammu' },
        { id: 5, name: 'Delhi' }
    ];
    return res.render('app_management/notification_preferences', {
        title: 'LehConnect || Notification Management',
        admin: admin || null,
        data: {
            settings,
            cities
        },
        currentPage: 'manage-notifications'
    });
}));

router.post('/toggle-booking-notification-preferences', [authMiddleware], adminController?.toggleBookingNotification);

router.get('/manage-vehicles', [authMiddleware], asyncHandler(async (req, res) => {
    const admin = req?.session?.user;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 12;
    const search = req.query.search || '';
    const status = req.query.status || 'all';
    const type = req.query.type || 'all';

    // Get vehicles data using the function
    const vehicleData = await adminController.getVehiclesWithFilters(page, limit, status, search, type);

    req.setFlash(vehicleData.success ? 'success' : 'error', vehicleData.message || (vehicleData.success ? 'Vehicles fetched successfully' : 'Error fetching vehicles'));
    res.render('customer_app_management/manage_vehicles', {
        title: 'LehConnect | Manage Vehicles',
        admin: admin || null,
        vehicles: vehicleData.data || [],
        pagination: {
            currentPage: vehicleData.currentPage || 1,
            totalPages: vehicleData.totalPages || 1,
            totalItems: vehicleData.totalRecords || 0,
            limit: vehicleData.recordsPerPage || 12,
            hasNextPage: vehicleData.currentPage < vehicleData.totalPages,
            hasPrevPage: vehicleData.currentPage > 1,
            nextPage: vehicleData.currentPage < vehicleData.totalPages ? vehicleData.currentPage + 1 : null,
            prevPage: vehicleData.currentPage > 1 ? vehicleData.currentPage - 1 : null
        },
        filters: vehicleData.filters || {},
        query: req.query || {},
        currentPage: 'manage-vehicles'
    });
}));

router.post('/add-vehicle', [authMiddleware, vehicleImage], adminController.addVehicle);
router.post('/edit-vehicle/:token', [authMiddleware, vehicleImage, validationRule.validate('add-vehicle')], adminController.updateVehicle);
router.post('/toggle-vehicle-status/:token', [authMiddleware], adminController.toggleVehicleStatus);
router.post('/delete-vehicle/:token', [authMiddleware], adminController.deleteVehicle);

module.exports = router;