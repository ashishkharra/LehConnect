const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../shared/utils/helper.js')
const adminController = require('../controller/adminController.js');
const { authMiddleware } = require('../middleware/auth.js');
const validationRule = require('../validation/admin.auth.js')
const { uploadProfileImage, siteSlider, updateSliderMulter, aboutImage } = require('../middleware/multer.js')
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
router.get('/vendor/help/delete/:token', [authMiddleware], adminController.deleteHelp);

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
    console.log('daa ->>>> ', data.results.settings)
    req.setFlash(!data?.success ? 'error' : 'success', data?.message)
    res.render('referral/vendor', {
        title: 'LehConnect | Vendor-referral',
        admin: admin || null,
        currentPage: 'vendor-referral',
        data: data.results
    });
}))
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

    res.render('payment/all', {
        admin: admin || null,
        title: "LehConnect | All Payments",
        transactions: [],
        summary: {},
        analytics: {},
        statusOverview: null,
        methodLabels: null,
        methodData: null,
        monthlyLabels: null,
        monthlyIncome: 20000,
        monthlyExpense: 1000,
        currentPage: 1,
        pageSize: 2,
        totalCount: 3,
        totalPages: 5,
        startIndex: 1,
        endIndex: 0,
        defaultFromDate: null,
        defaultToDate: null,
        currentPage: 'payment-all'
    });
}))

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

module.exports = router;