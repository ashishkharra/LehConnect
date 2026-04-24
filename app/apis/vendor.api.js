const router = require('express').Router()
const crypto = require('crypto')
const razorpay = require('../config/razorpay.js');
const { Op, Transaction, Sequelize, col, literal, where } = require("sequelize");
const { vendorMiddleware, verifiedOnly } = require('../middleware/auth.js')
const { responseData, getSequelizePagination, getCache, setCache, randomstring, generateRefCode, formatReadableDate, getDateRangeFromQuickRange, sendAdvanceRequestMessage, fillMissingContactsFromCustomer } = require("../shared/utils/helper.js")
const { admin_url, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, REQUEST_FEE } = require('../config/globals.js')
const vendorValidation = require('../validation/vendor.auth.js')
const db = require('../models/index');
const { getIO } = require('../sockets/index.js');
const { uploadImages } = require('../middleware/multer.js');
const getOrCreateWallet = require('../shared/utils/wallet.js')


const bookingQueue = require('../queues/vendor/booking_queue/post_booking.queue.js');
const bookingRequestActionQueue = require('../queues/vendor/booking_queue/booking_request_action.queue.js');
const bookingNotificationQueue = require('../queues/vendor/booking_queue/booking_accept_reject.queue.js');
const ratingNotificationQueue = require('../queues/vendor/booking_queue/booking_rating.queue.js');
const bookingCancelQueue = require('../queues/vendor/booking_queue/booking_cancel.queue.js')

const freeVehicleNotificationQueue = require('../queues/vendor/freeVehicle_queue/post_free_vehicle.queue.js')
const freeVehicleCancelQueue = require('../queues/vendor/freeVehicle_queue/free_vehicle_cancel.queue.js');
const bookingCompletionQueue = require('../queues/vendor/booking_queue/booking_completion.queue.js');

const enquiryNotificationQueue = require('../queues/vendor/enquiries/enquiry.queue.js')
const leadRequestCustomerNotificationQueue = require('../queues/customer/enquiry.queue.js')


// const vendorHelpQueue = require('../queues/vendor/vendor_help.queue.js')

const Vendor = db.vendor;
const Customer = db.customer
const Booking = db.booking
const BookingRating = db.bookingRating
const FreeVehicle = db.freeVehicle
const SiteSlider = db.sliderSeting
const Counter = db.counter
const Review = db.review
const Video = db.helpVideo
const FreeVehicleRequest = db.requestFreeVehicle
const VendorAccDelReq = db.vendor_acc_delete_req
const Service = db.service
const VendorService = db.vendor_service
const BookingCancel = db.booking_cancel
const FreeVehicleCancel = db.freeVehicle_cancel
const Faq = db.faqs
const About = db.about
const Notification = db.notification
const VendorHelp = db.vendor_help
const VendorHelpAnswer = db.vendor_help_answer
const BookingRequest = db.bookingRequest
const BookingReject = db.bookingRejection
const WalletTransaction = db.wallet_transaction
const HolidayPackageEnquiry = db.holydaypackageEnquiry
const InsuranceEnquiry = db.insuranceEnquiry
const HotelEnquiry = db.hotelEnquiry
const FlightEnquiry = db.flightEnquiry
const SiteSetting = db.siteSettings
const Chat = db.chat
const Conversation = db.conversation
const VendorRating = db.vendorRating
const BookingAdvanceRequest = db.bookingAdvanceRequest
const BookingAdvanceRequestHistory = db.bookingAdvanceRequestHistory
const BookingPayment = db.bookingPayment;
const VendorPayout = db.vendorPayout;
const BookingRefund = db.bookingRefund
const EnquiryCall = db.EnquiryCalls

const enquiryModelMap = {
    cab: db.CabEnquiry,
    flight: db.flightEnquiry,
    hotel: db.hotelEnquiry,
    holiday_package: db.holydaypackageEnquiry,
    insurance: db.insuranceEnquiry
};

let hasChatUnlockedColumnCache = null;
async function hasChatUnlockedColumn() {
    if (hasChatUnlockedColumnCache !== null) {
        return hasChatUnlockedColumnCache;
    }

    try {
        const [results] = await db.sequelize.query(`
            SHOW COLUMNS FROM tbl_booking_requests LIKE 'chat_unlocked'
        `);

        hasChatUnlockedColumnCache = Array.isArray(results) && results.length > 0;
        return hasChatUnlockedColumnCache;
    } catch (error) {
        console.error('check chat_unlocked column error:', error);
        hasChatUnlockedColumnCache = false;
        return false;
    }
}

const queueEnquiryForOtherVendors = async ({
    senderToken,
    type,
    title,
    message,
    payload
}) => {
    const vendors = await Vendor.findAll({
        where: {
            flag: 0,
            status: "active",
            token: { [Op.ne]: senderToken },
            booking_notification_enabled: true
        },
        attributes: ["token"],
        raw: true
    });

    if (!vendors.length) return;

    await Promise.all(
        vendors.map((v) =>
            enquiryNotificationQueue.add("enquiry-notification", {
                sender_token: senderToken,
                receiver_token: v.token,
                receiver_role: "vendor",
                type,
                title,
                message,
                payload
            })
        )
    );
};

router.get('/get/dashboard', [vendorMiddleware], async (req, res) => {
    try {
        const [serviceResult, sliderResult, countersResult, recentReviews, recentVideos] = await Promise.all([
            Service.findAll({
                where: {
                    status: 'active'
                },
                attributes: ['id', 'name'],
                order: [['id', 'ASC']],
            }),
            SiteSlider.findAll({
                attributes: [[Sequelize.literal(`CONCAT('${admin_url}', image)`), 'image'], 'position'],
                where: { image: { [Sequelize.Op.ne]: null } },
                order: [['position', 'ASC']],
                raw: true
            }),
            Counter.findAll({
                attributes: ['key', 'value', 'display_name', 'icon', 'prefix', 'suffix'],
                where: { is_active: true, category: ['main', 'secondary'] },
                order: [['category', 'ASC'], ['position', 'ASC']],
                raw: true
            }),
            Review.findAll({
                attributes: ['id', 'review_by', 'review_for', 'reviewer_token', 'rating', 'comment', 'created_at'],
                where: { status: 'APPROVED', review_by: 'VENDOR' },
                order: [['created_at', 'DESC']],
                limit: 5,
                include: [{
                    model: Vendor,
                    attributes: [[Sequelize.literal(`CASE WHEN profile_image IS NOT NULL THEN CONCAT('${admin_url}', profile_image) ELSE NULL END`), 'profile_image']],
                    required: false,
                    as: 'vendor_reviewer'
                }],
                raw: true,
                nest: true
            }),
            Video.findAll({
                attributes: ['id', 'token', 'source_type', [Sequelize.literal(`CASE WHEN thumbnail IS NOT NULL THEN CONCAT('${admin_url}', thumbnail) ELSE NULL END`), 'thumbnail'], 'title', 'description', 'category', 'status', 'created_at'],
                where: { status: true },
                order: [['created_at', 'DESC']],
                limit: 2,
                raw: true
            })
        ]);

        const formattedCounters = {};
        countersResult.forEach(counter => {
            formattedCounters[counter.key] = {
                value: counter.value,
                display_name: counter.display_name,
                icon: counter.icon,
                prefix: counter.prefix || '',
                suffix: counter.suffix || ''
            };
        });

        const mainCounters = {
            happy_customers: Number(formattedCounters.happy_customers?.value) || 0,
            verified_vendors: Number(formattedCounters.verified_vendors?.value) || 0,
            app_rating: Math.round(Number(formattedCounters.app_rating?.value)) || 0,
            support_rating: Math.round(Number(formattedCounters.support_rating?.value)) || 0,
            total_cities: Number(formattedCounters.total_cities?.value) || 0,
            total_bookings: Number(formattedCounters.total_bookings?.value) || 0,
            active_users: Number(formattedCounters.active_users?.value) || 0,
            app_downloads: Number(formattedCounters.app_downloads?.value) || 0
        };

        const reviewsWithProfile = recentReviews.map(r => ({
            id: r.id,
            review_by: r.review_by,
            review_for: r.review_for,
            reviewer_token: r.reviewer_token,
            rating: r.rating,
            comment: r.comment,
            created_at: r.created_at,
            profile_image: r.vendor_reviewer?.profile_image || null
        }));

        const result = {
            services: serviceResult,
            sliders: sliderResult,
            counters: formattedCounters,
            recent_reviews: reviewsWithProfile,
            recent_videos: recentVideos,
            main_counters: mainCounters,
            show_counters: formattedCounters.show_counters?.value === 1 || true,
            auto_update: formattedCounters.auto_update?.value === 1 || false
        };

        // await setCache(cacheKey, { data: result, lastModified }, 300);

        return res.status(200).json(responseData('Dashboard fetched successfully', result, req, true));

    } catch (error) {
        console.error('Getting dashboard error:', error);
        return res.status(500).json(responseData('Error occurred', {}, req, false));
    }
});

router.get("/video/get/:token", vendorMiddleware, async (req, res) => {
    const token = req.params.token;
    try {
        const video = await Video.findOne({
            where: { token, status: 1 }
        });

        if (!video) return res.json(responseData("Video not found", {}, req, false));

        let videoUrl = video.video_url;
        if (!videoUrl.startsWith("http")) videoUrl = `${admin_url}${video.video_url}`;

        return res.json(responseData("Video fetched successfully", { url: videoUrl }, req, true));

    } catch (err) {
        console.error("🎥 Video link error:", err);
        return res.json(responseData("Internal server error", { error: err.message }, req, false));
    }
});

router.get('/get/faqs', [vendorMiddleware], async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = 5;
        const offset = (page - 1) * limit;

        const faqs = await Faq.findAll({
            where: {
                status: 'active'
            },
            attributes: ['id', 'question', 'answer'],
            order: [['id', 'DESC']],
            limit,
            offset
        });

        return res.status(200).json(
            responseData(
                'Faq fetched successfully',
                {
                    faqs,
                    page,
                    hasMore: faqs.length === limit
                },
                req,
                true
            )
        );

    } catch (error) {
        console.error('Get faq error:', error);
        return res.status(500).json(
            responseData('Error occurred', {}, req, false)
        );
    }
});

router.get('/get/about', [vendorMiddleware], async (req, res) => {
    try {
        const result = await About.findOne({
            where: {
                status: 'active'
            },
            attributes: [
                'heading',
                'title',
                'description',
                [Sequelize.literal(`CONCAT('${admin_url}', image)`), 'image']
            ]
        })
        return res.status(200).json(responseData('About fetch successfully', result, req, true))
    } catch (error) {
        console.log('Fetching about section error : ', error)
        return res.status(500).json(responseData('Error occured', {}, req, false))
    }
})

router.get('/get/help/data', [vendorMiddleware], async (req, res) => {
    try {
        const vendor = req.user;

        if (!vendor?.token) {
            return res.status(401).json(
                responseData('Unauthorized', {}, req, false)
            );
        }

        let { page, limit, status } = req.query;

        page = Number(page) || 1;
        limit = Number(limit) || 10;

        const statusMap = {
            PENDING: 'OPEN',
            CLOSED: 'ANSWERED'
        };

        status = status?.toUpperCase() || 'OPEN';
        status = statusMap[status] || status;

        const offset = (page - 1) * limit;

        const where = {
            vendor_token: vendor.token,
            status
        };

        const { count, rows } = await VendorHelp.findAndCountAll({
            where,
            order: [['create_date', 'DESC']],
            limit,
            offset,
            distinct: true,
            subQuery: false,
            include: [
                {
                    model: VendorHelpAnswer,
                    as: 'help_answers',
                    attributes: ['token', 'help_token', 'message', 'create_date'],
                    required: false
                }
            ]
        });

        return res.status(200).json(
            responseData(
                'Help data fetched successfully',
                {
                    total: count,
                    page,
                    limit,
                    totalPages: Math.ceil(count / limit),
                    docs: rows
                },
                req,
                true
            )
        );

    } catch (err) {
        console.error('[GET HELP DATA ERROR]', err);
        return res.status(500).json(
            responseData('Something went wrong', {}, req, false)
        );
    }
});

router.post('/post/help', [vendorMiddleware], async (req, res) => {
    try {
        const { description } = req.body;
        if (!description || description.length < 10) {
            return res.status(401).json(responseData('Description is empty', {}, req, false))
        }
        const vendorToken = req.user.token;

        const help = await VendorHelp.create({
            token: randomstring(64),
            vendor_token: vendorToken,
            title: 'HELP',
            description,
            category: 'OTHER'
        });

        return res.status(201).json(
            responseData('Help request submitted successfully', help, req, true)
        );

    } catch (error) {
        console.error('Vendor help create error:', error);
        return res.status(500).json(
            responseData('Internal server error', {}, req, false)
        );
    }
})

// router.get('/get/services', [vendorMiddleware], async (req, res) => {
//     try {
//         const page = parseInt(req.query.page, 10) || 1;
//         const limit = 10;
//         const offset = (page - 1) * limit;

//         const services = await Service.findAll({
//             where: {
//                 status: 'active'
//             },
//             attributes: ['id', 'name', 'code', 'description', 'token'],
//             order: [['name', 'ASC']],
//             limit,
//             offset
//         });

//         return res.status(200).json(
//             responseData(
//                 'Services fetched successfully',
//                 {
//                     services,
//                     page,
//                     hasMore: services.length === limit
//                 },
//                 req,
//                 true
//             )
//         );
//     } catch (error) {
//         console.error('Get services error:', error);
//         return res.status(500).json(
//             responseData('Error occurred', {}, req, false)
//         );
//     }
// });

router.post('/add-services', [vendorMiddleware, vendorValidation.validate('add-services')], async (req, res) => {
    try {
        const { service } = req.body;
        const { token: vendorToken } = req.user;

        const vendorServicesData = service.map(serviceToken => ({
            token: randomstring(64),
            vendor_token: vendorToken,
            service_token: serviceToken,
            create_date: new Date()
        }));

        await VendorService.bulkCreate(vendorServicesData, { ignoreDuplicates: true });

        return res.status(201).json(
            responseData('Services added successfully', {}, req, true)
        );

    } catch (error) {
        console.log('Add service error : ', error);
        return res.status(500).json(
            responseData('Error occurred', {}, req, false)
        );
    }
})

router.put('/service/:token', [vendorMiddleware, vendorValidation.validate('update-service')], async (req, res) => {
    try {
        const { token } = req.params;
        const { service_token } = req.body;
        const { token: vendorToken } = req.user;
        const existingEntry = await VendorService.findOne({
            where: { token, vendor_token: vendorToken }
        });

        if (!existingEntry) {
            return res.status(404).json(
                responseData('Service not found or unauthorized', {}, req, false)
            );
        }

        const updateData = {};
        if (service_token) updateData.service_token = service_token;
        await VendorService.update(updateData, {
            where: { token }
        });

        return res.status(200).json(
            responseData('Service updated successfully', {}, req, true)
        );

    } catch (error) {
        console.log('Update service error:', error);
        return res.status(500).json(
            responseData('Error occurred', {}, req, false)
        );
    }
});

router.delete('/service/:token', [vendorMiddleware, vendorValidation.validate('delete-service')], async (req, res) => {
    try {
        const { token } = req.params;
        const { token: vendorToken } = req.user;

        const deleted = await VendorService.destroy({
            where: {
                token: token,
                vendor_token: vendorToken
            }
        });

        if (!deleted) {
            return res.status(404).json(
                responseData('Service not found or unauthorized', {}, req, false)
            );
        }

        return res.status(200).json(
            responseData('Service removed successfully', {}, req, true)
        );

    } catch (error) {
        console.log('Remove service error:', error);
        return res.status(500).json(
            responseData('Error occurred', {}, req, false)
        );
    }
});

router.post('/add-preferences', [vendorMiddleware, vendorValidation.validate('add-preferences')], async (req, res) => {
    try {
        const { token } = req.user;
        const io = getIO();

        const preferenceState = req.body['preference-state'];
        const preferenceCity = req.body['preference-city'];

        const [updatedRows] = await Vendor.update(
            { preferred_state: preferenceState, preferred_cities: preferenceCity },
            { where: { token: token } }
        );

        if (updatedRows > 0) {
            io.to(`vendor:${token}`).emit('preferences_updated', {
                preferred_state: preferenceState,
                preferred_cities: preferenceCity
            });
        }

        return res.status(200).json(responseData('Preferences added successfully', {}, req, true));

    } catch (err) {
        console.log('add preference error : ', err);
        return res.status(500).json(responseData('Error occured', {}, req, false));
    }
});

router.get('/notifications/history', [vendorMiddleware], async (req, res) => {
    try {
        const { page = 1, limit = 12, is_read, type } = req.query;

        const where = {
            receiver_token: req.user.token,
            receiver_role: 'vendor',
            flag: 0
        };

        if (is_read !== undefined) {
            where.is_read = is_read === '1' || is_read === 'true';
        }

        if (type) {
            where.type = type;
        }

        const data = await getSequelizePagination({
            page,
            limit,
            model: Notification,
            where,
            order: [['create_date', 'DESC']]
        });

        return res.status(200).json(
            responseData('Notifications fetched successfully', data, req, true)
        );

    } catch (error) {
        console.error('Get notifications error:', error);
        return res.status(500).json(
            responseData('Error occurred', {}, req, false)
        );
    }
});

router.get('/get/booking-slider', [vendorMiddleware], async (req, res) => {
    try {
        const vendorToken = req?.user?.token;

        const vendor = await Vendor.findOne({
            where: { token: vendorToken },
            attributes: ['preferred_state', 'preferred_cities', 'booking_notification_enabled']
        });

        return res.status(200).json(
            responseData(
                'Booking slider data fetched successfully',
                {
                    preferences: {
                        preferred_state: vendor?.preferred_state || null,
                        preferred_cities: vendor?.preferred_cities || []
                    },
                    booking_notification_enabled: vendor?.booking_notification_enabled || false
                },
                req,
                true
            )
        );

    } catch (error) {
        console.error('Error fetching booking slider data:', error);
        return res.status(500).json(
            responseData('Error occurred', {}, req, false)
        );
    }
});

router.post('/notifications/mark-booking-read', [vendorMiddleware], async (req, res) => {
    const { booking_token } = req.body;

    await Notification.update(
        { is_read: true },
        {
            where: {
                booking_token,
                receiver_token: req.user.token
            }
        }
    );

    res.json(responseData('Booking notifications marked as read', {}, req, true));
});

router.post('/notifications/delete', [vendorMiddleware], async (req, res) => {
    try {
        const { notification_id } = req.body;

        if (!notification_id) {
            return res.status(400).json(
                responseData('Notification id is required', {}, req, false)
            );
        }

        const updated = await Notification.update(
            { flag: 1 },
            {
                where: {
                    id: notification_id,
                    receiver_token: req.user.token,
                    flag: 0
                }
            }
        );

        if (!updated[0]) {
            return res.status(404).json(
                responseData('Notification not found', {}, req, false)
            );
        }

        return res.json(
            responseData('Notification deleted', {}, req, true)
        );

    } catch (error) {
        console.error('Delete notification error:', error);
        return res.status(500).json(
            responseData('Error occurred', {}, req, false)
        );
    }
});

router.post('/notification/toggle', [vendorMiddleware], async (req, res) => {
    try {
        const vendor = req.user;
        const { enabled } = req.body;

        if (typeof enabled !== 'boolean') {
            return res.status(400).json(
                responseData('enabled must be true or false', {}, req, false)
            );
        }

        const resu = await Vendor.update(
            { booking_notification_enabled: enabled },
            { where: { token: vendor.token } }
        );

        const io = getIO();
        io?.to(`vendor:${vendor.token}`).emit('notification_toggle_update', {
            booking_notification_enabled: enabled
        });

        return res.status(200).json(
            responseData(
                `Booking notifications ${enabled ? 'enabled' : 'disabled'}`,
                { booking_notification_enabled: enabled },
                req,
                true
            )
        );

    } catch (error) {
        console.error('[NOTIFICATION TOGGLE ERROR]', error);
        return res.status(500).json(
            responseData('Something went wrong', {}, req, false)
        );
    }
});

// leads notifications
router.post('/customer-notification/toggle', [vendorMiddleware], async (req, res) => {
    try {
        const vendor = req.user;
        const { enabled } = req.body;

        if (typeof enabled !== 'boolean') {
            return res.status(400).json(
                responseData('enabled must be true or false', {}, req, false)
            );
        }

        await Vendor.update(
            { customer_notification_enabled: enabled },
            { where: { token: vendor.token } }
        );

        const io = getIO();
        io?.to(`vendor:${vendor.token}`).emit('customer_notification_toggle_update', {
            customer_notification_enabled: enabled
        });

        return res.status(200).json(
            responseData(
                `Customer notifications ${enabled ? 'enabled' : 'disabled'}`,
                { customer_notification_enabled: enabled },
                req,
                true
            )
        );

    } catch (error) {
        console.error('[CUSTOMER NOTIFICATION TOGGLE ERROR]', error);
        return res.status(500).json(
            responseData('Something went wrong', {}, req, false)
        );
    }
});

/* ---------------- free vehicle routes --------------- */

router.get('/get/my-free-vehicle', [vendorMiddleware, verifiedOnly], async (req, res) => {
    try {
        const token = req.user.token;
        const { page = 1, limit = 12, status, date, vehicle_type } = req.query;
        // const cacheKey = `my_free_vehicles_${token}_${page}_${limit}_${status || 'all'}_${date || 'all'}_${vehicle_type || 'all'}`;

        // const lastUpdate = await FreeVehicle.max('updated_at', { where: { vendor_token: token } });
        // const cached = await getCache(cacheKey);

        // if (cached && cached.lastModified === new Date(lastUpdate).getTime()) {
        //     return res.status(200).json(
        //         responseData('My free vehicles fetched successfully (from cache)', cached.data, req, true)
        //     );
        // }

        const whereClause = { vendor_token: token };

        if (status) whereClause.status = status;
        if (date) {
            whereClause.created_at = {
                [Op.gte]: new Date(new Date(date).setHours(0, 0, 0, 0)),
                [Op.lte]: new Date(new Date(date).setHours(23, 59, 59, 999))
            };
        }
        if (vehicle_type) whereClause.vehicle_type = vehicle_type.toUpperCase();

        const result = await getSequelizePagination({
            page,
            limit,
            model: FreeVehicle,
            attributes: [
                'id',
                'token',
                'accept_type',
                'vehicle_type',
                'vehicle_name',
                'state',
                'city',
                'location',
                'free_start_time',
                'free_end_time',
                'status',
                'created_at'
            ],
            where: whereClause,
            order: [['created_at', 'DESC']],
            include: [
                {
                    model: Vendor,
                    as: 'vendor',
                    attributes: [
                        'token',
                        'first_name',
                        'last_name',
                        'verification_status',
                        'create_date'
                    ],
                    required: false
                }
            ]
        });

        // await setCache(cacheKey, { data: result, lastModified: new Date(lastUpdate).getTime() }, 300);

        if (result.docs.length === 0) {
            return res.status(200).json(
                responseData('No free vehicles posted', result, req, true)
            );
        }

        return res.status(200).json(
            responseData('My free vehicles fetched successfully', result, req, true)
        );

    } catch (error) {
        console.error('getting my free vehicles error : ', error);
        return res.status(500).json(
            responseData('Error occurred', {}, req, false)
        );
    }
});

router.get('/get/my-free-vehicle-with-requests', [vendorMiddleware, verifiedOnly], async (req, res) => {
    try {
        const vendorToken = req.user.token;
        const { page = 1, limit = 12, status, date, vehicle_type } = req.query;

        const whereClause = { vendor_token: vendorToken };
        if (status) whereClause.status = status;
        if (date) {
            whereClause.created_at = {
                [Op.gte]: new Date(new Date(date).setHours(0, 0, 0, 0)),
                [Op.lte]: new Date(new Date(date).setHours(23, 59, 59, 999))
            };
        }
        if (vehicle_type) whereClause.vehicle_type = vehicle_type.toUpperCase();

        const result = await getSequelizePagination({
            page,
            limit,
            model: db.freeVehicle,
            where: whereClause,
            order: [['created_at', 'DESC']],
            attributes: [
                'id',
                'token',
                'accept_type',
                'vehicle_type',
                'vehicle_name',
                'state',
                'city',
                'location',
                'free_start_time',
                'free_end_time',
                'status',
                'created_at'
            ],
            include: [
                {
                    model: db.vendor,
                    as: 'vendor',
                    attributes: [
                        'token',
                        'first_name',
                        'last_name',
                        'verification_status'
                    ],
                    required: false
                },
                {
                    model: db.requestFreeVehicle,
                    as: 'requests',
                    required: false,
                    attributes: [
                        'token',
                        'status',
                        'requested_start_time',
                        'requested_end_time',
                        'accepted_at',
                        'created_at'
                    ],
                    include: [
                        {
                            model: db.vendor,
                            as: 'requester',
                            attributes: [
                                'token',
                                'first_name',
                                'last_name',
                                'profile_image'
                            ],
                            required: false
                        }
                    ]
                }
            ]
        });

        const formattedDocs = result.docs.map(vehicle => {
            const plain = vehicle.get({ plain: true });
            const acceptedRequest = plain.requests?.find(r => r.status === 'ACCEPTED') || null;
            return {
                ...plain,
                accepted_request: acceptedRequest,
                requests: undefined
            };
        });

        result.docs = formattedDocs;

        // await setCache(cacheKey, { data: result, lastModified: new Date(lastUpdate).getTime() }, 300);

        return res.status(200).json(
            responseData('My free vehicles fetched successfully', result, req, true)
        );

    } catch (error) {
        console.error('Get my free vehicle with requests error:', error);
        return res.status(500).json(
            responseData('Error occurred', {}, req, false)
        );
    }
});

router.get('/get/free-vehicle/:token', [vendorMiddleware, verifiedOnly, vendorValidation.validate('get-free-vehicle')], async (req, res) => {
    try {
        const { token } = req.params;

        const requesterToken = req.user.token;

        const result = await FreeVehicle.findOne({
            where: { token },
            attributes: { exclude: ['updated_at', 'flag'] },
            include: [
                {
                    model: Vendor,
                    as: 'vendor',
                    attributes: [
                        'first_name',
                        'last_name',
                        'verification_status',
                        'contact',
                        ['create_date', 'created_at']
                    ],
                    required: true
                },
                {
                    model: FreeVehicleRequest,
                    as: 'requests',
                    attributes: ['status'],
                    where: {
                        requested_by_vendor_token: requesterToken
                    },
                    required: false
                }
            ]
        });

        if (!result) {
            return res.status(404).json(
                responseData('Free vehicle not found', {}, req, false)
            );
        }

        return res.status(200).json(
            responseData('Free vehicle fetched successfully', result, req, true)
        );

    } catch (error) {
        console.error('GET FREE VEHICLE ERROR:', error);
        return res.status(500).json(
            responseData('Error occurred', {}, req, false)
        );
    }
});

router.get('/get-requests/free-vehicle/:token', [vendorMiddleware, verifiedOnly], async (req, res) => {
    try {
        const freeVehicleToken = req.params.token;
        const { page = 1, limit = 12, type = 'APPROVAL', status = 'ACCEPTED' } = req.query;

        const result = await getSequelizePagination({
            page,
            limit,
            model: FreeVehicleRequest,
            attributes: [
                'id',
                'token',
                'status',
                'created_at',
                'requested_by_vendor_token',
            ],
            where: { status },
            order: [['created_at', 'DESC']],
            include: [
                {
                    model: FreeVehicle,
                    as: 'freeVehicle',
                    required: true,
                    where: { token: freeVehicleToken, accept_type: type },
                    attributes: ['token', 'id']
                },
                {
                    model: Vendor,
                    as: 'requester',
                    required: false,
                    attributes: ['token', 'first_name', 'last_name', 'contact']
                }
            ],
            subQuery: false
        });

        const data = result.docs.map(row => ({
            requestedBy: row.requester
                ? {
                    token: row.freeVehicle.token,
                    first_name: row.requester.first_name,
                    last_name: row.requester.last_name,
                    contact: row.requester.contact,
                    acceptedAt: row.get('created_at'),
                    status: row.get('status')
                }
                : null
        }));

        return res.status(200).json(
            responseData(
                'Free vehicle requests fetched successfully',
                { docs: data, page: result.page, limit: result.limit, totalDocs: result.totalDocs, totalPages: result.totalPages },
                req,
                true
            )
        );
    } catch (error) {
        console.error('Get request free vehicle error:', error);
        return res.status(500).json(
            responseData('Error occurred while fetching requests', {}, req, false)
        );
    }
});

router.get('/get/all-vehicle', [vendorMiddleware], async (req, res) => {
    try {
        const vendorToken = req?.user?.token;
        const rawSavedCities = req.user.preferred_cities;

        if (!vendorToken) {
            return res.status(401).json(
                responseData('Unauthorized', {}, req, false)
            );
        }

        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 20;
        const search = typeof req.query.search === 'string'
            ? req.query.search.trim()
            : null;

        let cityArray = [];
        if (rawSavedCities) {
            try {
                if (Array.isArray(rawSavedCities)) {
                    const joined = rawSavedCities.join(',');
                    cityArray = JSON.parse(joined);
                } else if (typeof rawSavedCities === 'string') {
                    cityArray = JSON.parse(rawSavedCities);
                }
            } catch (e) {
                cityArray = typeof rawSavedCities === 'string'
                    ? rawSavedCities.split(',').map(c => c.trim())
                    : [];
            }
        }

        if (!Array.isArray(cityArray) || cityArray.length === 0) {
            return res.status(200).json(
                responseData('No preferred cities set. Please update your profile.', { data: [], total: 0 }, req, true)
            );
        }

        const whereCondition = {
            city: { [Op.in]: cityArray },
            status: 'AVAILABLE',
            vendor_token: { [Op.ne]: vendorToken }
        };

        if (search) {
            if (search.length > 30) {
                return res.status(400).json(
                    responseData('Invalid search value', {}, req, false)
                );
            }
        }

        const result = await getSequelizePagination({
            model: FreeVehicle,
            page,
            limit,
            where: whereCondition,
            attributes: [
                'id',
                'token',
                'vehicle_type',
                'accept_type',
                'vehicle_name',
                'state',
                'city',
                'location',
                'free_start_time',
                'free_end_time',
                'available_anywhere',
                'createdAt'
            ],
            include: [
                {
                    model: Vendor,
                    as: 'vendor',
                    attributes: [
                        'first_name',
                        'last_name',
                        'contact',
                        'verification_status',
                        [
                            Sequelize.literal(`CASE WHEN profile_image IS NOT NULL THEN CONCAT('${admin_url}', profile_image) ELSE NULL END`),
                            'profile_image'
                        ]
                    ],
                    where: { flag: 0 },
                    required: false
                }
            ],
            order: [['createdAt', 'DESC']]
        });

        // await setCache(cacheKey, { data: result, lastModified: new Date(lastUpdate).getTime() }, 300);

        return res.status(200).json(
            responseData('Vehicle leads fetched successfully', result, req, true)
        );

    } catch (error) {
        console.error('Get vehicle leads error:', error);
        return res.status(500).json(
            responseData('Internal server error', {}, req, false)
        );
    }
});

router.get('/my/accepted/free-vehicle', [vendorMiddleware, verifiedOnly], async (req, res) => {
    try {
        const vendorToken = req.user.token;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const { count, rows } = await FreeVehicle.findAndCountAll({
            where: {
                flag: 0
            },
            attributes: [
                'id',
                'token',
                'vendor_token',
                'vehicle_type',
                'vehicle_name',
                'state',
                'city',
                'location',
                'free_start_time',
                'free_end_time',
                'available_anywhere',
                'accept_type',
                'status',
                'notes',
                'created_at'
            ],
            include: [
                {
                    model: FreeVehicleRequest,
                    as: 'requests',
                    required: true,
                    where: {
                        requested_by_vendor_token: vendorToken,
                        status: {
                            [db.Sequelize.Op.in]: ['PENDING', 'ACCEPTED']
                        }
                    },
                    attributes: [
                        'id',
                        'token',
                        'requested_by_vendor_token',
                        'requested_start_time',
                        'requested_end_time',
                        'accepted_at',
                        'accepted_by_vendor_token',
                        'status'
                    ]
                },
                {
                    model: Vendor,
                    as: 'vendor',
                    required: false,
                    attributes: ['token', 'first_name', 'last_name', 'contact']
                }
            ],
            order: [
                ['created_at', 'DESC']
            ],
            limit,
            offset,
            distinct: true
        });

        console.log('ffffffff ', rows[0].requests)

        const responseDataObj = {
            total: count,
            page,
            limit,
            free_vehicles: rows
        };

        return res.status(200).json(
            responseData(
                'Accepted requested free vehicles fetched successfully',
                responseDataObj,
                req,
                true
            )
        );

    } catch (error) {
        console.error('My accepted free vehicle error:', error);
        return res.status(500).json(
            responseData('Error occurred', {}, req, false)
        );
    }
});

router.post('/post-free-vehicle', [vendorMiddleware, verifiedOnly, vendorValidation.validate('post-free-vehicle')], async (req, res) => {
    try {
        const {
            vehicle_type,
            vehicle_name,
            accept_type,
            state,
            city,
            location,
            free_start_time,
            free_end_time,
            available_anywhere = false,
            notes
        } = req.body;

        const vendorToken = req.user.token;

        const now = new Date();
        const start = new Date(free_start_time);
        const end = new Date(free_end_time);

        if (isNaN(start) || isNaN(end)) {
            return res.status(400).json(
                responseData('Invalid date format', {}, req, false)
            );
        }

        if (start < now) {
            return res.status(400).json(
                responseData('Free start time cannot be in the past', {}, req, false)
            );
        }

        if (end <= start) {
            return res.status(400).json(
                responseData('End time must be after start time', {}, req, false)
            );
        }

        const freeVehicle = await FreeVehicle.create(
            {
                token: randomstring(64),
                vendor_token: vendorToken,
                vehicle_type,
                vehicle_name,
                accept_type: accept_type === 'instant' ? 'INSTANT' : 'APPROVAL',
                state,
                city,
                location,
                free_start_time: start,
                free_end_time: end,
                available_anywhere,
                notes,
                status: 'AVAILABLE'
            }
        );

        res.status(201).json(
            responseData('Free vehicle posted successfully', {}, req, true)
        );

        const io = getIO();
        const vendors = await Vendor.findAll({
            where: {
                flag: 0,
                booking_notification_enabled: true,
                token: { [Op.ne]: vendorToken },
                [Op.and]: Sequelize.literal(
                    `JSON_CONTAINS(
                    LOWER(JSON_EXTRACT(preferred_cities, '$')),
                    LOWER('"${city}"')
                    )`
                )
                // [Op.and]: Sequelize.literal(`JSON_CONTAINS(preferred_cities, '"${city}"')`)
            },
            attributes: ['first_name', 'last_name', 'token'],
            raw: true
        });

        await freeVehicleNotificationQueue.add('FREE_VEHICLE_POSTED', {
            freeVehicleToken: freeVehicle.token,
            city,
            state,
            vehicle_type,
            vendorToken
        });

        const vendorTokens = vendors.map(v => v.token);

        vendorTokens.forEach(token => {
            io.to(`vendor:${token}`).emit('free_vehicle:posted', {
                free_vehicle_token: freeVehicle.token,
                vehicle_type: freeVehicle.vehicle_type,
                vehicle_name: freeVehicle.vehicle_name,
                city: freeVehicle.city,
                state: freeVehicle.state,
                free_start_time: freeVehicle.free_start_time,
                free_end_time: freeVehicle.free_end_time,
                accept_type: freeVehicle.accept_type,
                available_anywhere: freeVehicle.available_anywhere,

                title: 'LehConnect require',
                message: `A ${freeVehicle.vehicle_type} is available in ${freeVehicle.city} between ${freeVehicle.free_start_time} and ${freeVehicle.free_end_time}`
            });
        });


    } catch (error) {
        await t.rollback();
        console.error('[POST FREE VEHICLE ERROR]', error);

        return res.status(500).json(
            responseData('Something went wrong', {}, req, false)
        );
    }
});

router.post('/free-vehicle/:token/request', [vendorMiddleware, verifiedOnly], async (req, res) => {

    const t = await db.sequelize.transaction({
        isolationLevel: db.Sequelize.Transaction.ISOLATION_LEVELS.READ_COMMITTED
    });

    try {
        const requester = req.user;
        const freeVehicleToken = req.params.token;
        const { requested_start_time: startTimeFromBody, requested_end_time: endTimeFromBody } = req.body || {};

        const freeVehicle = await FreeVehicle.findOne({
            where: {
                token: freeVehicleToken,
                status: { [Op.in]: ['AVAILABLE', 'REQUESTED'] }
            },
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!freeVehicle) {
            await t.rollback();
            return res.status(404).json(
                responseData('Vehicle not found or unavailable', {}, req, false)
            );
        }

        if (freeVehicle.vendor_token === requester.token) {
            await t.rollback();
            return res.status(400).json(
                responseData('Cannot request your own vehicle', {}, req, false)
            );
        }

        const owner = await Vendor.findOne({
            where: { token: freeVehicle.vendor_token },
            attributes: ['token', 'first_name', 'last_name']
        });

        const vehiclePayload = {
            token: freeVehicle.token,
            vehicle_type: freeVehicle.vehicle_type,
            city: freeVehicle.city,
            state: freeVehicle.state,
            accept_type: freeVehicle.accept_type
        };

        const requested_start_time = freeVehicle.accept_type === 'INSTANT'
            ? freeVehicle.free_start_time
            : startTimeFromBody || freeVehicle.free_start_time;

        const requested_end_time = freeVehicle.accept_type === 'INSTANT'
            ? freeVehicle.free_end_time
            : endTimeFromBody || freeVehicle.free_end_time;

        if (freeVehicle.accept_type === 'INSTANT') {

            await freeVehicle.update(
                {
                    status: 'BOOKED',
                    booked_by_vendor_token: requester.token,
                    booked_at: new Date()
                },
                { transaction: t }
            );

            await FreeVehicleRequest.create(
                {
                    token: randomstring(64),
                    free_vehicle_token: freeVehicle.token,
                    requested_by_vendor_token: requester.token,
                    owner_vendor_token: owner.token,
                    requested_start_time,
                    requested_end_time,
                    status: 'ACCEPTED',
                    accepted_at: new Date(),
                    accepted_by_vendor_token: owner.token
                },
                { transaction: t }
            );

            await t.commit();

            res.status(200).json(
                responseData('Vehicle booked successfully', {}, req, true)
            );

            const io = getIO();
            io?.to(`vendor:${owner.token}`).emit('free_vehicle:booked', {
                vehicle: vehiclePayload,
                requester: requester.token
            });

            await freeVehicleNotificationQueue.add('FREE_VEHICLE_BOOKED', {
                free_vehicle_token: freeVehicle.token,
                owner_token: owner.token,
                requester_token: requester.token,
                vehicle_type: freeVehicle.vehicle_type,
                city: freeVehicle.city
            });

            return;
        }

        const existingRequest = await FreeVehicleRequest.findOne({
            attributes: [
                'id',
                'token',
                'free_vehicle_token',
                'requested_by_vendor_token',
                'requested_start_time',
                'requested_end_time',
                'status',
                'accepted_at',
                'accepted_by_vendor_token',
                'rejection_reason',
                'created_at',
                'updated_at'
            ],
            where: {
                free_vehicle_token: freeVehicle.token,
                requested_by_vendor_token: requester.token,
                status: { [Op.in]: ['PENDING', 'ACCEPTED'] }
            },
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (existingRequest) {
            await t.rollback();
            return res.status(409).json(
                responseData(
                    'You have already requested this vehicle',
                    {},
                    req,
                    false
                )
            );
        }

        await FreeVehicleRequest.create(
            {
                token: randomstring(64),
                free_vehicle_token: freeVehicle.token,
                requested_by_vendor_token: requester.token,
                owner_vendor_token: owner.token,
                requested_start_time,
                requested_end_time,
                status: 'PENDING'
            },
            { transaction: t }
        );

        if (freeVehicle.status === 'AVAILABLE') {
            await freeVehicle.update(
                { status: 'REQUESTED' },
                { transaction: t }
            );
        }

        await t.commit();

        console.log('Adding notification job...');

        res.status(200).json(
            responseData('Request sent successfully', {}, req, true)
        );

        const io = getIO();
        // const io = getIO();
        console.log('io exists:', !!io);
        console.log('emitting to room:', `vendor:${owner.token}`);
        io?.to(`vendor:${owner.token}`).emit('free_vehicle:request', {
            vehicle: vehiclePayload,
            requester: requester.token
        });

        await freeVehicleNotificationQueue.add('FREE_VEHICLE_REQUESTED', {
            free_vehicle_token: freeVehicle.token,
            owner_token: owner.token,
            requester_token: requester.token,
            vehicle_type: freeVehicle.vehicle_type,
            city: freeVehicle.city
        });

    } catch (err) {
        await t.rollback();
        console.error('❌ Request vehicle error:', err);

        return res.status(500).json(
            responseData('Internal server error', {}, req, false)
        );
    }
});

router.post('/free-vehicle/:token/request-action', [vendorMiddleware, verifiedOnly], async (req, res) => {
    const { action, reason } = req.body;
    console.log('body ', req.body, req.params)
    const { token } = req.params;
    const vendor = req.user;

    if (!['ACCEPT', 'REJECT'].includes(action)) {
        return res.status(409).json(
            responseData('Invalid action', {}, req, false)
        )
    }

    const t = await db.sequelize.transaction({
        isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED
    });

    try {
        const request = await FreeVehicleRequest.findOne({
            where: {
                free_vehicle_token: token,
                status: 'PENDING'
            },
            include: [
                {
                    model: FreeVehicle,
                    as: 'freeVehicle',
                    required: true
                }
            ],
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        // console.log('request token =>', token);
        // console.log('request found =>', !!request);
        // console.log('request freeVehicle =>', request?.freeVehicle);

        if (!request) {
            await t.rollback();
            return res.status(404).json(
                responseData('Request not found or already handled', {}, req, false)
            );
        }

        if (!request.freeVehicle) {
            await t.rollback();
            return res.status(404).json(
                responseData('Vehicle linked to request not found', {}, req, false)
            );
        }

        const freeVehicle = request.freeVehicle;

        if (freeVehicle.vendor_token !== vendor.token) {
            await t.rollback();
            return res.status(403).json(
                responseData('Unauthorized action', {}, req, false)
            );
        }

        if (freeVehicle.accept_type !== 'APPROVAL') {
            await t.rollback();
            return res.status(400).json(
                responseData('Instant vehicles cannot be handled manually', {}, req, false)
            );
        }

        if (action === 'ACCEPT') {
            await request.update(
                {
                    status: 'ACCEPTED',
                    accepted_at: new Date(),
                    accepted_by_vendor_token: vendor.token
                },
                { transaction: t }
            );

            await freeVehicle.update(
                {
                    status: 'BOOKED',
                    booked_by_vendor_token: request.requested_by_vendor_token,
                    booked_at: new Date()
                },
                { transaction: t }
            );

            await FreeVehicleRequest.update(
                { status: 'REJECTED' },
                {
                    where: {
                        free_vehicle_token: freeVehicle.token,
                        status: 'PENDING',
                        token: { [db.Sequelize.Op.ne]: request.token }
                    },
                    transaction: t
                }
            );
        } else {
            await request.update(
                {
                    status: 'REJECTED',
                    rejection_reason: reason
                },
                { transaction: t }
            );

            const pendingCount = await FreeVehicleRequest.count({
                where: {
                    free_vehicle_token: freeVehicle.token,
                    status: 'PENDING'
                },
                transaction: t
            });

            if (pendingCount === 0) {
                await freeVehicle.update(
                    { status: 'AVAILABLE' },
                    { transaction: t }
                );
            }
        }

        await t.commit();

        res.status(200).json(
            responseData(`Request ${action.toLowerCase()}ed successfully`, {}, req, true)
        );

        const io = getIO();

        io.to(`vendor:${request.requested_by_vendor_token}`).emit(
            'free_vehicle_request_event',
            {
                event: action,
                free_vehicle_token: freeVehicle.token,
                request_token: token,
                role: 'requester'
            }
        );

        io.to(`vendor:${vendor.token}`).emit(
            'free_vehicle_request_event',
            {
                event: action,
                free_vehicle_token: freeVehicle.token,
                request_token: token,
                role: 'owner'
            }
        );

        await Notification.bulkCreate([
            {
                sender_token: vendor.token,
                receiver_token: request.requested_by_vendor_token,
                receiver_role: 'vendor',
                type: `FREE_VEHICLE_${action}`,
                title: `Request ${action.toLowerCase()}`,
                message: `Your request was ${action.toLowerCase()} by ${vendor.first_name} ${vendor.last_name}`,
                visibility: 'private'
            }
        ]);
    } catch (error) {
        if (!t.finished) await t.rollback();

        console.error('Free vehicle request action error:', error);
        return res.status(500).json(
            responseData('Error occurred', {}, req, false)
        );
    }
});

router.post('/free-vehicle/request/:token/cancel', [vendorMiddleware, verifiedOnly], async (req, res) => {

    const t = await db.sequelize.transaction({
        isolationLevel: db.Sequelize.Transaction.ISOLATION_LEVELS.READ_COMMITTED
    });

    try {
        const { token: requestToken } = req.params;
        const vendor = req.user;
        const { reason } = req.body;

        const request = await FreeVehicleRequest.findOne({
            where: {
                token: requestToken,
                status: 'PENDING',
                requested_by_vendor_token: vendor.token
            },
            include: [
                {
                    model: FreeVehicle,
                    as: 'freeVehicle',
                    lock: t.LOCK.UPDATE
                }
            ],
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!request || !request.freeVehicle) {
            await t.rollback();
            return res.status(403).json(
                responseData('Unauthorized or already processed', {}, req, false)
            );
        }

        const freeVehicle = request.freeVehicle;

        if (freeVehicle.accept_type !== 'APPROVAL') {
            await t.rollback();
            return res.status(400).json(
                responseData('Instant vehicle requests cannot be cancelled', {}, req, false)
            );
        }

        await request.update(
            { status: 'CANCELLED' },
            { transaction: t }
        );

        await FreeVehicleCancel.create(
            {
                token: randomstring(64),
                free_vehicle_token: freeVehicle.token,
                cancelled_by_vendor_token: vendor.token,
                reason
            },
            { transaction: t }
        );

        const pendingCount = await FreeVehicleRequest.count({
            where: {
                free_vehicle_token: freeVehicle.token,
                status: 'PENDING'
            },
            transaction: t
        });

        if (pendingCount === 0) {
            await freeVehicle.update(
                { status: 'AVAILABLE' },
                { transaction: t }
            );
        }

        await t.commit();

        res.status(200).json(
            responseData('Request cancelled successfully', {}, req, true)
        );

        await freeVehicleCancelQueue.add(
            'FREE_VEHICLE_REQUEST_CANCELLED',
            {
                free_vehicle_token: freeVehicle.token,
                cancelled_by_vendor_token: vendor.token,
                owner_token: freeVehicle.vendor_token,
                reason
            }
        );

        const io = getIO();
        io?.to(`vendor:${freeVehicle.vendor_token}`).emit(
            'free_vehicle_request_cancelled',
            {
                free_vehicle_token: freeVehicle.token,
                cancelled_by: vendor.token,
                reason
            }
        );

    } catch (err) {
        if (!t.finished) await t.rollback();

        console.error('[FREE VEHICLE CANCEL ERROR]', err);
        return res.status(500).json(
            responseData('Something went wrong', {}, req, false)
        );
    }
});

/* ------------- Vendor routes -----------------*/

router.get('/get-profile-status', [vendorMiddleware], async (req, res) => {
    try {
        const token = req?.user?.token
        const result = await Vendor.findOne({
            where: { token },
            attributes: [
                'verification_status'
            ]
        });
        return res.status(200).json(
            responseData('Profile status fetched successfully', result, req, true)
        );
    } catch (error) {
        console.error('profile status error:', error);
        return res.status(500).json(
            responseData('Internal server error', {}, req, false)
        );
    }
})

router.get('/get-profile', [vendorMiddleware], async (req, res) => {
    try {
        const { token } = req?.user;
        // const cacheKey = `vendor_profile_${token}`;

        // const lastUpdate = await Vendor.max('updated_at', { where: { token } });
        // const cached = await getCache(cacheKey);

        // if (cached && cached.lastModified === new Date(lastUpdate).getTime()) {
        //     return res.status(200).json(
        //         responseData('Profile fetched successfully (from cache)', cached.data, req, true)
        //     );
        // }

        const result = await Vendor.findOne({
            where: { token },
            attributes: [
                'first_name',
                'last_name',
                'about_me',
                'contact',
                'email',
                'alt_contact',
                'pincode',
                'address',
                'country',
                'state',
                'city',
                'ref_code',
                'verification_status',
                'rejectReason',
                [Sequelize.literal(`CONCAT('${admin_url}', profile_image)`), 'profile_image'],
                [Sequelize.literal(`CONCAT('${admin_url}', aadhaar_front_image)`), 'aadhaar_front_image'],
                [Sequelize.literal(`CONCAT('${admin_url}', aadhaar_back_image)`), 'aadhaar_back_image'],
                [Sequelize.literal(`CONCAT('${admin_url}', dl_front_image)`), 'dl_front_image'],
                [Sequelize.literal(`CONCAT('${admin_url}', dl_back_image)`), 'dl_back_image'],
                [Sequelize.literal(`CONCAT('${admin_url}', vehicle_image)`), 'vehicle_image']
            ]
        });

        // await setCache(cacheKey, { data: result, lastModified: new Date(lastUpdate).getTime() }, 300);

        // console.log(result)

        return res.status(200).json(
            responseData('Profile fetched successfully', result, req, true)
        );

    } catch (error) {
        console.log('Get profile error : ', error);
        return res.status(500).json(
            responseData('Error occurred', {}, req, false)
        );
    }
});

router.put('/update-basic-details', [vendorMiddleware, uploadImages, vendorValidation.validate('basic-details')], async (req, res) => {
    try {
        const {
            first_name,
            last_name,
            email,
            alt_contact,
            country,
            state,
            city,
            pincode,
            address,
            about_me
        } = req.body;

        const { token } = req?.user;

        const ref_code = generateRefCode({
            role: 'vendor',
            state
        });

        let updateData = {
            first_name,
            last_name,
            email,
            alt_contact,
            country,
            state,
            city,
            pincode,
            address,
            about_me,
            ref_code
        };

        if (req.files?.profile_image) {
            updateData.profile_image = `/uploads/${req.files.profile_image[0].filename}`;
        }

        await Vendor.update(updateData, {
            where: { token }
        });

        return res.status(200).json(
            responseData('Details saved successfully', {}, req, true)
        );

    } catch (error) {
        console.error('Saving basic details error:', error);

        return res.status(500).json(
            responseData('Error occurred', {}, req, false)
        );
    }
});

router.post('/raise-delete-request', [vendorMiddleware], async (req, res) => {
    try {
        const { token } = req.user;
        const { reason } = req.body;
        const io = getIO();

        const existingRequest = await VendorAccDelReq.findOne({
            where: {
                vendor_token: token,
                status: 'PENDING'
            }
        });

        if (existingRequest) {
            return res.status(400).json(
                responseData(
                    'You already have a pending deletion request.',
                    {},
                    req,
                    false
                )
            );
        }

        const deleteReq = await VendorAccDelReq.create({
            token: randomstring(64),
            vendor_token: token,
            reason: reason || 'No reason provided',
            status: 'PENDING'
        });

        const title = 'Account Deletion Requested';
        const message = 'Your account deletion request has been submitted and is pending admin review.';

        await Notification.create({
            receiver_token: token,
            receiver_role: 'vendor',
            type: 'ACCOUNT_DELETION_REQUESTED',
            title,
            message,
            is_read: false
        });

        io.to(`vendor:${token}`).emit('account_deletion_requested', {
            title,
            message,
            request_token: deleteReq.token
        });

        /* ===================================================== */

        return res.status(200).json(
            responseData(
                'Account deletion request submitted successfully. Admin will review it.',
                {},
                req,
                true
            )
        );

    } catch (error) {
        console.error('Raise delete request error:', error);
        return res.status(500).json(
            responseData('Error occurred while submitting request', {}, req, false)
        );
    }
});

// dummy apis for now
router.post('/verify-profile-image', [vendorMiddleware, uploadImages], async (req, res) => {
    try {
        const {
            token,
            verification_status,
            aadhaar_front_image,
            aadhaar_back_image,
            dl_front_image,
            dl_back_image,
            vehicle_image
        } = req.user;

        const io = getIO();

        if (verification_status === 'VERIFIED') {
            return res.status(400).json(
                responseData('Profile already verified', {}, req, false)
            );
        }

        if (!req.files?.profile_image.length) {
            return res.status(400).json(
                responseData('Profile image is required', {}, req, false)
            );
        }

        const profileImage = `/uploads/${req.files.profile_image[0].filename}`;

        const allImagesPresent =
            profileImage &&
            aadhaar_front_image &&
            aadhaar_back_image &&
            dl_front_image &&
            dl_back_image &&
            vehicle_image;

        const newVerificationStatus = allImagesPresent
            ? 'SUBMITTED'
            : 'PARTIAL';

        await Vendor.update(
            {
                profile_image: profileImage,
                verification_status: newVerificationStatus,
                submitted_on: newVerificationStatus === 'SUBMITTED' ? new Date() : null
            },
            { where: { token } }
        );

        io.emit('vendor:request', {
            token,
            status: newVerificationStatus,
            message:
                newVerificationStatus === 'SUBMITTED'
                    ? 'Verification submitted successfully'
                    : 'Verification partially completed'
        });

        return res.status(200).json(
            responseData(
                newVerificationStatus === 'SUBMITTED'
                    ? 'Verification submitted'
                    : 'Verification partially completed',
                { verification_status: newVerificationStatus },
                req,
                true
            )
        );
    } catch (error) {
        console.error('Profile verify error:', error);
        return res.status(500).json(
            responseData('Internal server error', {}, req, false)
        );
    }
});

router.post('/verify-vehicle-image', [vendorMiddleware, uploadImages], async (req, res) => {
    try {
        const {
            token,
            verification_status,
            profile_image,
            aadhaar_front_image,
            aadhaar_back_image,
            dl_front_image,
            dl_back_image
        } = req.user;

        const io = getIO();

        if (verification_status === 'VERIFIED') {
            return res.status(400).json(
                responseData('Profile already verified', {}, req, false)
            );
        }

        if (!req.files?.vehicle_image?.length) {
            return res.status(400).json(
                responseData('Vehicle image is required', {}, req, false)
            );
        }

        const vehicleImage = `/uploads/${req.files.vehicle_image[0].filename}`;

        const requiredImages = [
            profile_image,
            aadhaar_front_image,
            aadhaar_back_image,
            dl_front_image,
            dl_back_image,
            vehicleImage
        ];

        const allImagesPresent = requiredImages.every(Boolean);

        const newVerificationStatus = allImagesPresent
            ? 'SUBMITTED'
            : 'PARTIAL';

        await Vendor.update(
            {
                vehicle_image: vehicleImage,
                verification_status: newVerificationStatus,
                submitted_on: newVerificationStatus === 'SUBMITTED' ? new Date() : null
            },
            { where: { token } }
        );

        io.emit('vendor:request', {
            token,
            status: newVerificationStatus,
            message:
                newVerificationStatus === 'SUBMITTED'
                    ? 'Verification submitted successfully'
                    : 'Verification partially completed'
        });

        return res.status(200).json(
            responseData(
                newVerificationStatus === 'SUBMITTED'
                    ? 'Vehicle verification submitted'
                    : 'Vehicle image uploaded, verification pending',
                { verification_status: newVerificationStatus },
                req,
                true
            )
        );
    } catch (error) {
        console.error('Vehicle verify error:', error);
        return res.status(500).json(
            responseData('Internal server error', {}, req, false)
        );
    }
});

router.post('/verify-aadhaar-image', [vendorMiddleware, uploadImages], async (req, res) => {
    try {
        const {
            token,
            aadhaar_verified,
            verification_status,
            profile_image,
            dl_front_image,
            dl_back_image,
            vehicle_image
        } = req.user;

        const io = getIO();

        if (aadhaar_verified || verification_status === 'VERIFIED') {
            return res.status(400).json(
                responseData(
                    'Aadhaar already verified or profile already verified',
                    {},
                    req,
                    false
                )
            );
        }

        if (
            !req.files?.aadhaar_front_image?.length ||
            !req.files?.aadhaar_back_image?.length
        ) {
            return res.status(400).json(
                responseData('Both Aadhaar images are required', {}, req, false)
            );
        }

        const frontImage = `/uploads/${req.files.aadhaar_front_image[0].filename}`;
        const backImage = `/uploads/${req.files.aadhaar_back_image[0].filename}`;

        const requiredImages = [
            profile_image,
            frontImage,
            backImage,
            dl_front_image,
            dl_back_image,
            vehicle_image
        ];

        const allImagesPresent = requiredImages.every(Boolean);

        const newVerificationStatus = allImagesPresent
            ? 'SUBMITTED'
            : 'PARTIAL';

        await Vendor.update(
            {
                aadhaar_front_image: frontImage,
                aadhaar_back_image: backImage,
                verification_status: newVerificationStatus,
                submitted_on: newVerificationStatus === 'SUBMITTED' ? new Date() : null
            },
            { where: { token } }
        );

        io.emit('vendor:request', {
            token,
            status: newVerificationStatus,
            message:
                newVerificationStatus === 'SUBMITTED'
                    ? 'Verification submitted successfully'
                    : 'Aadhaar uploaded, verification pending'
        });

        return res.status(200).json(
            responseData(
                newVerificationStatus === 'SUBMITTED'
                    ? 'Aadhaar verification submitted'
                    : 'Aadhaar images uploaded, verification pending',
                { verification_status: newVerificationStatus },
                req,
                true
            )
        );
    } catch (error) {
        console.error('Aadhaar verify error:', error);
        return res.status(500).json(
            responseData('Internal server error', {}, req, false)
        );
    }
});

router.post('/verify-driving-license-image', [vendorMiddleware, uploadImages], async (req, res) => {
    try {

        const { token, verification_status } = req.user;

        const io = getIO();

        // Prevent re-verification if already verified
        if (verification_status === 'VERIFIED') {
            return res.status(400).json(
                responseData(
                    'Driving license already verified',
                    {},
                    req,
                    false
                )
            );
        }

        // Validate uploaded files
        if (
            !req.files?.dl_front_image?.length ||
            !req.files?.dl_back_image?.length
        ) {
            return res.status(400).json(
                responseData(
                    'Both Driving license images are required',
                    {},
                    req,
                    false
                )
            );
        }

        // Get uploaded file paths
        const frontImage = `/uploads/${req.files.dl_front_image[0].filename}`;
        const backImage = `/uploads/${req.files.dl_back_image[0].filename}`;

        // Update Vendor record
        const result = await Vendor.update(
            {
                dl_front_image: frontImage,
                dl_back_image: backImage,
                verification_status: 'SUBMITTED',
                submitted_on: new Date()
            },
            { where: { token } }
        );

        // Check if update happened
        if (!result[0]) {
            return res.status(404).json(
                responseData('Vendor not found', {}, req, false)
            );
        }

        // Emit socket event
        io.emit('vendor:request', {
            token,
            status: 'SUBMITTED',
            message: 'Driving license verification submitted'
        });

        return res.status(200).json(
            responseData(
                'Driving license verification submitted successfully',
                { verification_status: 'SUBMITTED' },
                req,
                true
            )
        );

    } catch (error) {
        console.error('Driving license verify error:', error);
        return res.status(500).json(
            responseData('Internal server error', {}, req, false)
        );
    }
});

/*
router.post('/verify-aadhaar', [vendorMiddleware, vendorValidation.validate('aadhaar-verify')], async (req, res) => {
    try {
        const { aadhaar_number } = req.body
        const token = req?.user?.token
        const aadhaar_verified = req?.user?.aadhaar_verified

        // verify aadhaar here

        if (aadhaar_verified) {
            return res.status(401).json(responseData('Aadhaar already verified', {}, req, false))
        }

        const otp = generateOTP()

        const updatableData = {
            aadhaar_number: aadhaar_number,
            aadhar_otp: otp
        }

        console.log('recent aadhaar otp ->>>>>>> ', otp)

        await Vendor.update(updatableData,
            { where: { token: token } }
        );

        return res
            .status(200)
            .json(responseData("Otp sent successfully", otp, req, true));
    } catch (error) {
        console.log('Aadhar verify error:', error);
        return res
            .status(500)
            .json(responseData("Error occurred", {}, req, false));
    }
})

router.post('/verify-aadhaar-otp', [vendorMiddleware, vendorValidation.validate('aadhaar-otp')], async (req, res) => {
    try {
        const { otp } = req.body
        const token = req?.user?.token
        const aadhaar_number = req?.user?.aadhaar_number
        const VP = req?.user?.verification_percentage
        const io = getIO()

        const aadhaar_otp = req?.user?.aadhar_otp

        const aadhaar_verified = req?.use?.aadhaar_verified
        const verification_status = req?.user?.verification_status

        if (aadhaar_verified || verification_status === 'VERIFIED') {
            return res.status(401).json(responseData('Aadhaar already verified', {}, req, false))
        }

        if (aadhaar_otp === 0) {
            return res.status(401).json(responseData('First enter aadhaar details', {}, req, false))
        }

        if (Number(otp) !== aadhaar_otp) {
            return res
                .status(401)
                .json(responseData("Otp didn't match", {}, req, false));
        }

        if (!verifyByAdmin) {
            const { vp, vp_status } = calculateVerificationPercentage({ aadhaar_number, otp }, VP, verification_status);

            const updateData = {
                aadhaar_verified: true,
                aadhaar_verified_at: new Date(),
                aadhar_otp: 0,
                verification_percentage: vp,
                verification_status: vp_status
            }

            await Vendor.update(updateData,
                { where: { token: token } }
            )

            return res
                .status(200)
                .json(responseData("Aadhaar verified successfully", { verification_percentage: vp, verification_status: vp_status }, req, true));
        }

        const updateData = {
            aadhar_otp: 0,
            verification_status: 'PENDING'
        }

        await Vendor.update(updateData,
            { where: { token: token } }
        )

        io.emit('vendor:request', {
            status: 'PENDING',
            message: 'Your verification is pending'
        })

        return res
            .status(200)
            .json(responseData("Aadhaar verified successfully", {}, req, true));

    } catch (error) {
        console.log('Aadhar otp verify error:', error);
        return res
            .status(500)
            .json(responseData("Error occurred", {}, req, false));
    }
})

router.post('/verify-driving-license', [vendorMiddleware, vendorValidation.validate('dl-verify')], async (req, res) => {
    try {
        const { dl_number, birth_date } = req.body
        const token = req?.user?.token
        const VP = req?.user?.verification_percentage
        const verification_status = req?.user?.verification_status
        const dl_verified = req?.user?.dl_verified

        if (dl_verified || verification_status === 'VERIFIED') {
            return res.status(401).json(responseData('Driving license already verified', {}, req, false))
        }

        const { vp, vp_status } = calculateVerificationPercentage({ dl_number, birth_date }, VP, verification_status);

        const updateData = {
            dl_number,
            dl_verified: true,
            dl_dob: birth_date,
            dl_verified_at: new Date(),
            verification_percentage: vp,
            verification_status: vp_status
        }
        await Vendor.update(updateData,
            { where: { token: token } }
        );

        return res
            .status(201)
            .json(responseData("Driving license verified successfully", {}, req, true));
    } catch (error) {
        console.log('Driving license verify error:', error);
        return res
            .status(500)
            .json(responseData("Error occurred", {}, req, false));
    }
}) */

/* ------------------ booking routes -------------- */

router.get('/get/all-bookings', [vendorMiddleware], async (req, res) => {
    try {
        const {
            page = 1,
            limit = 12,
            accept_type,
            vehicle_type,
            status,
            search
        } = req.query;

        const vendorToken = req.user.token;

        // normalize vehicle_type
        let vehicleTypeArray = [];

        if (vehicle_type !== undefined && vehicle_type !== null && vehicle_type !== '') {
            if (Array.isArray(vehicle_type)) {
                vehicleTypeArray = vehicle_type
                    .flatMap(item => {
                        if (typeof item === 'string') {
                            try {
                                const parsed = JSON.parse(item);
                                return Array.isArray(parsed) ? parsed : item.split(',');
                            } catch {
                                return item.split(',');
                            }
                        }
                        return item;
                    })
                    .map(v => String(v).trim())
                    .filter(Boolean);
            } else if (typeof vehicle_type === 'string') {
                try {
                    const parsed = JSON.parse(vehicle_type);
                    if (Array.isArray(parsed)) {
                        vehicleTypeArray = parsed.map(v => String(v).trim()).filter(Boolean);
                    } else {
                        vehicleTypeArray = [String(parsed).trim()].filter(Boolean);
                    }
                } catch {
                    vehicleTypeArray = vehicle_type
                        .split(',')
                        .map(v => String(v).trim())
                        .filter(Boolean);
                }
            } else {
                vehicleTypeArray = [String(vehicle_type).trim()].filter(Boolean);
            }
        }

        const whereCondition = {
            [Op.not]: [
                {
                    status: 'ACCEPTED',
                    accept_type: 'INSTANT'
                }
            ]
        };

        if (accept_type) {
            whereCondition.accept_type = String(accept_type).toUpperCase();
        }

        if (status) {
            whereCondition.status = String(status).toUpperCase();
        }

        if (vehicleTypeArray.length > 0) {
            whereCondition.vehicle_type = {
                [Op.in]: vehicleTypeArray
            };
        }

        // regex search on booking id, pickup_location, drop_location
        if (search && String(search).trim()) {
            const searchRegex = String(search).trim();

            whereCondition[Op.and] = [
                {
                    [Op.or]: [
                        Sequelize.where(
                            Sequelize.cast(Sequelize.col('booking.id'), 'CHAR'),
                            {
                                [Op.regexp]: searchRegex
                            }
                        ),
                        {
                            pickup_location: {
                                [Op.regexp]: searchRegex
                            }
                        },
                        {
                            drop_location: {
                                [Op.regexp]: searchRegex
                            }
                        }
                    ]
                }
            ];
        }

        const result = await getSequelizePagination({
            page: Number(page) || 1,
            limit: Number(limit) || 12,
            model: Booking,
            where: whereCondition,
            order: [['created_at', 'DESC']],
            subQuery: false,
            distinct: true,
            include: [
                {
                    model: Vendor,
                    as: 'vendor',
                    required: false,
                    attributes: [
                        'id',
                        ['city', 'vendor_city'],
                        ['state', 'vendor_state'],
                        [
                            Sequelize.literal(`
                                CASE 
                                    WHEN booking.accept_type IN ('APPROVAL', 'BID') THEN NULL
                                    ELSE vendor.first_name
                                END
                            `),
                            'first_name'
                        ],
                        [
                            Sequelize.literal(`
                                CASE 
                                    WHEN booking.accept_type IN ('APPROVAL', 'BID') THEN NULL
                                    ELSE vendor.last_name
                                END
                            `),
                            'last_name'
                        ],
                        [
                            Sequelize.literal(`
                                CASE 
                                    WHEN booking.accept_type IN ('APPROVAL', 'BID') THEN NULL
                                    ELSE vendor.contact
                                END
                            `),
                            'contact'
                        ],
                        [
                            Sequelize.literal(`
                                CASE 
                                    WHEN booking.accept_type IN ('APPROVAL', 'BID') THEN NULL
                                    ELSE vendor.verification_status
                                END
                            `),
                            'verification_status'
                        ],
                        [
                            Sequelize.literal(`
                                CASE 
                                    WHEN booking.accept_type IN ('APPROVAL', 'BID') THEN NULL
                                    ELSE CONCAT('${admin_url}', vendor.profile_image)
                                END
                            `),
                            'profile_image'
                        ]
                    ],
                    on: {
                        '$booking.vendor_token$': {
                            [Op.eq]: Sequelize.col('vendor.token')
                        }
                    }
                },
                {
                    model: BookingRating,
                    as: 'ratings',
                    attributes: [],
                    required: false
                }
            ],
            attributes: [
                'id',
                'token',
                'vendor_token',
                'trip_type',
                'vehicle_type',
                'vehicle_name',
                'pickup_datetime',
                'return_datetime',
                'pickup_location',
                'drop_location',
                'city',
                'state',
                'accept_type',
                'booking_amount',
                'commission',
                'total_amount',
                'is_negotiable',
                'visibility',
                'secure_booking',
                'payment_status',
                'extra_requirements',
                'status',
                'flag',
                'created_at',
                'updated_at',
                [
                    Sequelize.fn(
                        'COALESCE',
                        Sequelize.fn('AVG', Sequelize.col('ratings.stars')),
                        5
                    ),
                    'rating_quality'
                ],
                [
                    Sequelize.literal(`
                        CASE 
                            WHEN booking.vendor_token = '${vendorToken}' THEN 1
                            ELSE 0
                        END
                    `),
                    'is_my_booking'
                ]
            ],
            group: [
                Sequelize.col('booking.id'),
                Sequelize.col('vendor.id')
            ]
        });

        return res.status(200).json(
            responseData('Bookings fetched successfully', result, req, true)
        );
    } catch (error) {
        console.error('Getting booking error:', error);
        return res.status(500).json(
            responseData('Error occurred', {}, req, false)
        );
    }
});

router.get('/get-booking/:token', [vendorMiddleware, verifiedOnly, vendorValidation.validate('get-booking')], async (req, res) => {
    try {
        const { token } = req.params;
        const vendor_token = req.user.token

        const booking = await Booking.findOne({
            where: { token },
            subQuery: false,

            attributes: [
                'token',
                'accept_type',
                'status',
                'trip_type',
                'pickup_datetime',
                'return_datetime',
                'vehicle_type',
                'vehicle_name',
                'pickup_location',
                'drop_location',
                'city',
                'state',
                'booking_amount',
                'commission',
                'total_amount',
                'is_negotiable',
                'secure_booking',
                'visibility',
                'extra_requirements',
                'created_at',

                [
                    Sequelize.literal(`(
                SELECT COALESCE(AVG(br.stars), 5)
                FROM tbl_booking_rating AS br
                WHERE br.booking_token = booking.token
            )`),
                    'rating_quality'
                ],

                [
                    Sequelize.literal(`EXISTS (
                SELECT 1
                FROM tbl_booking_requests brq
                WHERE brq.booking_token = booking.token
                AND brq.requested_by_vendor_token = '${vendor_token}'
            )`),
                    'has_already_bid'
                ]
            ],

            include: [
                {
                    model: Vendor,
                    as: 'vendor',
                    required: false,
                    attributes: [
                        'id',
                        'token',
                        'first_name',
                        'last_name',
                        'contact',
                        'verification_status'
                    ],
                    on: {
                        '$booking.vendor_token$': {
                            [Op.eq]: Sequelize.col('vendor.token')
                        }
                    }
                },
                {
                    model: BookingRequest,
                    as: 'booking_requests',
                    required: false,
                    attributes: ['status', 'bid_amount', 'requested_by_vendor_token'],
                    where: {
                        requested_by_vendor_token: vendor_token
                    },
                    on: {
                        booking_token: {
                            [Op.eq]: Sequelize.col('booking.token')
                        }
                    }
                }
            ]
        });

        // console.log(booking)

        if (!booking) {
            return res.status(404).json(
                responseData('Booking not found', {}, req, false)
            );
        }

        // Mark notifications as read
        Notification.update(
            { is_read: true },
            {
                where: {
                    receiver_token: req.user.token,
                    booking_token: token,
                    is_read: false
                }
            }
        ).catch(e =>
            console.error('Notification read update failed:', e)
        );

        return res.status(200).json(
            responseData('Booking fetched successfully', booking, req, true)
        );

    } catch (error) {
        console.error('Get booking error:', error);
        return res.status(500).json(
            responseData('Error occurred', {}, req, false)
        );
    }
});

router.get('/get-booking-with-requests/:token', [vendorMiddleware, verifiedOnly, vendorValidation.validate('get-booking')], async (req, res) => {
    try {
        const { token } = req.params;
        const userToken = req.user.token;

        const Chat = db.chat;

        const booking = await Booking.findOne({
            where: { token },
            subQuery: false,
            attributes: [
                'token',
                'vendor_token',
                'accept_type',
                'status',
                'trip_type',
                'pickup_datetime',
                'return_datetime',
                'vehicle_type',
                'vehicle_name',
                'pickup_location',
                'drop_location',
                'city',
                'state',
                'booking_amount',
                'commission',
                'total_amount',
                'is_negotiable',
                'secure_booking',
                'visibility',
                'extra_requirements',
                'created_at',
                [
                    Sequelize.literal(`(
                SELECT COALESCE(AVG(br.stars), 5)
                FROM tbl_booking_rating br
                WHERE br.booking_token = booking.token
            )`),
                    'rating_quality'
                ]
            ],
            include: [
                {
                    model: Vendor,
                    as: 'vendor',
                    required: false,
                    attributes: [
                        'token',
                        'first_name',
                        'last_name',
                        'contact',
                        'verification_status'
                    ]
                },
                {
                    model: db.bookingRequest,
                    as: 'booking_requests',
                    required: false,
                    attributes: [
                        'token',
                        'booking_token',
                        'status',
                        'requested_by_vendor_token',
                        'responded_at',
                        'created_at'
                    ],
                    include: [
                        {
                            model: Vendor,
                            as: 'requester',
                            required: false,
                            attributes: [
                                'token',
                                'first_name',
                                'last_name',
                                'contact'
                            ]
                        }
                    ]
                },
                {
                    model: db.bookingRejection,
                    as: 'booking_rejections',
                    required: false,
                    attributes: [
                        'token',
                        'booking_token',
                        'reason',
                        'rejected_by_token',
                        'created_at'
                    ],
                    include: [
                        {
                            model: Vendor,
                            as: 'rejecter',
                            required: false,
                            attributes: [
                                'token',
                                'first_name',
                                'last_name',
                                'contact'
                            ]
                        }
                    ]
                }
            ],
            order: [
                [{ model: db.bookingRequest, as: 'booking_requests' }, 'created_at', 'DESC'],
                [{ model: db.bookingRejection, as: 'booking_rejections' }, 'created_at', 'DESC']
            ]
        });

        if (!booking) {
            return res.status(404).json(
                responseData('Booking not found', {}, req, false)
            );
        }

        const acceptedRequest =
            booking.booking_requests?.find(r => r.status === 'ACCEPTED') ||
            null;

        const rejectedRequests =
            booking.booking_requests?.filter(r => r.status === 'REJECTED') ||
            [];

        let enableChat = null;

        // Only check chat if user is NOT booking owner
        if (userToken !== booking.vendor_token) {
            const requesterToken = userToken;

            const chatCount = await Chat.count({
                where: {
                    booking_token: booking.token,
                    sender_token: booking.vendor_token,
                    receiver_token: requesterToken
                }
            });

            enableChat = chatCount > 0;
        }

        const responseDataObj = {
            booking,
            accepted_request: acceptedRequest,
            rejected_requests: rejectedRequests,
            rejections: booking.booking_rejections || []
        };

        if (userToken !== booking.vendor_token) {
            responseDataObj.enable_chat = enableChat;
        }

        return res.status(200).json(
            responseData(
                'Booking fetched successfully',
                responseDataObj,
                req,
                true
            )
        );

    } catch (error) {
        console.error('Get booking with requests error:', error);

        return res.status(500).json(
            responseData('Error occurred', {}, req, false)
        );
    }
});

// router.get('/get/my-accepted-booking/:token', [vendorMiddleware, verifiedOnly, vendorValidation.validate('get-booking')], async (req, res) => {
//     try {
//         const { token } = req.params;

//         const Chat = db.chat;

//         const booking = await Booking.findOne({
//             where: { token },
//             subQuery: false,

//             attributes: [
//                 'token',
//                 'accept_type',
//                 'status',
//                 'trip_type',
//                 'pickup_datetime',
//                 'return_datetime',
//                 'vehicle_type',
//                 'vehicle_name',
//                 'pickup_location',
//                 'drop_location',
//                 'city',
//                 'state',
//                 'booking_amount',
//                 'commission',
//                 'total_amount',
//                 'is_negotiable',
//                 'secure_booking',
//                 'visibility',
//                 'extra_requirements',
//                 'created_at',
//                 'vendor_token',

//                 [
//                     Sequelize.literal(`(
//                             SELECT COALESCE(AVG(br.stars), 5)
//                             FROM tbl_booking_rating br
//                             WHERE br.booking_token = booking.token
//                         )`),
//                     'rating_quality'
//                 ]
//             ],

//             include: [
//                 // Booking Owner
//                 {
//                     model: Vendor,
//                     as: 'vendor',
//                     required: false,
//                     attributes: [
//                         'token',
//                         'first_name',
//                         'last_name',
//                         'contact',
//                         'verification_status'
//                     ],
//                     on: {
//                         '$booking.vendor_token$': {
//                             [Op.eq]: Sequelize.col('vendor.token')
//                         }
//                     }
//                 },

//                 // Booking Requests
//                 {
//                     model: db.bookingRequest,
//                     as: 'booking_requests',
//                     required: false,
//                     attributes: [
//                         'token',
//                         'status',
//                         'requested_by_vendor_token',
//                         'responded_at',
//                         'created_at'
//                     ],
//                     include: [
//                         {
//                             model: Vendor,
//                             as: 'requester',
//                             required: false,
//                             attributes: [
//                                 'token',
//                                 'first_name',
//                                 'last_name',
//                                 'contact',
//                                 'profile_image'
//                             ],
//                             on: {
//                                 '$booking_requests.requested_by_vendor_token$': {
//                                     [Op.eq]: Sequelize.col(
//                                         'booking_requests->requester.token'
//                                     )
//                                 }
//                             }
//                         }
//                     ]
//                 },

//                 // Booking Rejections
//                 {
//                     model: db.bookingRejection,
//                     as: 'booking_rejections',
//                     required: false,
//                     attributes: [
//                         'token',
//                         'reason',
//                         'rejected_by_token',
//                         'created_at'
//                     ],
//                     include: [
//                         {
//                             model: Vendor,
//                             as: 'rejecter',
//                             required: false,
//                             attributes: [
//                                 'token',
//                                 'first_name',
//                                 'last_name',
//                                 'contact',
//                                 'profile_image'
//                             ],
//                             on: {
//                                 '$booking_rejections.rejected_by_token$': {
//                                     [Op.eq]: Sequelize.col(
//                                         'booking_rejections->rejecter.token'
//                                     )
//                                 }
//                             }
//                         }
//                     ]
//                 }
//             ],

//             order: [
//                 [
//                     { model: db.bookingRequest, as: 'booking_requests' },
//                     'created_at',
//                     'DESC'
//                 ],
//                 [
//                     { model: db.bookingRejection, as: 'booking_rejections' },
//                     'created_at',
//                     'DESC'
//                 ]
//             ]
//         });

//         if (!booking) {
//             return res.status(404).json(
//                 responseData('Booking not found', {}, req, false)
//             );
//         }

//         const acceptedRequest =
//             booking.booking_requests?.find(r => r.status === 'ACCEPTED') ||
//             null;

//         const rejectedRequests =
//             booking.booking_requests?.filter(r => r.status === 'REJECTED') ||
//             [];

//         let enableChat = false;

//         if (acceptedRequest) {
//             const acceptedVendorToken =
//                 acceptedRequest.requested_by_vendor_token;

//             const chatCount = await Chat.count({
//                 where: {
//                     booking_token: booking.token,
//                     sender_token: booking.vendor_token,
//                     receiver_token: acceptedVendorToken
//                 }
//             });

//             enableChat = chatCount > 0;
//         }

//         const responseDataObj = {
//             booking,
//             accepted_request: acceptedRequest,
//             rejected_requests: rejectedRequests,
//             rejections: booking.booking_rejections || [],
//             enable_chat: enableChat
//         };

//         return res.status(200).json(
//             responseData(
//                 'Booking fetched successfully',
//                 responseDataObj,
//                 req,
//                 true
//             )
//         );
//     } catch (error) {
//         console.error('Get booking with requests error:', error);

//         return res.status(500).json(
//             responseData('Error occurred', {}, req, false)
//         );
//     }
// });

router.get('/my-bookings', [vendorMiddleware, verifiedOnly], async (req, res) => {
    try {
        const vendorToken = req.user.token;
        const { page = 1, limit = 12, type, search = '' } = req.query;

        const whereClause = {
            vendor_token: vendorToken,
            status: {
                [Op.ne]: 'EXPIRED'
            }
        };

        if (type) {
            const normalizedType = String(type).toUpperCase();

            if (!['APPROVAL', 'INSTANT'].includes(normalizedType)) {
                return res.status(400).json(
                    responseData('Invalid booking type filter', {}, req, false)
                );
            }

            whereClause.accept_type = normalizedType;
        }

        const trimmedSearch = String(search).trim();

        if (trimmedSearch) {
            const orConditions = [
                {
                    pickup_location: {
                        [Op.iLike]: `%${trimmedSearch}%`
                    }
                },
                {
                    drop_location: {
                        [Op.iLike]: `%${trimmedSearch}%`
                    }
                }
            ];

            // booking id exact match
            if (!isNaN(trimmedSearch)) {
                orConditions.unshift({
                    id: Number(trimmedSearch)
                });
            }

            whereClause[Op.or] = orConditions;
        }

        const paginatedResult = await getSequelizePagination({
            model: Booking,
            page,
            limit,
            where: whereClause,
            order: [['updated_at', 'DESC']],
            subQuery: false,
            distinct: true,

            include: [
                {
                    model: Vendor,
                    as: 'vendor',
                    required: true,
                    attributes: [
                        'id',
                        'first_name',
                        'last_name',
                        'contact',
                        'verification_status',
                        [Sequelize.literal(`CONCAT('${admin_url}', vendor.profile_image)`), 'profile_image']
                    ],
                    on: {
                        '$booking.vendor_token$': {
                            [Op.eq]: Sequelize.col('vendor.token')
                        }
                    }
                }
            ],

            attributes: [
                'id',
                'token',
                'status',
                'accept_type',
                'pickup_datetime',
                'pickup_location',
                'return_datetime',
                'drop_location',
                'booking_amount',
                'commission',
                'total_amount',
                'created_at',

                [
                    Sequelize.literal(`(
                        SELECT COALESCE(AVG(br.stars), 5)
                        FROM tbl_booking_rating AS br
                        WHERE br.booking_token = booking.token
                    )`),
                    'rating_quality'
                ]
            ]
        });

        const responseDataObj = {
            bookings: paginatedResult.docs,
            applied_filter: type || 'ALL',
            search: trimmedSearch,
            pagination: {
                page: paginatedResult.page,
                limit: paginatedResult.limit,
                totalPages: paginatedResult.totalPages,
                totalDocs: paginatedResult.totalDocs
            }
        };

        return res.status(200).json(
            responseData('My posted bookings fetched successfully', responseDataObj, req, true)
        );

    } catch (error) {
        console.error('My bookings overview error:', error);
        return res.status(500).json(
            responseData('Error occurred', {}, req, false)
        );
    }
});

router.get("/my/accepted/booking", [vendorMiddleware, verifiedOnly], async (req, res) => {
    try {
        const vendorToken = req.user.token;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const search = String(req.query.search || "").trim();

        let searchCondition = "";
        const replacements = [vendorToken];
        const countReplacements = [vendorToken];

        if (search) {
            searchCondition = `
                AND (
                    CAST(b.id AS TEXT) ILIKE ?
                    OR b.pickup_location ILIKE ?
                    OR b.drop_location ILIKE ?
                )
            `;
            const searchValue = `%${search}%`;
            replacements.push(searchValue, searchValue, searchValue);
            countReplacements.push(searchValue, searchValue, searchValue);
        }

        replacements.push(limit, offset);

        const bookings = await db.sequelize.query(`
            SELECT 
                -- Booking details
                b.id AS booking_id,
                b.token AS booking_token,
                b.trip_type,
                b.vehicle_type,
                b.vehicle_name,
                b.pickup_datetime,
                b.return_datetime,
                b.pickup_location,
                b.drop_location,
                b.city,
                b.state,
                b.booking_amount,
                b.commission,
                b.total_amount,
                b.accept_type,
                b.status AS booking_status,
                b.created_at AS booking_created_at,
                b.vendor_token AS owner_vendor_token,
                
                -- Request details
                br.id AS request_id,
                br.token AS request_token,
                br.status AS request_status,
                br.responded_at,
                br.remarks,
                br.bid_amount,
                br.bid_currency,
                br.created_at AS request_created_at
                
            FROM tbl_booking_requests br
            INNER JOIN tbl_booking b ON br.booking_token = b.token
            WHERE br.requested_by_vendor_token = ?
            ${searchCondition}
            ORDER BY 
                CASE br.status
                    WHEN 'PENDING' THEN 1
                    WHEN 'ACCEPTED' THEN 2
                    WHEN 'REJECTED' THEN 3
                    WHEN 'CANCELLED' THEN 4
                    ELSE 5
                END,
                br.created_at DESC
            LIMIT ? OFFSET ?
        `, {
            replacements,
            type: db.sequelize.QueryTypes.SELECT
        });

        const totalResult = await db.sequelize.query(`
            SELECT COUNT(*) as total
            FROM tbl_booking_requests br
            INNER JOIN tbl_booking b ON br.booking_token = b.token
            WHERE br.requested_by_vendor_token = ?
            ${searchCondition}
        `, {
            replacements: countReplacements,
            type: db.sequelize.QueryTypes.SELECT
        });

        const formattedBookings = bookings.map(row => ({
            id: row.booking_id,
            token: row.booking_token,
            trip_type: row.trip_type,
            vehicle_type: row.vehicle_type,
            vehicle_name: row.vehicle_name,
            pickup_datetime: row.pickup_datetime,
            return_datetime: row.return_datetime,
            pickup_location: row.pickup_location,
            drop_location: row.drop_location,
            city: row.city,
            state: row.state,
            booking_amount: parseFloat(row.booking_amount),
            commission: parseFloat(row.commission),
            total_amount: parseFloat(row.total_amount),
            accept_type: row.accept_type,
            booking_status: row.booking_status,
            created_at: row.booking_created_at,
            owner_vendor_token: row.owner_vendor_token,

            request: {
                id: row.request_id,
                token: row.request_token,
                status: row.request_status,
                responded_at: row.responded_at,
                remarks: row.remarks,
                bid_amount: row.bid_amount ? parseFloat(row.bid_amount) : null,
                bid_currency: row.bid_currency,
                created_at: row.request_created_at
            }
        }));

        return res.status(200).json(responseData(
            "Bookings fetched successfully",
            {
                total: Number(totalResult[0]?.total || 0),
                page,
                limit,
                search,
                bookings: formattedBookings
            },
            req,
            true
        ));

    } catch (error) {
        console.error("My bookings error:", error);
        return res.status(500).json(responseData(
            "Server error",
            { error: error.message },
            req,
            false
        ));
    }
});

router.get('/my-booking/:token/requests-overview', [vendorMiddleware, verifiedOnly], async (req, res) => {
    try {
        const vendorToken = req.user.token;
        const bookingToken = req.params.token;

        const booking = await Booking.findOne({
            where: {
                token: bookingToken,
                vendor_token: vendorToken,
            },
            attributes: [
                'token',
                'status',
                'accept_type',
                'pickup_datetime',
                'return_datetime',
                'created_at'
            ],
            include: [
                {
                    model: BookingRequest,
                    as: 'booking_requests',
                    required: false,
                    attributes: [
                        'token',
                        'status',
                        'requested_by_vendor_token',
                        'accept_type',
                        'bid_amount',
                        'bid_currency',
                        'bid_valid_till',
                        'remarks',
                        'created_at',
                    ],
                    include: [
                        {
                            model: Vendor,
                            as: 'requester',
                            required: true,
                            attributes: [
                                'token',
                                'first_name',
                                'last_name',
                                'contact',
                                [
                                    Sequelize.literal(`(
                                        SELECT ROUND(COALESCE(AVG(vr.rating), 5), 1)
                                        FROM tbl_vendor_rating AS vr
                                        WHERE vr.vendor_token = \`booking_requests->requester\`.\`token\`
                                    )`),
                                    'rating'
                                ],
                                [
                                    Sequelize.literal(`CONCAT('${admin_url}', \`booking_requests->requester\`.\`profile_image\`)`),
                                    'profile_image'
                                ]
                            ]
                        },
                    ],
                },
                {
                    model: BookingReject,
                    as: 'booking_rejections',
                    required: false,
                    attributes: [
                        'token',
                        'reason',
                        'rejected_by_token',
                        'created_at',
                    ],
                    include: [
                        {
                            model: Vendor,
                            as: 'rejecter',
                            required: false,
                            attributes: [
                                'token',
                                'first_name',
                                'last_name',
                                'contact',
                            ],
                        },
                    ],
                },
            ],
            order: [
                [
                    { model: BookingRequest, as: 'booking_requests' },
                    'created_at',
                    'DESC',
                ],
                [
                    { model: BookingReject, as: 'booking_rejections' },
                    'created_at',
                    'DESC',
                ],
            ],
        });

        if (!booking) {
            return res.status(404).json(
                responseData(
                    'Booking not found or access denied',
                    {},
                    req,
                    false
                )
            );
        }

        const acceptedRequest =
            booking.booking_requests?.find((r) => r.status === 'ACCEPTED') || null;

        const formattedRequests =
            booking.booking_requests?.map((reqItem) => {
                const plain = reqItem.get({ plain: true });

                return {
                    token: plain.token,
                    status: plain.status,
                    accept_type: plain.accept_type,
                    requested_at: plain.created_at,

                    vendor: plain.requester
                        ? {
                            token: plain.requester.token,
                            first_name: plain.requester.first_name,
                            last_name: plain.requester.last_name,
                            contact: plain.requester.contact,
                            rating: Number(plain.requester.rating ?? 5),
                            profile_image: plain.requester.profile_image
                        }
                        : null,

                    bid_details:
                        plain.accept_type === 'BID'
                            ? {
                                amount: plain.bid_amount,
                                currency: plain.bid_currency,
                                valid_till: plain.bid_valid_till,
                                remarks: plain.remarks,
                            }
                            : null,
                };
            }) || [];

        const formattedRejections =
            booking.booking_rejections?.map((rej) => {
                const plain = rej.get ? rej.get({ plain: true }) : rej;

                return {
                    token: plain.token,
                    reason: plain.reason,
                    rejected_at: plain.created_at,
                    vendor: plain.rejecter
                        ? {
                            token: plain.rejecter.token,
                            first_name: plain.rejecter.first_name,
                            last_name: plain.rejecter.last_name,
                            contact: plain.rejecter.contact,
                        }
                        : null,
                };
            }) || [];

        const acceptedPlain = acceptedRequest?.get
            ? acceptedRequest.get({ plain: true })
            : acceptedRequest;

        const responseDataObj = {
            booking: {
                token: booking.token,
                status: booking.status,
                accept_type: booking.accept_type,
                pickup_datetime: booking.pickup_datetime,
                return_datetime: booking.return_datetime,
                created_at: booking.created_at,
            },

            requests: formattedRequests,

            accepted_by: acceptedPlain
                ? {
                    accepted_at: acceptedPlain.created_at,
                    vendor: acceptedPlain.requester
                        ? {
                            token: acceptedPlain.requester.token,
                            first_name: acceptedPlain.requester.first_name,
                            last_name: acceptedPlain.requester.last_name,
                            contact: acceptedPlain.requester.contact,
                            rating: Number(acceptedPlain.requester.rating ?? 5),
                            total_ratings: Number(acceptedPlain.requester.total_ratings ?? 0),
                        }
                        : null,
                }
                : null,

            rejections: formattedRejections,
        };

        return res.status(200).json(
            responseData(
                'Booking request overview fetched successfully',
                responseDataObj,
                req,
                true
            )
        );
    } catch (error) {
        console.error('Booking request overview error:', error);

        return res.status(500).json(
            responseData('Error occurred', {}, req, false)
        );
    }
});

// new
router.get("/advance-payment/history", [vendorMiddleware, verifiedOnly], async (req, res) => {
    try {
        const vendorToken = req.user.token;

        let {
            page = 1,
            limit = 10,
            booking_token = null,
            payment_status = null,
            advance_status = null,
            search = null,
            from = null,
            to = null,
            quick_range = null
        } = req.query;

        page = parseInt(page) || 1;
        limit = parseInt(limit) || 10;

        if (page < 1) page = 1;
        if (limit < 1) limit = 10;

        if ((!from || !to) && quick_range) {
            const range = getDateRangeFromQuickRange(quick_range);
            from = from || range.from;
            to = to || range.to;
        }

        const baseWhere = {
            flag: 0,
            is_active: true,
            [db.Sequelize.Op.or]: [
                { owner_vendor_token: vendorToken },
                { bidder_vendor_token: vendorToken }
            ]
        };

        if (booking_token) {
            baseWhere.booking_token = booking_token;
        }

        if (payment_status) {
            baseWhere.payment_status = payment_status;
        }

        if (advance_status) {
            baseWhere.status = advance_status;
        }

        if (from || to) {
            baseWhere.created_at = {};
            if (from) {
                baseWhere.created_at[db.Sequelize.Op.gte] = new Date(`${from} 00:00:00`);
            }
            if (to) {
                baseWhere.created_at[db.Sequelize.Op.lte] = new Date(`${to} 23:59:59`);
            }
        }

        const allAdvanceRows = await BookingAdvanceRequest.findAll({
            where: baseWhere,
            order: [["created_at", "DESC"]],
            raw: true
        });

        if (!allAdvanceRows.length) {
            return res.status(200).json(
                responseData(
                    "Advance payment history fetched successfully",
                    {
                        summary: {
                            overall: {
                                total_advance_requests: 0,
                                total_requested_amount: 0,
                                total_paid_to_platform: 0,
                                total_refunded_amount: 0,
                                net_amount_with_platform: 0,
                                total_payable_to_owner: 0,
                                total_paid_to_owner: 0,
                                total_pending_to_owner: 0
                            },
                            today: {
                                total_advance_requests: 0,
                                total_paid_to_platform: 0,
                                total_refunded_amount: 0,
                                net_amount_with_platform: 0
                            },
                            current_week: {
                                total_advance_requests: 0,
                                total_paid_to_platform: 0,
                                total_refunded_amount: 0,
                                net_amount_with_platform: 0
                            },
                            current_month: {
                                total_advance_requests: 0,
                                total_paid_to_platform: 0,
                                total_refunded_amount: 0,
                                net_amount_with_platform: 0
                            }
                        },
                        analytics: {
                            daily_ledger: [],
                            weekly_ledger: [],
                            monthly_ledger: []
                        },
                        pagination: {
                            current_page: page,
                            per_page: limit,
                            total_count: 0,
                            total_pages: 0,
                            has_next_page: false,
                            has_prev_page: false
                        },
                        filters: {
                            booking_token,
                            payment_status,
                            advance_status,
                            search,
                            from,
                            to,
                            quick_range
                        },
                        history: []
                    },
                    req,
                    true
                )
            );
        }

        const bookingTokens = [...new Set(allAdvanceRows.map(item => item.booking_token).filter(Boolean))];
        const bookingRequestTokens = [...new Set(allAdvanceRows.map(item => item.booking_request_token).filter(Boolean))];
        const paymentTokens = [...new Set(allAdvanceRows.map(item => item.payment_token).filter(Boolean))];
        const ownerTokens = [...new Set(allAdvanceRows.map(item => item.owner_vendor_token).filter(Boolean))];
        const bidderTokens = [...new Set(allAdvanceRows.map(item => item.bidder_vendor_token).filter(Boolean))];
        const advanceTokens = [...new Set(allAdvanceRows.map(item => item.token).filter(Boolean))];

        const [
            bookings,
            bookingRequests,
            vendors,
            payments,
            refunds,
            payouts,
            histories
        ] = await Promise.all([
            Booking.findAll({
                where: {
                    token: bookingTokens,
                    flag: 0
                },
                raw: true
            }),

            BookingRequest.findAll({
                where: {
                    token: bookingRequestTokens,
                    flag: 0
                },
                raw: true
            }),

            Vendor.findAll({
                where: {
                    token: [...new Set([...ownerTokens, ...bidderTokens])],
                    flag: 0
                },
                attributes: ["token", "first_name", "last_name", "contact"],
                raw: true
            }),

            paymentTokens.length
                ? BookingPayment.findAll({
                    where: {
                        token: paymentTokens,
                        flag: 0
                    },
                    raw: true
                })
                : [],

            paymentTokens.length
                ? BookingRefund.findAll({
                    where: {
                        payment_token: paymentTokens,
                        flag: 0
                    },
                    order: [["created_at", "ASC"]],
                    raw: true
                })
                : [],

            paymentTokens.length
                ? VendorPayout.findAll({
                    where: {
                        payment_token: paymentTokens
                    },
                    order: [["created_at", "DESC"]],
                    raw: true
                })
                : [],

            BookingAdvanceRequestHistory.findAll({
                where: {
                    advance_request_token: advanceTokens,
                    flag: 0
                },
                order: [["created_at", "ASC"]],
                raw: true
            })
        ]);

        const bookingMap = new Map(bookings.map(item => [item.token, item]));
        const bookingRequestMap = new Map(bookingRequests.map(item => [item.token, item]));
        const vendorMap = new Map(
            vendors.map(item => [
                item.token,
                {
                    token: item.token,
                    name: `${item.first_name || ""} ${item.last_name || ""}`.trim(),
                    contact: item.contact || null
                }
            ])
        );
        const paymentMap = new Map(payments.map(item => [item.token, item]));

        const refundMap = new Map();
        for (const refund of refunds) {
            const key = refund.payment_token;
            if (!refundMap.has(key)) refundMap.set(key, []);
            refundMap.get(key).push(refund);
        }

        const payoutMap = new Map();
        for (const payout of payouts) {
            const key = payout.payment_token;
            if (!payoutMap.has(key)) payoutMap.set(key, []);
            payoutMap.get(key).push(payout);
        }

        const historyMap = new Map();
        for (const history of histories) {
            const key = history.advance_request_token;
            if (!historyMap.has(key)) historyMap.set(key, []);
            historyMap.get(key).push(history);
        }

        const mappedHistory = allAdvanceRows
            .filter((advance) => {
                if (!search) return true;

                const booking = bookingMap.get(advance.booking_token);
                const bookingRequest = bookingRequestMap.get(advance.booking_request_token);
                const owner = vendorMap.get(advance.owner_vendor_token);
                const bidder = vendorMap.get(advance.bidder_vendor_token);

                const searchText = [
                    advance.token,
                    advance.booking_token,
                    advance.booking_request_token,
                    advance.status,
                    advance.payment_status,
                    booking?.vehicle_type,
                    booking?.vehicle_name,
                    booking?.pickup_location,
                    booking?.drop_location,
                    booking?.city,
                    booking?.state,
                    owner?.name,
                    bidder?.name,
                    bookingRequest?.remarks
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();

                return searchText.includes(String(search).toLowerCase());
            })
            .map((advance) => {
                const booking = bookingMap.get(advance.booking_token) || null;
                const bookingRequest = bookingRequestMap.get(advance.booking_request_token) || null;
                const owner = vendorMap.get(advance.owner_vendor_token) || null;
                const bidder = vendorMap.get(advance.bidder_vendor_token) || null;
                const payment = advance.payment_token ? paymentMap.get(advance.payment_token) || null : null;
                const paymentRefunds = payment?.token ? refundMap.get(payment.token) || [] : [];
                const paymentPayouts = payment?.token ? payoutMap.get(payment.token) || [] : [];
                const advanceHistory = historyMap.get(advance.token) || [];

                const requestedAmount = Number(advance.requested_advance_amount || 0);
                const respondedAmount = Number(advance.responded_advance_amount || 0);
                const finalAmount = Number(
                    advance.final_advance_amount ||
                    advance.responded_advance_amount ||
                    advance.requested_advance_amount ||
                    0
                );

                const paidToPlatform =
                    payment && payment.payment_status === "PAID"
                        ? Number(payment.amount || 0)
                        : 0;

                const refundedAmount = paymentRefunds.reduce(
                    (sum, item) => sum + Number(item.refund_amount || 0),
                    0
                );

                const netWithPlatform = Math.max(paidToPlatform - refundedAmount, 0);

                const latestPayout = paymentPayouts.length ? paymentPayouts[0] : null;

                const payableToOwner = latestPayout
                    ? Number(latestPayout.amount || 0)
                    : netWithPlatform;

                const paidToOwner =
                    latestPayout &&
                        ["PAID", "SUCCESS", "COMPLETED"].includes(latestPayout.status)
                        ? Number(latestPayout.amount || 0)
                        : 0;

                const pendingToOwner = Math.max(payableToOwner - paidToOwner, 0);

                const timeline = [
                    ...advanceHistory.map((item) => ({
                        timeline_type: "ADVANCE_HISTORY",
                        action: item.action,
                        actor_role: item.actor_role,
                        actor_token: item.actor_token,
                        amount: Number(item.amount || 0),
                        previous_amount: Number(item.previous_amount || 0),
                        message: item.message || null,
                        meta: item.meta || null,
                        created_at: item.created_at
                    })),

                    ...(payment
                        ? [
                            {
                                timeline_type: "PAYMENT_EVENT",
                                action: "PAYMENT_RECORD_CREATED",
                                actor_role: "SYSTEM",
                                actor_token: payment.payer_token || null,
                                amount: Number(payment.amount || 0),
                                previous_amount: 0,
                                message: "Platform payment record created",
                                meta: {
                                    payment_token: payment.token,
                                    razorpay_order_id: payment.razorpay_order_id,
                                    payment_status: payment.payment_status,
                                    order_status: payment.order_status
                                },
                                created_at: payment.created_at
                            },
                            ...(payment.paid_at
                                ? [
                                    {
                                        timeline_type: "PAYMENT_EVENT",
                                        action: "PAYMENT_COMPLETED",
                                        actor_role: "BIDDER",
                                        actor_token: payment.payer_token || null,
                                        amount: Number(payment.amount || 0),
                                        previous_amount: 0,
                                        message: "Bidder paid advance amount to platform",
                                        meta: {
                                            payment_token: payment.token,
                                            razorpay_order_id: payment.razorpay_order_id,
                                            razorpay_payment_id: payment.razorpay_payment_id
                                        },
                                        created_at: payment.paid_at
                                    }
                                ]
                                : [])
                        ]
                        : []),

                    ...paymentRefunds.map((refund) => ({
                        timeline_type: "REFUND_EVENT",
                        action:
                            refund.refund_status === "PROCESSED"
                                ? "REFUND_PROCESSED"
                                : refund.refund_status === "FAILED"
                                    ? "REFUND_FAILED"
                                    : "REFUND_PENDING",
                        actor_role: "SYSTEM",
                        actor_token: refund.refunded_by_token || null,
                        amount: Number(refund.refund_amount || 0),
                        previous_amount: 0,
                        message: refund.reason || "Refund event recorded",
                        meta: {
                            refund_token: refund.token,
                            payment_token: refund.payment_token,
                            razorpay_refund_id: refund.razorpay_refund_id,
                            refund_status: refund.refund_status
                        },
                        created_at: refund.updated_at || refund.created_at
                    })),

                    ...(latestPayout
                        ? [
                            {
                                timeline_type: "PAYOUT_EVENT",
                                action:
                                    ["PAID", "SUCCESS", "COMPLETED"].includes(latestPayout.status)
                                        ? "OWNER_PAID_BY_PLATFORM"
                                        : "OWNER_PAYOUT_PENDING",
                                actor_role: "SYSTEM",
                                actor_token: latestPayout.vendor_token || null,
                                amount: Number(latestPayout.amount || 0),
                                previous_amount: 0,
                                message:
                                    ["PAID", "SUCCESS", "COMPLETED"].includes(latestPayout.status)
                                        ? "Platform paid owner/vendor"
                                        : "Platform payout pending for owner/vendor",
                                meta: {
                                    payout_token: latestPayout.token,
                                    status: latestPayout.status
                                },
                                created_at: latestPayout.paid_at || latestPayout.created_at
                            }
                        ]
                        : [])
                ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

                const ledger = [
                    ...(payment
                        ? [
                            {
                                ledger_type: "PAYMENT",
                                direction: "DEBIT",
                                display_status:
                                    payment.order_status === "PAID"
                                        ? "PAID"
                                        : payment.order_status === "FAILED"
                                            ? "FAILED"
                                            : "PENDING",
                                transaction_token: payment.token,
                                gateway_transaction_id: payment.razorpay_payment_id || null,
                                razorpay_order_id: payment.razorpay_order_id || null,
                                amount: Number(payment.amount || 0),
                                currency: payment.currency || "INR",
                                payment_status: payment.payment_status || payment.order_status || null,
                                refund_status: payment.refund_status || null,
                                paid_at: payment.paid_at || null,
                                refunded_at: null,
                                created_at: payment.created_at,
                                source: "BOOKING_PAYMENT"
                            }
                        ]
                        : []),

                    ...paymentRefunds.map((refund) => ({
                        ledger_type: "REFUND",
                        direction: "CREDIT",
                        display_status:
                            refund.refund_status === "PROCESSED"
                                ? "REFUNDED"
                                : refund.refund_status === "FAILED"
                                    ? "REFUND_FAILED"
                                    : "REFUND_PENDING",
                        transaction_token: refund.token,
                        gateway_transaction_id: refund.razorpay_refund_id || null,
                        razorpay_order_id: null,
                        amount: Number(refund.refund_amount || 0),
                        currency: refund.currency || "INR",
                        payment_status: null,
                        refund_status: refund.refund_status || null,
                        paid_at: null,
                        refunded_at: refund.updated_at || null,
                        created_at: refund.created_at,
                        source: "BOOKING_REFUND"
                    })),

                    ...(latestPayout
                        ? [
                            {
                                ledger_type: "PAYOUT",
                                direction: "CREDIT",
                                display_status: latestPayout.status || "PENDING",
                                transaction_token: latestPayout.token,
                                gateway_transaction_id: latestPayout.gateway_transaction_id || null,
                                razorpay_order_id: null,
                                amount: Number(latestPayout.amount || 0),
                                currency: latestPayout.currency || "INR",
                                payment_status: null,
                                refund_status: null,
                                paid_at: latestPayout.paid_at || null,
                                refunded_at: null,
                                created_at: latestPayout.created_at,
                                source: "VENDOR_PAYOUT"
                            }
                        ]
                        : [])
                ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

                return {
                    advance_request: {
                        token: advance.token,
                        booking_token: advance.booking_token,
                        booking_request_token: advance.booking_request_token,
                        requested_advance_amount: requestedAmount,
                        responded_advance_amount: respondedAmount,
                        final_advance_amount: finalAmount,
                        currency: advance.currency || "INR",
                        status: advance.status,
                        payment_status: advance.payment_status,
                        requested_at: advance.requested_at,
                        responded_at: advance.responded_at,
                        accepted_at: advance.accepted_at,
                        expires_at: advance.expires_at,
                        created_at: advance.created_at,
                        is_owner: advance.owner_vendor_token === vendorToken,
                        is_bidder: advance.bidder_vendor_token === vendorToken
                    },
                    booking: booking
                        ? {
                            id: booking.id,
                            token: booking.token,
                            status: booking.status,
                            trip_type: booking.trip_type,
                            vehicle_type: booking.vehicle_type,
                            vehicle_name: booking.vehicle_name,
                            pickup_location: booking.pickup_location,
                            drop_location: booking.drop_location,
                            pickup_datetime: booking.pickup_datetime,
                            return_datetime: booking.return_datetime,
                            city: booking.city,
                            state: booking.state,
                            secure_booking: booking.secure_booking,
                            accept_type: booking.accept_type
                        }
                        : null,
                    booking_request: bookingRequest
                        ? {
                            id: bookingRequest.id,
                            token: bookingRequest.token,
                            status: bookingRequest.status,
                            requested_by_vendor_token: bookingRequest.requested_by_vendor_token,
                            owner_vendor_token: bookingRequest.owner_vendor_token,
                            chat_unlocked: bookingRequest.chat_unlocked,
                            bid_amount: Number(bookingRequest.bid_amount || 0),
                            bid_currency: bookingRequest.bid_currency || "INR",
                            bid_valid_till: bookingRequest.bid_valid_till,
                            responded_at: bookingRequest.responded_at,
                            remarks: bookingRequest.remarks
                        }
                        : null,
                    participants: {
                        owner_vendor: owner,
                        bidder_vendor: bidder
                    },
                    advance_summary: {
                        requested_amount: requestedAmount,
                        responded_amount: respondedAmount,
                        final_amount: finalAmount,
                        currency: advance.currency || "INR",
                        negotiation_status: advance.status,
                        payment_status: advance.payment_status
                    },
                    payment_summary: {
                        payment_token: payment?.token || null,
                        payment_for: payment?.payment_for || "BOOKING_ADVANCE",
                        payer_token: payment?.payer_token || null,
                        payee_vendor_token: payment?.payee_vendor_token || null,
                        razorpay_order_id: payment?.razorpay_order_id || null,
                        razorpay_payment_id: payment?.razorpay_payment_id || null,
                        amount_paid_to_platform: paidToPlatform,
                        currency: payment?.currency || advance.currency || "INR",
                        payment_status: payment?.payment_status || "UNPAID",
                        order_status: payment?.order_status || null,
                        paid_at: payment?.paid_at || null
                    },
                    refund_summary: {
                        total_refunds: paymentRefunds.length,
                        total_refunded_amount: refundedAmount,
                        refunds: paymentRefunds.map((refund) => ({
                            token: refund.token,
                            refund_amount: Number(refund.refund_amount || 0),
                            currency: refund.currency || "INR",
                            refund_status: refund.refund_status,
                            reason: refund.reason || null,
                            razorpay_refund_id: refund.razorpay_refund_id || null,
                            refunded_by_token: refund.refunded_by_token || null,
                            created_at: refund.created_at,
                            updated_at: refund.updated_at
                        }))
                    },
                    platform_summary: {
                        received_from_bidder: paidToPlatform,
                        refunded_to_bidder: refundedAmount,
                        net_amount_with_platform: netWithPlatform,
                        payable_to_owner: payableToOwner,
                        already_paid_to_owner: paidToOwner,
                        pending_to_owner: pendingToOwner
                    },
                    payout_summary: latestPayout
                        ? {
                            payout_token: latestPayout.token || null,
                            vendor_token: latestPayout.vendor_token || null,
                            amount: Number(latestPayout.amount || 0),
                            status: latestPayout.status || null,
                            paid_at: latestPayout.paid_at || null,
                            created_at: latestPayout.created_at || null
                        }
                        : null,
                    timeline,
                    ledger
                };
            });

        const totalCount = mappedHistory.length;
        const totalPages = Math.ceil(totalCount / limit) || 1;
        const offset = (page - 1) * limit;
        const paginatedHistory = mappedHistory.slice(offset, offset + limit);

        const overallSummary = mappedHistory.reduce((acc, item) => {
            acc.total_advance_requests += 1;
            acc.total_requested_amount += Number(item.advance_summary.requested_amount || 0);
            acc.total_paid_to_platform += Number(item.payment_summary.amount_paid_to_platform || 0);
            acc.total_refunded_amount += Number(item.refund_summary.total_refunded_amount || 0);
            acc.net_amount_with_platform += Number(item.platform_summary.net_amount_with_platform || 0);
            acc.total_payable_to_owner += Number(item.platform_summary.payable_to_owner || 0);
            acc.total_paid_to_owner += Number(item.platform_summary.already_paid_to_owner || 0);
            acc.total_pending_to_owner += Number(item.platform_summary.pending_to_owner || 0);
            return acc;
        }, {
            total_advance_requests: 0,
            total_requested_amount: 0,
            total_paid_to_platform: 0,
            total_refunded_amount: 0,
            net_amount_with_platform: 0,
            total_payable_to_owner: 0,
            total_paid_to_owner: 0,
            total_pending_to_owner: 0
        });

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfWeek = new Date(startOfToday);
        const weekDay = startOfWeek.getDay();
        const diffToMonday = weekDay === 0 ? 6 : weekDay - 1;
        startOfWeek.setDate(startOfWeek.getDate() - diffToMonday);

        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const buildRangeSummary = (rows) => rows.reduce((acc, item) => {
            acc.total_advance_requests += 1;
            acc.total_paid_to_platform += Number(item.payment_summary.amount_paid_to_platform || 0);
            acc.total_refunded_amount += Number(item.refund_summary.total_refunded_amount || 0);
            acc.net_amount_with_platform += Number(item.platform_summary.net_amount_with_platform || 0);
            return acc;
        }, {
            total_advance_requests: 0,
            total_paid_to_platform: 0,
            total_refunded_amount: 0,
            net_amount_with_platform: 0
        });

        const todayRows = mappedHistory.filter(item => {
            const dt = new Date(item.advance_request.created_at);
            return dt >= startOfToday;
        });

        const currentWeekRows = mappedHistory.filter(item => {
            const dt = new Date(item.advance_request.created_at);
            return dt >= startOfWeek;
        });

        const currentMonthRows = mappedHistory.filter(item => {
            const dt = new Date(item.advance_request.created_at);
            return dt >= startOfMonth;
        });

        const dailyMap = new Map();
        const weeklyMap = new Map();
        const monthlyMap = new Map();

        for (const item of mappedHistory) {
            const createdAt = new Date(item.advance_request.created_at);
            const paid = Number(item.payment_summary.amount_paid_to_platform || 0);
            const refunded = Number(item.refund_summary.total_refunded_amount || 0);
            const net = Number(item.platform_summary.net_amount_with_platform || 0);

            const dayKey = createdAt.toISOString().slice(0, 10);
            if (!dailyMap.has(dayKey)) {
                dailyMap.set(dayKey, {
                    date: dayKey,
                    label: createdAt.toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric"
                    }),
                    total_entries: 0,
                    total_paid_amount: 0,
                    total_refund_amount: 0,
                    net_amount: 0
                });
            }
            const dayEntry = dailyMap.get(dayKey);
            dayEntry.total_entries += 1;
            dayEntry.total_paid_amount += paid;
            dayEntry.total_refund_amount += refunded;
            dayEntry.net_amount += net;

            const tempWeekDate = new Date(createdAt);
            const tempDay = tempWeekDate.getDay();
            const tempDiff = tempDay === 0 ? 6 : tempDay - 1;
            tempWeekDate.setDate(tempWeekDate.getDate() - tempDiff);
            const weekStart = new Date(tempWeekDate);
            const weekEnd = new Date(tempWeekDate);
            weekEnd.setDate(weekEnd.getDate() + 6);

            const weekNumber = Math.ceil((((createdAt - new Date(createdAt.getFullYear(), 0, 1)) / 86400000) + new Date(createdAt.getFullYear(), 0, 1).getDay() + 1) / 7);
            const weekKey = `${createdAt.getFullYear()}-${weekNumber}`;

            if (!weeklyMap.has(weekKey)) {
                weeklyMap.set(weekKey, {
                    year: createdAt.getFullYear(),
                    week_number: weekNumber,
                    week_start_date: weekStart.toISOString().slice(0, 10),
                    week_end_date: weekEnd.toISOString().slice(0, 10),
                    total_entries: 0,
                    total_paid_amount: 0,
                    total_refund_amount: 0,
                    net_amount: 0
                });
            }
            const weekEntry = weeklyMap.get(weekKey);
            weekEntry.total_entries += 1;
            weekEntry.total_paid_amount += paid;
            weekEntry.total_refund_amount += refunded;
            weekEntry.net_amount += net;

            const monthKey = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, "0")}`;
            if (!monthlyMap.has(monthKey)) {
                monthlyMap.set(monthKey, {
                    month_key: monthKey,
                    month_label: createdAt.toLocaleDateString("en-US", {
                        month: "short",
                        year: "numeric"
                    }),
                    total_entries: 0,
                    total_paid_amount: 0,
                    total_refund_amount: 0,
                    net_amount: 0
                });
            }
            const monthEntry = monthlyMap.get(monthKey);
            monthEntry.total_entries += 1;
            monthEntry.total_paid_amount += paid;
            monthEntry.total_refund_amount += refunded;
            monthEntry.net_amount += net;
        }

        const dailyLedger = Array.from(dailyMap.values())
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 15);

        const weeklyLedger = Array.from(weeklyMap.values())
            .sort((a, b) => {
                if (b.year !== a.year) return b.year - a.year;
                return b.week_number - a.week_number;
            })
            .slice(0, 12);

        const monthlyLedger = Array.from(monthlyMap.values())
            .sort((a, b) => b.month_key.localeCompare(a.month_key))
            .slice(0, 12);

        return res.status(200).json(
            responseData(
                "Advance payment history fetched successfully",
                {
                    summary: {
                        overall: overallSummary,
                        today: buildRangeSummary(todayRows),
                        current_week: buildRangeSummary(currentWeekRows),
                        current_month: buildRangeSummary(currentMonthRows)
                    },
                    analytics: {
                        daily_ledger: dailyLedger,
                        weekly_ledger: weeklyLedger,
                        monthly_ledger: monthlyLedger
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
                        booking_token,
                        payment_status,
                        advance_status,
                        search,
                        from,
                        to,
                        quick_range
                    },
                    history: paginatedHistory
                },
                req,
                true
            )
        );
    } catch (error) {
        console.error("advance-payment/history error:", error);
        return res.status(500).json(
            responseData(error.message || "Something went wrong", {}, req, false)
        );
    }
});

router.get("/advance-payment/history/:advance_request_token/details", [vendorMiddleware, verifiedOnly], async (req, res) => {
    try {
        const vendorToken = req.user.token;
        const { advance_request_token } = req.params;

        if (!advance_request_token) {
            return res.status(400).json(
                responseData("advance_request_token is required", {}, req, false)
            );
        }

        const advance = await BookingAdvanceRequest.findOne({
            where: {
                token: advance_request_token,
                flag: 0,
                is_active: true,
                [db.Sequelize.Op.or]: [
                    { owner_vendor_token: vendorToken },
                    { bidder_vendor_token: vendorToken }
                ]
            },
            raw: true
        });

        if (!advance) {
            return res.status(404).json(
                responseData("Advance request not found", {}, req, false)
            );
        }

        const [
            booking,
            bookingRequest,
            ownerVendor,
            bidderVendor,
            payment,
            refunds,
            payouts,
            histories
        ] = await Promise.all([
            advance.booking_token
                ? Booking.findOne({
                    where: { token: advance.booking_token, flag: 0 },
                    raw: true
                })
                : null,

            advance.booking_request_token
                ? BookingRequest.findOne({
                    where: { token: advance.booking_request_token, flag: 0 },
                    raw: true
                })
                : null,

            advance.owner_vendor_token
                ? Vendor.findOne({
                    where: { token: advance.owner_vendor_token, flag: 0 },
                    attributes: ["token", "first_name", "last_name", "contact", "email"],
                    raw: true
                })
                : null,

            advance.bidder_vendor_token
                ? Vendor.findOne({
                    where: { token: advance.bidder_vendor_token, flag: 0 },
                    attributes: ["token", "first_name", "last_name", "contact", "email"],
                    raw: true
                })
                : null,

            advance.payment_token
                ? BookingPayment.findOne({
                    where: { token: advance.payment_token, flag: 0 },
                    raw: true
                })
                : null,

            advance.payment_token
                ? BookingRefund.findAll({
                    where: {
                        payment_token: advance.payment_token,
                        flag: 0
                    },
                    order: [["created_at", "ASC"]],
                    raw: true
                })
                : [],

            advance.payment_token
                ? VendorPayout.findAll({
                    where: {
                        payment_token: advance.payment_token
                    },
                    order: [["created_at", "DESC"]],
                    raw: true
                })
                : [],

            BookingAdvanceRequestHistory.findAll({
                where: {
                    advance_request_token: advance.token,
                    flag: 0
                },
                order: [["created_at", "ASC"]],
                raw: true
            })
        ]);

        const requestedAmount = Number(advance.requested_advance_amount || 0);
        const respondedAmount = Number(advance.responded_advance_amount || 0);
        const finalAmount = Number(
            advance.final_advance_amount ||
            advance.responded_advance_amount ||
            advance.requested_advance_amount ||
            0
        );

        const paidToPlatform =
            payment && payment.payment_status === "PAID"
                ? Number(payment.amount || 0)
                : 0;

        const totalRefundedAmount = (refunds || []).reduce(
            (sum, item) => sum + Number(item.refund_amount || 0),
            0
        );

        const netWithPlatform = Math.max(paidToPlatform - totalRefundedAmount, 0);

        const latestPayout = payouts?.length ? payouts[0] : null;

        const payableToOwner = latestPayout
            ? Number(latestPayout.amount || 0)
            : netWithPlatform;

        const paidToOwner =
            latestPayout &&
                ["PAID", "SUCCESS", "COMPLETED"].includes(latestPayout.status)
                ? Number(latestPayout.amount || 0)
                : 0;

        const pendingToOwner = Math.max(payableToOwner - paidToOwner, 0);

        const timeline = [
            ...(histories || []).map((item) => ({
                timeline_type: "ADVANCE_HISTORY",
                action: item.action,
                actor_role: item.actor_role,
                actor_token: item.actor_token,
                amount: Number(item.amount || 0),
                previous_amount: Number(item.previous_amount || 0),
                message: item.message || null,
                meta: item.meta || null,
                created_at: item.created_at
            })),

            ...(payment
                ? [
                    {
                        timeline_type: "PAYMENT_EVENT",
                        action: "PAYMENT_RECORD_CREATED",
                        actor_role: "SYSTEM",
                        actor_token: payment.payer_token || null,
                        amount: Number(payment.amount || 0),
                        previous_amount: 0,
                        message: "Platform payment record created",
                        meta: {
                            payment_token: payment.token,
                            razorpay_order_id: payment.razorpay_order_id,
                            razorpay_payment_id: payment.razorpay_payment_id,
                            payment_status: payment.payment_status,
                            order_status: payment.order_status
                        },
                        created_at: payment.created_at
                    },
                    ...(payment.paid_at
                        ? [
                            {
                                timeline_type: "PAYMENT_EVENT",
                                action: "PAYMENT_COMPLETED",
                                actor_role: "BIDDER",
                                actor_token: payment.payer_token || null,
                                amount: Number(payment.amount || 0),
                                previous_amount: 0,
                                message: "Bidder paid advance amount to platform",
                                meta: {
                                    payment_token: payment.token,
                                    razorpay_order_id: payment.razorpay_order_id,
                                    razorpay_payment_id: payment.razorpay_payment_id
                                },
                                created_at: payment.paid_at
                            }
                        ]
                        : [])
                ]
                : []),

            ...(refunds || []).map((refund) => ({
                timeline_type: "REFUND_EVENT",
                action:
                    refund.refund_status === "PROCESSED"
                        ? "REFUND_PROCESSED"
                        : refund.refund_status === "FAILED"
                            ? "REFUND_FAILED"
                            : "REFUND_PENDING",
                actor_role: "SYSTEM",
                actor_token: refund.refunded_by_token || null,
                amount: Number(refund.refund_amount || 0),
                previous_amount: 0,
                message: refund.reason || "Refund event recorded",
                meta: {
                    refund_token: refund.token,
                    payment_token: refund.payment_token,
                    razorpay_refund_id: refund.razorpay_refund_id,
                    refund_status: refund.refund_status
                },
                created_at: refund.updated_at || refund.created_at
            })),

            ...(latestPayout
                ? [
                    {
                        timeline_type: "PAYOUT_EVENT",
                        action:
                            ["PAID", "SUCCESS", "COMPLETED"].includes(latestPayout.status)
                                ? "OWNER_PAID_BY_PLATFORM"
                                : "OWNER_PAYOUT_PENDING",
                        actor_role: "SYSTEM",
                        actor_token: latestPayout.vendor_token || null,
                        amount: Number(latestPayout.amount || 0),
                        previous_amount: 0,
                        message:
                            ["PAID", "SUCCESS", "COMPLETED"].includes(latestPayout.status)
                                ? "Platform paid owner/vendor"
                                : "Platform payout pending for owner/vendor",
                        meta: {
                            payout_token: latestPayout.token,
                            status: latestPayout.status
                        },
                        created_at: latestPayout.paid_at || latestPayout.created_at
                    }
                ]
                : [])
        ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        const ledger = [
            ...(payment
                ? [
                    {
                        ledger_type: "PAYMENT",
                        direction: "DEBIT",
                        display_status:
                            payment.order_status === "PAID"
                                ? "PAID"
                                : payment.order_status === "FAILED"
                                    ? "FAILED"
                                    : "PENDING",
                        transaction_token: payment.token,
                        gateway_transaction_id: payment.razorpay_payment_id || null,
                        razorpay_order_id: payment.razorpay_order_id || null,
                        amount: Number(payment.amount || 0),
                        currency: payment.currency || "INR",
                        payment_status: payment.payment_status || payment.order_status || null,
                        refund_status: payment.refund_status || null,
                        paid_at: payment.paid_at || null,
                        refunded_at: null,
                        created_at: payment.created_at,
                        source: "BOOKING_PAYMENT"
                    }
                ]
                : []),

            ...(refunds || []).map((refund) => ({
                ledger_type: "REFUND",
                direction: "CREDIT",
                display_status:
                    refund.refund_status === "PROCESSED"
                        ? "REFUNDED"
                        : refund.refund_status === "FAILED"
                            ? "REFUND_FAILED"
                            : "REFUND_PENDING",
                transaction_token: refund.token,
                gateway_transaction_id: refund.razorpay_refund_id || null,
                razorpay_order_id: null,
                amount: Number(refund.refund_amount || 0),
                currency: refund.currency || "INR",
                payment_status: null,
                refund_status: refund.refund_status || null,
                paid_at: null,
                refunded_at: refund.updated_at || null,
                created_at: refund.created_at,
                source: "BOOKING_REFUND"
            })),

            ...(payouts || []).map((payout) => ({
                ledger_type: "PAYOUT",
                direction: "CREDIT",
                display_status: payout.status || "PENDING",
                transaction_token: payout.token,
                gateway_transaction_id: payout.gateway_transaction_id || null,
                razorpay_order_id: null,
                amount: Number(payout.amount || 0),
                currency: payout.currency || "INR",
                payment_status: null,
                refund_status: null,
                paid_at: payout.paid_at || null,
                refunded_at: null,
                created_at: payout.created_at,
                source: "VENDOR_PAYOUT"
            }))
        ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        return res.status(200).json(
            responseData(
                "Advance payment details fetched successfully",
                {
                    advance_request: advance
                        ? {
                            ...advance,
                            requested_advance_amount: requestedAmount,
                            responded_advance_amount: respondedAmount,
                            final_advance_amount: finalAmount
                        }
                        : null,

                    booking: booking || null,
                    booking_request: bookingRequest || null,

                    participants: {
                        owner_vendor: ownerVendor
                            ? {
                                ...ownerVendor,
                                name: `${ownerVendor.first_name || ""} ${ownerVendor.last_name || ""}`.trim()
                            }
                            : null,
                        bidder_vendor: bidderVendor
                            ? {
                                ...bidderVendor,
                                name: `${bidderVendor.first_name || ""} ${bidderVendor.last_name || ""}`.trim()
                            }
                            : null
                    },

                    payment: payment || null,
                    refunds: refunds || [],
                    payouts: payouts || [],
                    advance_history: histories || [],

                    computed_summary: {
                        requested_amount: requestedAmount,
                        responded_amount: respondedAmount,
                        final_amount: finalAmount,
                        amount_paid_to_platform: paidToPlatform,
                        total_refunded_amount: totalRefundedAmount,
                        net_amount_with_platform: netWithPlatform,
                        payable_to_owner: payableToOwner,
                        already_paid_to_owner: paidToOwner,
                        pending_to_owner: pendingToOwner
                    },

                    timeline,
                    ledger
                },
                req,
                true
            )
        );
    } catch (error) {
        console.error("advance-payment/details error:", error);
        return res.status(500).json(
            responseData(error.message || "Something went wrong", {}, req, false)
        );
    }
});

router.post('/post-booking', [vendorMiddleware, verifiedOnly, vendorValidation.validate('post-booking')], async (req, res) => {
    try {
        const {
            trip_type,
            vehicle_type,
            vehicle_name = null,
            pickup_datetime,
            return_datetime = null,
            pickup_location,
            drop_location,
            city,
            state,
            accept_type,
            booking_amount = 0,
            commission = 0,
            total_amount,
            is_negotiable = false,
            secure_booking = false,
            visibility = 'public',
            extra_requirements = {},
            hide_info = false
        } = req.body;

        const vendorToken = req.user.token;

        /* -------------------- DATE VALIDATION -------------------- */
        const pickupDate = new Date(pickup_datetime);
        if (isNaN(pickupDate.getTime()) || pickupDate < new Date()) {
            return res
                .status(400)
                .json(responseData('Invalid pickup date', {}, req, false));
        }

        let returnDate = null;
        if (trip_type === 'round_trip') {
            returnDate = new Date(return_datetime);
            if (isNaN(returnDate.getTime()) || returnDate <= pickupDate) {
                return res
                    .status(400)
                    .json(responseData('Invalid return date', {}, req, false));
            }
        }
        /* -------------------- ACCEPT TYPE NORMALIZATION -------------------- */
        let normalizedAcceptType;
        switch (accept_type.toLowerCase()) {
            case 'bidding':
                normalizedAcceptType = 'BID';
                break;
            case 'instant':
                normalizedAcceptType = 'INSTANT';
                break;
            case 'approval':
                normalizedAcceptType = 'APPROVAL';
                break;
            default:
                normalizedAcceptType = 'INSTANT';
        }
        /* -------------------- CREATE BOOKING -------------------- */
        const bookingData = {
            token: randomstring(64),
            vendor_token: vendorToken,
            trip_type: trip_type.toUpperCase(),
            vehicle_type,
            vehicle_name,
            pickup_datetime: pickupDate,
            return_datetime: returnDate,
            pickup_location,
            drop_location,
            city,
            state,
            accept_type: normalizedAcceptType,
            booking_amount: normalizedAcceptType === 'BID' ? 0 : booking_amount,
            commission: normalizedAcceptType === 'BID' ? 0 : commission,
            total_amount,
            is_negotiable: normalizedAcceptType === 'BID' ? false : is_negotiable,
            secure_booking,
            hide_info,
            visibility: visibility.toUpperCase(),
            extra_requirements
        };
        const booking = await Booking.create(bookingData);

        /* -------------------- NOTIFICATION SETTINGS -------------------- */
        const notificationAccess = await SiteSetting.findOne({
            attributes: ['send_to_all_cities'],
            raw: true
        });

        const { send_to_all_cities } = notificationAccess || {};

        let whereCondition = {
            flag: 0,
            token: { [Op.ne]: vendorToken },
            booking_notification_enabled: true,
        };

        if (!send_to_all_cities) {
            whereCondition = {
                ...whereCondition,
                [Op.and]: [
                    Sequelize.where(
                        Sequelize.fn(
                            "JSON_CONTAINS",
                            Sequelize.col("preferred_cities"),
                            JSON.stringify(booking.city)
                        ),
                        1
                    ),
                ],
            };
        }

        /* -------------------- RESPONSE -------------------- */
        res.status(201).json(
            responseData('Booking posted successfully', booking, req, true)
        );

        const formattedPickupDate = pickupDate.toLocaleString('en-IN');
        const io = getIO();

        const vendors = await Vendor.findAll({
            where: whereCondition,
            attributes: ['token'],
            raw: true
        });

        const title = 'LehConnect Required';
        const message = `${booking.pickup_location} से ${booking.drop_location} तक ${formattedPickupDate} | ${booking.vehicle_type}`;

        const connectedVendors = [];
        const offlineVendors = [];

        for (const v of vendors) {
            const roomName = `vendor:${v.token}`;

            // socket.io v4 me room ke active sockets fetch karne ka safe way
            const sockets = await io.in(roomName).fetchSockets();

            if (sockets.length > 0) {
                connectedVendors.push(v);
            } else {
                offlineVendors.push(v);
            }
        }

        // 1. Connected vendors => socket only
        connectedVendors.forEach((v) => {
            io.to(`vendor:${v.token}`).emit('new_duty_alert', {
                booking_token: booking.token,
                vehicle_type: booking.vehicle_type,
                city: booking.city,
                title,
                message
            });
        });

        // 2. Offline vendors => push only
        await Promise.all(
            offlineVendors.map((v) =>
                bookingQueue.add(
                    'BOOKING_CREATED',
                    {
                        booking_token: booking.token,
                        sender_token: vendorToken,
                        owner_token: v.token,
                        title,
                        message,
                        type: 'NEW_BOOKING',
                    },
                    {
                        jobId: `bookingCreated_${booking.token}_${v.token}`,
                        removeOnComplete: true,
                    }
                )
            )
        );
    } catch (error) {
        console.error(error);
        res.status(500).json(
            responseData('Server Error', {}, req, false)
        );

    }
});

// changes
router.post('/booking/:token/request-action', [vendorMiddleware, verifiedOnly, vendorValidation.validate('booking-request-action')], async (req, res) => {
    const t = await db.sequelize.transaction();

    try {
        console.log('fffff 1')
        const { action, reason, request_token, requester_token } = req.body;
        console.log('body ->>> ', req.body)
        const ownerToken = req.user.token;
        const bookingToken = req.params.token;

        const normalizedAction = String(action || '').toUpperCase();

        if (!['ACCEPT', 'REJECT'].includes(normalizedAction)) {
            await t.rollback();
            return res.status(400).json(
                responseData('Invalid action type', {}, req, false)
            );
        }

        console.log('fffff 2')

        const booking = await Booking.findOne({
            where: { token: bookingToken },
            attributes: ["token", "vendor_token", "assigned_vendor_token", "accept_type", "status"],
            include: [
                {
                    model: BookingRequest,
                    as: "booking_requests",
                    attributes: [
                        "token",
                        "requested_by_vendor_token",
                        "status",
                        "accept_type",
                        "bid_amount",
                        "chat_unlocked"
                    ],
                    required: false,
                    on: {
                        [db.Sequelize.Op.and]: [
                            db.sequelize.where(
                                db.sequelize.col("booking_requests.booking_token"),
                                "=",
                                db.sequelize.col("booking.token"),
                            ),
                            { status: "IN_PROGRESS" },
                        ],
                    },
                },
            ],
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        console.log('fffff 3')

        if (!booking) {
            await t.rollback();
            return res.status(404).json(
                responseData('Booking not found', {}, req, false)
            );
        }

        console.log('fffff 4')

        if (booking.vendor_token !== ownerToken) {
            await t.rollback();
            return res.status(403).json(
                responseData('Not authorized', {}, req, false)
            );
        }

        console.log('fffff 5')

        if (booking.assigned_vendor_token) {
            await t.rollback();
            return res.status(403).json(
                responseData('Booking already assigned', {}, req, false)
            );
        }

        console.log('fffff 6')

        if (booking.status !== 'OPEN') {
            await t.rollback();
            return res.status(400).json(
                responseData('Booking already processed', {}, req, false)
            );
        }
        console.log('fffff 7')

        if (!['APPROVAL', 'BID'].includes(booking.accept_type)) {
            await t.rollback();
            return res.status(400).json(
                responseData('Invalid booking type for request action', {}, req, false)
            );
        }

        console.log('fffff 8')

        if (!request_token) {
            await t.rollback();
            return res.status(400).json(
                responseData('Request token is required', {}, req, false)
            );
        }

        console.log('fffff 9')

        if (!requester_token) {
            await t.rollback();
            return res.status(400).json(
                responseData('Requester token is required', {}, req, false)
            );
        }

        console.log('fffff 10 ', booking)

        const bookingRequest = booking.booking_requests?.find(
            r => r.token === request_token && r.status === 'IN_PROGRESS'
        );

        console.log('fffff 11')

        if (!bookingRequest) {
            await t.rollback();
            return res.status(400).json(
                responseData('Invalid booking request state', {}, req, false)
            );
        }

        console.log('fffff 12')

        if (bookingRequest.requested_by_vendor_token !== requester_token) {
            await t.rollback();
            return res.status(400).json(
                responseData('Requester token does not match selected request', {}, req, false)
            );
        }

        console.log('fffff 13')

        if (normalizedAction === 'REJECT' && !reason) {
            await t.rollback();
            return res.status(400).json(
                responseData('Reject reason required', {}, req, false)
            );
        }

        console.log('fffff 14')

        if (normalizedAction === 'ACCEPT') {
            const alreadyAcceptedRequest = await BookingRequest.findOne({
                where: {
                    booking_token: bookingToken,
                    status: 'ACCEPTED'
                },
                attributes: ['token', 'requested_by_vendor_token'],
                transaction: t,
                lock: t.LOCK.UPDATE
            });

            if (alreadyAcceptedRequest) {
                await t.rollback();
                return res.status(400).json(
                    responseData('A vendor has already been accepted for this booking', {}, req, false)
                );
            }
        }

        console.log('fffff 15')

        const finalStatus = normalizedAction === 'ACCEPT'
            ? 'ACCEPTED'
            : 'REJECTED';

        console.log('fffff 16')

        const now = new Date();
        const selectedChatUnlocked = finalStatus === 'ACCEPTED';

        const [updatedRequestCount] = await BookingRequest.update(
            {
                status: finalStatus,
                chat_unlocked: selectedChatUnlocked,
                responded_at: now,
                remarks: finalStatus === 'REJECTED' ? reason : null
            },
            {
                where: {
                    token: bookingRequest.token,
                    booking_token: bookingToken,
                    requested_by_vendor_token: bookingRequest.requested_by_vendor_token,
                    status: 'PENDING'
                },
                transaction: t
            }
        );

        console.log('fffff 17')

        if (!updatedRequestCount) {
            await t.rollback();
            return res.status(400).json(
                responseData('Request already processed or invalid', {}, req, false)
            );
        }

        console.log('fffff 18')

        if (finalStatus === 'ACCEPTED') {
            const [updatedBookingCount] = await Booking.update(
                {
                    status: 'ACCEPTED',
                    assigned_vendor_token: bookingRequest.requested_by_vendor_token
                },
                {
                    where: {
                        token: bookingToken,
                        vendor_token: ownerToken,
                        status: 'OPEN',
                        assigned_vendor_token: null
                    },
                    transaction: t
                }
            );

            if (!updatedBookingCount) {
                await t.rollback();
                return res.status(400).json(
                    responseData('Failed to assign vendor to booking', {}, req, false)
                );
            }

            await BookingRequest.update(
                {
                    status: 'REJECTED',
                    chat_unlocked: false,
                    responded_at: now,
                    remarks: 'Another request accepted'
                },
                {
                    where: {
                        booking_token: bookingToken,
                        status: 'PENDING',
                        token: {
                            [db.Sequelize.Op.ne]: bookingRequest.token
                        }
                    },
                    transaction: t
                }
            );
        }

        console.log('fffff 19')

        await t.commit();

        res.status(200).json(
            responseData(
                `Booking request ${finalStatus.toLowerCase()} successfully`,
                {
                    booking_token: bookingToken,
                    request_token: bookingRequest.token,
                    assigned_vendor_token: finalStatus === 'ACCEPTED'
                        ? bookingRequest.requested_by_vendor_token
                        : null,
                    status: finalStatus,
                    accepted_bid_amount: booking.accept_type === 'BID' && finalStatus === 'ACCEPTED'
                        ? bookingRequest.bid_amount
                        : null,
                    chat_unlocked: selectedChatUnlocked
                },
                req,
                true
            )
        );

        console.log('fffff 20')

        try {
            const io = getIO();

            io?.to(`vendor:${bookingRequest.requested_by_vendor_token}`).emit(
                'booking:request-action',
                {
                    event: finalStatus === 'ACCEPTED'
                        ? 'BOOKING_REQUEST_ACCEPTED'
                        : 'BOOKING_REQUEST_REJECTED',
                    booking_token: bookingToken,
                    booking_id: booking.id,
                    request_token: bookingRequest.token,
                    assigned_vendor_token: finalStatus === 'ACCEPTED'
                        ? bookingRequest.requested_by_vendor_token
                        : null,
                    action: finalStatus,
                    reason: finalStatus === 'REJECTED' ? reason : null,
                    chat_unlocked: selectedChatUnlocked
                }
            );

            console.log('fffff 21')
        } catch (socketError) {
            console.error('booking:request-action socket error:', socketError);
        }

        try {
            console.log('fffff 22')
            await bookingRequestActionQueue.add('REQUEST_ACTION', {
                bookingToken,
                requestToken: bookingRequest.token,
                receiverVendorToken: bookingRequest.requested_by_vendor_token,
                assignedVendorToken: finalStatus === 'ACCEPTED'
                    ? bookingRequest.requested_by_vendor_token
                    : null,
                action: finalStatus,
                reason: finalStatus === 'REJECTED' ? reason : null,
                actorToken: ownerToken,
                chat_unlocked: selectedChatUnlocked
            });

            console.log('fffff 23')
        } catch (queueError) {
            console.error('REQUEST_ACTION queue error:', queueError);
        }

    } catch (error) {
        if (!t.finished) {
            await t.rollback();
        }

        console.error('Booking request action error:', error);
        return res.status(500).json(
            responseData(error.message || 'Error occurred', {}, req, false)
        );
    }
});

// changes
router.post('/booking/:token/delete', [vendorMiddleware, verifiedOnly], async (req, res) => {
    const t = await db.sequelize.transaction();

    try {
        const requesterToken = req.user.token;
        const { token } = req.params;

        const booking = await Booking.findOne({
            where: {
                token,
                flag: 0
            },
            attributes: [
                'id',
                'token',
                'vendor_token',
                'status',
                'flag'
            ],
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!booking) {
            await t.rollback();
            return res.status(404).json(
                responseData('Booking not found', {}, req, false)
            );
        }

        if (booking.vendor_token !== requesterToken) {
            await t.rollback();
            return res.status(403).json(
                responseData('You can delete only your own booking', {}, req, false)
            );
        }

        const existingRequest = await BookingRequest.findOne({
            where: {
                booking_token: booking.token,
                flag: 0
            },
            attributes: ['id', 'token', 'status'],
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (existingRequest) {
            await t.rollback();
            return res.status(409).json(
                responseData(
                    'Booking cannot be deleted because a request has already been received',
                    {},
                    req,
                    false
                )
            );
        }

        const [updated] = await Booking.update(
            {
                flag: 1
            },
            {
                where: {
                    token: booking.token,
                    vendor_token: requesterToken,
                    flag: 0
                },
                transaction: t
            }
        );

        if (!updated) {
            await t.rollback();
            return res.status(409).json(
                responseData('Booking could not be deleted', {}, req, false)
            );
        }

        await t.commit();

        return res.status(200).json(
            responseData(
                'Booking deleted successfully',
                {
                    booking_token: booking.token
                },
                req,
                true
            )
        );
    } catch (error) {
        if (!t.finished) {
            await t.rollback();
        }

        console.error('Booking delete error:', error);

        return res.status(500).json(
            responseData(error.message || 'Error occured', {}, req, false)
        );
    }
});

// changes
router.patch('/booking/edit/:token', [vendorMiddleware, verifiedOnly, vendorValidation.validate('booking-update')], async (req, res) => {
    const t = await db.sequelize.transaction();

    try {
        const requesterToken = req.user.token;
        const { token } = req.params;

        const {
            trip_type,
            vehicle_type,
            vehicle_name,
            pickup_datetime,
            return_datetime,
            pickup_location,
            drop_location,
            city,
            state,
            accept_type,
            booking_amount,
            commission,
            total_amount,
            is_negotiable,
            visibility,
            secure_booking,
            payment_status,
            extra_requirements
        } = req.body;

        const booking = await Booking.findOne({
            where: {
                token,
                flag: 0
            },
            attributes: [
                'id',
                'token',
                'vendor_token',
                'status',
                'accept_type',
                'pickup_datetime',
                'flag'
            ],
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!booking) {
            await t.rollback();
            return res.status(404).json(
                responseData('Booking not found', {}, req, false)
            );
        }

        if (booking.vendor_token !== requesterToken) {
            await t.rollback();
            return res.status(403).json(
                responseData('You can edit only your own booking', {}, req, false)
            );
        }

        if (booking.status !== 'OPEN') {
            await t.rollback();
            return res.status(409).json(
                responseData('Only open bookings can be edited', {}, req, false)
            );
        }

        const existingRequest = await BookingRequest.findOne({
            where: {
                booking_token: booking.token,
                flag: 0
            },
            attributes: ['id', 'token', 'status'],
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (existingRequest) {
            await t.rollback();
            return res.status(409).json(
                responseData(
                    'Booking cannot be edited because a request has already been received',
                    {},
                    req,
                    false
                )
            );
        }

        const updatePayload = {};

        if (trip_type !== undefined) updatePayload.trip_type = trip_type;
        if (vehicle_type !== undefined) updatePayload.vehicle_type = vehicle_type;
        if (vehicle_name !== undefined) updatePayload.vehicle_name = vehicle_name;
        if (pickup_datetime !== undefined) updatePayload.pickup_datetime = pickup_datetime;
        if (return_datetime !== undefined) updatePayload.return_datetime = return_datetime;
        if (pickup_location !== undefined) updatePayload.pickup_location = pickup_location;
        if (drop_location !== undefined) updatePayload.drop_location = drop_location;
        if (city !== undefined) updatePayload.city = city;
        if (state !== undefined) updatePayload.state = state;
        if (accept_type !== undefined) updatePayload.accept_type = accept_type;
        if (booking_amount !== undefined) updatePayload.booking_amount = booking_amount;
        if (commission !== undefined) updatePayload.commission = commission;
        if (total_amount !== undefined) updatePayload.total_amount = total_amount;
        if (is_negotiable !== undefined) updatePayload.is_negotiable = is_negotiable;
        if (visibility !== undefined) updatePayload.visibility = visibility;
        if (secure_booking !== undefined) updatePayload.secure_booking = secure_booking;
        if (payment_status !== undefined) updatePayload.payment_status = payment_status;
        if (extra_requirements !== undefined) updatePayload.extra_requirements = extra_requirements;

        if (!Object.keys(updatePayload).length) {
            await t.rollback();
            return res.status(400).json(
                responseData('No valid fields provided for update', {}, req, false)
            );
        }

        const [updated] = await Booking.update(updatePayload, {
            where: {
                token: booking.token,
                vendor_token: requesterToken,
                flag: 0,
                status: 'OPEN'
            },
            transaction: t
        });

        if (!updated) {
            await t.rollback();
            return res.status(409).json(
                responseData('Booking could not be updated', {}, req, false)
            );
        }

        const updatedBooking = await Booking.findOne({
            where: {
                token: booking.token,
                flag: 0
            },
            transaction: t
        });

        await t.commit();

        return res.status(200).json(
            responseData(
                'Booking updated successfully',
                updatedBooking,
                req,
                true
            )
        );
    } catch (error) {
        if (!t.finished) {
            await t.rollback();
        }

        console.error('Booking update error:', error);

        return res.status(500).json(
            responseData(error.message || 'Error occured', {}, req, false)
        );
    }
});

// changes
router.post('/booking/:token/accept', [vendorMiddleware, verifiedOnly, vendorValidation.validate('booking-accept')], async (req, res) => {
    const t = await db.sequelize.transaction();
    const io = getIO();

    try {
        const requesterToken = req.user.token;
        const { first_name, last_name } = req.user;
        const { token } = req.params;
        const now = new Date();

        const chatUnlockedExists = await hasChatUnlockedColumn();

        const bookingRequestIncludeAttributes = chatUnlockedExists
            ? ['token', 'status', 'chat_unlocked']
            : ['token', 'status'];

        const booking = await Booking.findOne({
            where: { token },
            attributes: [
                'id',
                'token',
                'vendor_token',
                'status',
                'pickup_location',
                'drop_location',
                'pickup_datetime',
                'accept_type'
            ],
            include: [
                {
                    model: BookingRequest,
                    as: 'booking_requests',
                    required: false,
                    attributes: bookingRequestIncludeAttributes,
                    on: {
                        [Op.and]: [
                            db.sequelize.where(
                                db.sequelize.col('booking_requests.booking_token'),
                                '=',
                                db.sequelize.col('booking.token')
                            ),
                            { requested_by_vendor_token: requesterToken }
                        ]
                    }
                },
                {
                    model: BookingReject,
                    as: 'booking_rejections',
                    required: false,
                    attributes: ['token'],
                    on: {
                        [Op.and]: [
                            db.sequelize.where(
                                db.sequelize.col('booking_rejections.booking_token'),
                                '=',
                                db.sequelize.col('booking.token')
                            ),
                            { rejected_by_token: requesterToken }
                        ]
                    }
                }
            ],
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!booking) {
            await t.rollback();
            return res.status(404).json(
                responseData('Booking not found', {}, req, false)
            );
        }

        if (booking.vendor_token === requesterToken) {
            await t.rollback();
            return res.status(400).json(
                responseData('You cannot accept your own booking', {}, req, false)
            );
        }

        if (booking.status !== 'OPEN') {
            await t.rollback();
            return res.status(409).json(
                responseData('Booking is not available or already processed', {}, req, false)
            );
        }

        if (new Date(booking.pickup_datetime) <= now) {
            await t.rollback();
            return res.status(409).json(
                responseData('Booking pickup time expired', {}, req, false)
            );
        }

        if (booking.booking_requests?.length) {
            await t.rollback();
            return res.status(409).json(
                responseData('Already requested this booking', {}, req, false)
            );
        }

        if (booking.booking_rejections?.length) {
            await t.rollback();
            return res.status(403).json(
                responseData('You are not allowed to book this booking', {}, req, false)
            );
        }

        const shouldUnlockChat =
            booking.accept_type === 'INSTANT' ||
            booking.accept_type === 'APPROVAL';

        const bookingRequestPayload = {
            token: randomstring(64),
            booking_token: booking.token,
            requested_by_vendor_token: requesterToken,
            owner_vendor_token: booking.vendor_token,
            accept_type: booking.accept_type,
            status: booking.accept_type === 'INSTANT' ? 'ACCEPTED' : 'IN_PROGRESS',
            responded_at: booking.accept_type === 'INSTANT' ? new Date() : null
        };

        if (chatUnlockedExists) {
            bookingRequestPayload.chat_unlocked = shouldUnlockChat;
        }

        const bookingRequest = await BookingRequest.create(
            bookingRequestPayload,
            { transaction: t }
        );

        const responseChatUnlocked = chatUnlockedExists
            ? !!bookingRequest.chat_unlocked
            : false;

        if (booking.accept_type === 'INSTANT') {
            const [updated] = await Booking.update(
                {
                    status: 'ACCEPTED',
                    assigned_vendor_token: requesterToken
                },
                {
                    where: {
                        token: booking.token,
                        status: 'OPEN'
                    },
                    transaction: t
                }
            );

            if (!updated) {
                await t.rollback();
                return res.status(409).json(
                    responseData('Booking already taken', {}, req, false)
                );
            }

            await Notification.create(
                {
                    sender_token: requesterToken,
                    receiver_token: booking.vendor_token,
                    receiver_role: 'vendor',
                    booking_token: booking.token,
                    type: 'BOOKING_ACCEPTED',
                    title: 'Booking Accepted',
                    message: 'Your booking has been accepted.',
                    visibility: 'private'
                },
                { transaction: t }
            );

            await Notification.create(
                {
                    sender_token: booking.vendor_token,
                    receiver_token: requesterToken,
                    receiver_role: 'vendor',
                    booking_token: booking.token,
                    type: 'BOOKING_CONFIRMED',
                    title: 'Booking Confirmed',
                    message: 'You have successfully booked this trip.',
                    visibility: 'private'
                },
                { transaction: t }
            );

            await t.commit();

            res.status(201).json(
                responseData(
                    'Booking accepted successfully',
                    {
                        booking_token: booking.token,
                        booking_request_token: bookingRequest.token,
                        chat_unlocked: responseChatUnlocked
                    },
                    req,
                    true
                )
            );

            io.to(`vendor:${booking.vendor_token}`).emit('booking:instant', {
                booking_token: booking.token,
                accepted_by: `${first_name} ${last_name}`,
                event: 'BOOKING_REQUEST_ACCEPTED'
            });

            io.to(`vendor:${requesterToken}`).emit('booking:request-action', {
                booking_token: booking.token,
                event: 'BOOKING_REQUEST_ACCEPTED',
                chat_unlocked: responseChatUnlocked
            });

            await bookingNotificationQueue.add('instant-accepted', {
                receiver_token: booking.vendor_token,
                type: 'BOOKING_ACCEPTED',
                title: 'Booking Accepted',
                message: 'Your booking has been accepted.',
                booking_token: booking.token,
                event: 'booking:instant'
            });

            await bookingNotificationQueue.add('instant-confirmed', {
                receiver_token: requesterToken,
                type: 'BOOKING_CONFIRMED',
                title: 'Booking Confirmed',
                message: 'You have successfully booked this trip.',
                booking_token: booking.token,
                event: 'booking:confirmed'
            });

            return;
        }

        await Notification.create(
            {
                sender_token: requesterToken,
                receiver_token: booking.vendor_token,
                receiver_role: 'vendor',
                booking_token: booking.token,
                type: 'BOOKING_REQUEST',
                title: 'New booking request',
                message: `एक vendor ने booking ID #${booking.id} (${booking.pickup_location} से ${booking.drop_location}) के लिए रिक्वेस्ट भेजी है। कृपया विवरण देखकर निर्णय लें।`,
                visibility: 'private'
            },
            { transaction: t }
        );

        await t.commit();

        res.status(201).json(
            responseData(
                'Booking request sent successfully',
                {
                    booking_token: booking.token,
                    booking_request_token: bookingRequest.token,
                    chat_unlocked: responseChatUnlocked
                },
                req,
                true
            )
        );

        io.to(`vendor:${booking.vendor_token}`).emit('booking:request', {
            booking_token: booking.token,
            accepted_by: `${first_name} ${last_name}`,
            event: 'BOOKING_REQUEST',
            booking_id: booking.id,
            pickupLocation: booking.pickup_location,
            dropLocation: booking.drop_location,
            chat_unlocked: responseChatUnlocked
        });

        await bookingNotificationQueue.add('approval-request', {
            receiver_token: booking.vendor_token,
            type: 'BOOKING_REQUEST',
            title: 'New Booking Request',
            message: `एक vendor ने booking ID #${booking.id} (${booking.pickup_location} से ${booking.drop_location}) के लिए रिक्वेस्ट भेजी है। कृपया विवरण देखकर निर्णय लें।`,
            booking_token: booking.token,
            event: 'booking:request'
        });

    } catch (error) {
        if (!t.finished) {
            await t.rollback();
        }

        console.error('Booking accept error:', error);

        return res.status(500).json(
            responseData(error.message || 'Error occured', {}, req, false)
        );
    }
}
);

// changes
router.post('/booking/:token/reject', [vendorMiddleware, verifiedOnly, vendorValidation.validate('booking-reject')], async (req, res) => {
    const t = await db.sequelize.transaction();

    try {
        const { reason } = req.body;
        const rejecterToken = req.user.token;
        const rejecterRole = req.user.role;
        const bookingToken = req.params.token;

        const booking = await Booking.findOne({
            where: { token: bookingToken },
            attributes: ['token', 'vendor_token', 'status', 'accept_type', 'pickup_location', 'drop_location'],
            include: [
                {
                    model: BookingRequest,
                    as: 'booking_requests',
                    required: false,
                    attributes: ['token', 'status', 'chat_unlocked', 'requested_by_vendor_token'],
                    on: {
                        [Op.and]: [
                            db.sequelize.where(
                                db.sequelize.col('booking_requests.booking_token'),
                                '=',
                                db.sequelize.col('booking.token')
                            ),
                            { requested_by_vendor_token: rejecterToken }
                        ]
                    }
                },
                {
                    model: BookingReject,
                    as: 'booking_rejections',
                    required: false,
                    attributes: ['token'],
                    on: {
                        [Op.and]: [
                            db.sequelize.where(
                                db.sequelize.col('booking_rejections.booking_token'),
                                '=',
                                db.sequelize.col('booking.token')
                            ),
                            { rejected_by_token: rejecterToken }
                        ]
                    }
                }
            ],
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!booking) {
            await t.rollback();
            return res.status(404).json(
                responseData('Booking not found', {}, req, false)
            );
        }

        if (booking.vendor_token === rejecterToken) {
            await t.rollback();
            return res.status(400).json(
                responseData('You cannot reject your own booking', {}, req, false)
            );
        }

        if (booking.status !== 'OPEN') {
            await t.rollback();
            return res.status(400).json(
                responseData('Booking is no longer open', {}, req, false)
            );
        }

        const existingRequest = booking.booking_requests?.[0] || null;

        if (existingRequest?.status === 'ACCEPTED') {
            await t.rollback();
            return res.status(400).json(
                responseData('Booking already accepted', {}, req, false)
            );
        }

        if (existingRequest?.status === 'REJECTED') {
            await t.rollback();
            return res.status(400).json(
                responseData('Booking already rejected', {}, req, false)
            );
        }

        if (booking.booking_rejections?.length && !existingRequest) {
            await t.rollback();
            return res.status(400).json(
                responseData('Booking already rejected', {}, req, false)
            );
        }

        let requestToken = null;

        // if request already exists, reject that request
        if (existingRequest && ['PENDING', 'CANCELLED'].includes(existingRequest.status)) {
            await BookingRequest.update(
                {
                    status: 'REJECTED',
                    chat_unlocked: false,
                    responded_at: new Date(),
                    rejection_reason: reason || null
                },
                {
                    where: { token: existingRequest.token },
                    transaction: t
                }
            );

            requestToken = existingRequest.token;
        } else if (!existingRequest) {
            // if no request exists yet, just mark that this vendor rejected the booking
            await BookingReject.create(
                {
                    token: randomstring(64),
                    booking_token: bookingToken,
                    rejected_by_token: rejecterToken,
                    rejected_by_role: rejecterRole,
                    reason
                },
                { transaction: t }
            );
        }

        await t.commit();

        res.status(200).json(
            responseData(
                'Booking rejected successfully',
                {
                    booking_token: bookingToken,
                    booking_request_token: requestToken,
                    chat_unlocked: false
                },
                req,
                true
            )
        );

        await bookingNotificationQueue.add('booking-rejected', {
            booking_token: bookingToken,
            receiver_token: booking.vendor_token,
            type: 'BOOKING_REJECTED',
            title: 'Booking Rejected',
            message: `${reason ? `कारण: ${reason}. ` : ''}एक vendor ने booking ID #${booking.id} (${booking.pickup_location} से ${booking.drop_location}) की रिक्वेस्ट अस्वीकार कर दी है। कृपया अन्य विकल्प देखें।`,
            event: 'booking:rejected',
            rejected_by: rejecterToken,
            role: rejecterRole
        });

        const io = getIO();
        io.to(`vendor:${booking.vendor_token}`).emit('booking:request-action', {
            booking_token: bookingToken,
            booking_request_token: requestToken,
            event: 'BOOKING_REQUEST_REJECTED',
            booking_id: booking.id,
            pickupLocation: booking.pickup_location,
            dropLocation: booking.drop_location,
            reason,
            rejected_by: rejecterToken,
            chat_unlocked: false
        });

    } catch (error) {
        if (!t.finished) {
            await t.rollback();
        }

        console.error('Booking rejection error:', error);
        return res.status(500).json(
            responseData(error.message || 'Error occurred', {}, req, false)
        );
    }
});

// changes
router.post('/booking/:token/bid', [vendorMiddleware, verifiedOnly, vendorValidation.validate('bid-booking')], async (req, res) => {
    const t = await db.sequelize.transaction();

    try {
        const bidderToken = req.user.token;
        const { token } = req.params;
        const { bid_amount, remarks } = req.body;

        const now = new Date();

        const booking = await Booking.findOne({
            where: { token },
            attributes: [
                'token',
                'vendor_token',
                'status',
                'pickup_datetime',
                'accept_type'
            ],
            include: [
                {
                    model: BookingReject,
                    as: 'booking_rejections',
                    required: false,
                    attributes: ['token'],
                    on: {
                        [db.Sequelize.Op.and]: [
                            db.sequelize.where(
                                db.sequelize.col('booking_rejections.booking_token'),
                                '=',
                                db.sequelize.col('booking.token')
                            ),
                            { rejected_by_token: bidderToken }
                        ]
                    }
                }
            ],
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!booking) {
            await t.rollback();
            return res.status(404).json(
                responseData('Booking not found', {}, req, false)
            );
        }

        if (booking.vendor_token === bidderToken) {
            await t.rollback();
            return res.status(400).json(
                responseData('You cannot bid on your own booking', {}, req, false)
            );
        }

        if (booking.status !== 'OPEN') {
            await t.rollback();
            return res.status(400).json(
                responseData('Booking is not open for bidding', {}, req, false)
            );
        }

        if (booking.accept_type !== 'BID') {
            await t.rollback();
            return res.status(400).json(
                responseData('This booking does not allow bidding', {}, req, false)
            );
        }

        if (new Date(booking.pickup_datetime) <= now) {
            await t.rollback();
            return res.status(400).json(
                responseData('Booking pickup time expired', {}, req, false)
            );
        }

        if (booking.booking_rejections?.length) {
            await t.rollback();
            return res.status(403).json(
                responseData('You are not allowed to bid on this booking', {}, req, false)
            );
        }

        if (!bid_amount || Number(bid_amount) <= 0) {
            await t.rollback();
            return res.status(400).json(
                responseData('Invalid bid amount', {}, req, false)
            );
        }

        const validTillDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

        let bookingRequest = await BookingRequest.findOne({
            where: {
                booking_token: booking.token,
                requested_by_vendor_token: bidderToken,
                accept_type: 'BID',
                flag: 0
            },
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        let actionType = 'CREATED';

        if (!bookingRequest) {
            bookingRequest = await BookingRequest.create(
                {
                    token: randomstring(64),
                    booking_token: booking.token,
                    requested_by_vendor_token: bidderToken,
                    owner_vendor_token: booking.vendor_token,
                    accept_type: 'BID',
                    bid_amount,
                    bid_currency: 'INR',
                    bid_valid_till: validTillDate,
                    remarks,
                    bid_attempt_count: 1,
                    status: 'IN_PROGRESS',
                    chat_unlocked: false
                },
                { transaction: t }
            );
        } else {
            if (['ACCEPTED', 'REJECTED', 'CANCELLED'].includes(bookingRequest.status)) {
                await t.rollback();
                return res.status(400).json(
                    responseData(
                        `You cannot update this bid because it is already ${bookingRequest.status.toLowerCase()}`,
                        {},
                        req,
                        false
                    )
                );
            }

            if (Number(bookingRequest.bid_attempt_count || 0) >= 4) {
                await t.rollback();
                return res.status(400).json(
                    responseData('You can bid maximum 3 times on this booking', {}, req, false)
                );
            }

            await bookingRequest.update(
                {
                    bid_amount,
                    bid_currency: 'INR',
                    bid_valid_till: validTillDate,
                    remarks,
                    bid_attempt_count: Number(bookingRequest.bid_attempt_count || 0) + 1,
                    status: 'IN_PROGRESS',
                    chat_unlocked: false
                },
                { transaction: t }
            );

            actionType = 'UPDATED';
        }

        await t.commit();

        res.status(201).json(
            responseData(
                actionType === 'CREATED' ? 'Bid placed successfully' : 'Bid updated successfully',
                {
                    booking_token: booking.token,
                    booking_request_token: bookingRequest.token,
                    bid_attempt_count: bookingRequest.bid_attempt_count,
                    chat_unlocked: false
                },
                req,
                true
            )
        );

        const io = getIO();

        const title =
            actionType === 'CREATED' ? 'New Bid Received' : 'Bid Updated';

        const message =
            actionType === 'CREATED'
                ? `एक vendor ने आपकी booking पर ₹${bid_amount} की नई bid लगाई है। चेक करके decide करें।`
                : `एक vendor ने bid अपडेट करके ₹${bid_amount} कर दी है। देखकर decide करें।`;

        const ownerRoom = io.sockets.adapter.rooms.get(`vendor:${booking.vendor_token}`);
        const isOwnerConnected = ownerRoom && ownerRoom.size > 0;

        if (isOwnerConnected) {
            io.to(`vendor:${booking.vendor_token}`).emit('booking:new-bid', {
                booking_token: booking.token,
                bidder_token: bidderToken,
                bid_amount,
                bid_currency: 'INR',
                remarks,
                bid_valid_till: validTillDate,
                bid_attempt_count: bookingRequest.bid_attempt_count,
                action: actionType,
                chat_unlocked: false,
                title,
                message
            });
        } else {
            await bookingNotificationQueue.add('new-bid', {
                receiver_token: booking.vendor_token,
                sender_token: bidderToken,
                type: actionType === 'CREATED' ? 'NEW_BID' : 'BID_UPDATED',
                title,
                message,
                booking_token: booking.token,
                event: 'booking:bid'
            });
        }

    } catch (error) {
        if (!t.finished) {
            await t.rollback();
        }

        console.error('Booking bid error:', error);

        return res.status(500).json(
            responseData(error.message || 'Error occurred', {}, req, false)
        );
    }
});

// changes
router.post('/booking/:token/bid-action', [vendorMiddleware, verifiedOnly], async (req, res) => {
    const t = await db.sequelize.transaction();

    try {
        const ownerToken = req.user.token;
        const { token: bookingToken } = req.params;
        const { request_token, action } = req.body;

        if (!['ACCEPT', 'REJECT'].includes(action?.toUpperCase())) {
            await t.rollback();
            return res.status(400).json(
                responseData('Invalid action type', {}, req, false)
            );
        }

        const booking = await Booking.findOne({
            where: { token: bookingToken },
            attributes: ['token', 'vendor_token', 'status', 'accept_type'],
            include: [
                {
                    model: BookingRequest,
                    as: 'booking_requests',
                    required: false,
                    attributes: [
                        'token',
                        'requested_by_vendor_token',
                        'status',
                        'bid_amount',
                        'chat_unlocked'
                    ],
                    on: {
                        [db.Sequelize.Op.and]: [
                            db.sequelize.where(
                                db.sequelize.col('booking_requests.booking_token'),
                                '=',
                                db.sequelize.col('booking.token')
                            )
                        ]
                    }
                }
            ],
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!booking) {
            await t.rollback();
            return res.status(404).json(
                responseData('Booking not found', {}, req, false)
            );
        }

        if (booking.vendor_token !== ownerToken) {
            await t.rollback();
            return res.status(403).json(
                responseData('Not authorized', {}, req, false)
            );
        }

        if (booking.status !== 'OPEN') {
            await t.rollback();
            return res.status(400).json(
                responseData('Booking already processed', {}, req, false)
            );
        }

        if (booking.accept_type !== 'BID') {
            await t.rollback();
            return res.status(400).json(
                responseData('This booking is not for bidding', {}, req, false)
            );
        }

        if (!request_token) {
            await t.rollback();
            return res.status(400).json(
                responseData('Request token is required', {}, req, false)
            );
        }

        const bidRequest = booking.booking_requests?.find(
            r => String(r.token) === String(request_token) && r.status === 'IN_PROGRESS'
        );

        if (!bidRequest) {
            await t.rollback();
            return res.status(400).json(
                responseData('Invalid or already processed bid', {}, req, false)
            );
        }

        const isAccept = action.toUpperCase() === 'ACCEPT';
        const finalStatus = isAccept ? 'ACCEPTED' : 'REJECTED';
        const now = new Date();

        await BookingRequest.update(
            {
                status: finalStatus,
                chat_unlocked: isAccept ? true : false,
                responded_at: now,
                remarks: finalStatus === 'REJECTED' ? 'Rejected by owner' : null
            },
            {
                where: { token: bidRequest.token },
                transaction: t
            }
        );

        if (finalStatus === 'ACCEPTED') {
            await Booking.update(
                {
                    status: 'ACCEPTED',
                    assigned_vendor_token: bidRequest.requested_by_vendor_token
                },
                {
                    where: { token: bookingToken },
                    transaction: t
                }
            );

            await BookingRequest.update(
                {
                    status: 'REJECTED',
                    chat_unlocked: false,
                    responded_at: now,
                    remarks: 'Another bid accepted'
                },
                {
                    where: {
                        booking_token: bookingToken,
                        status: 'PENDING',
                        token: { [db.Sequelize.Op.ne]: bidRequest.token }
                    },
                    transaction: t
                }
            );
        }

        await t.commit();

        res.status(200).json(
            responseData(
                `Bid ${finalStatus.toLowerCase()} successfully`,
                {
                    booking_token: bookingToken,
                    request_token: bidRequest.token,
                    assigned_vendor_token: finalStatus === 'ACCEPTED'
                        ? bidRequest.requested_by_vendor_token
                        : null,
                    status: finalStatus,
                    accepted_bid_amount: finalStatus === 'ACCEPTED'
                        ? bidRequest.bid_amount
                        : null,
                    chat_unlocked: finalStatus === 'ACCEPTED'
                },
                req,
                true
            )
        );

        const receiverToken = bidRequest.requested_by_vendor_token;
        const io = getIO();

        const notificationTitle = finalStatus === 'ACCEPTED'
            ? 'Bid Accepted'
            : 'Bid Rejected';

        const notificationMessage = finalStatus === 'ACCEPTED'
            ? `Good news! Your bid of ₹${bidRequest.bid_amount} has been accepted by the booking owner. You can now proceed with the booking and continue further communication.`
            : `Your bid of ₹${bidRequest.bid_amount} has been rejected by the booking owner. You can still explore other available bookings and place new bids.`;

        const room = io?.sockets?.adapter?.rooms?.get(`vendor:${receiverToken}`);
        const isConnected = room && room.size > 0;

        try {
            if (isConnected) {
                io.to(`vendor:${receiverToken}`).emit('booking:bid-action', {
                    event: finalStatus === 'ACCEPTED' ? 'BID_ACCEPTED' : 'BID_REJECTED',
                    booking_token: bookingToken,
                    request_token: bidRequest.token,
                    assigned_vendor_token: finalStatus === 'ACCEPTED'
                        ? bidRequest.requested_by_vendor_token
                        : null,
                    bid_amount: bidRequest.bid_amount,
                    action: finalStatus,
                    chat_unlocked: finalStatus === 'ACCEPTED',
                    title: notificationTitle,
                    message: notificationMessage
                });
            } else {
                await bookingNotificationQueue.add('booking-notification', {
                    receiver_token: receiverToken,
                    sender_token: ownerToken,
                    assigned_vendor_token: finalStatus === 'ACCEPTED'
                        ? bidRequest.requested_by_vendor_token
                        : null,
                    type: finalStatus === 'ACCEPTED' ? 'BID_ACCEPTED' : 'BID_REJECTED',
                    title: notificationTitle,
                    message: notificationMessage,
                    booking_token: bookingToken,
                    request_token: bidRequest.token,
                    event: 'booking:bid-action',
                    chat_unlocked: finalStatus === 'ACCEPTED'
                });
            }
        } catch (notifyError) {
            console.error('bid-action notify error:', notifyError);
        }
    } catch (error) {
        if (!t.finished) {
            await t.rollback();
        }

        console.error('Bid action error:', error);
        return res.status(500).json(
            responseData(error.message || 'Error occurred', {}, req, false)
        );
    }
});

router.post('/report-booking/:token', [vendorMiddleware, verifiedOnly, vendorValidation.validate('rate-booking')], async (req, res) => {
    const t = await db.sequelize.transaction();

    try {
        const { stars, comment } = req.body;
        const raterToken = req.user.token;
        const bookingToken = req.params.token;

        if (!stars || Number(stars) < 1 || Number(stars) > 5) {
            await t.rollback();
            return res.status(400).json(
                responseData('Invalid rating value', {}, req, false)
            );
        }

        const booking = await Booking.findOne({
            where: { token: bookingToken },
            attributes: ['token', 'vendor_token', 'status'],
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!booking) {
            await t.rollback();
            return res.status(404).json(
                responseData('Booking not found', {}, req, false)
            );
        }

        // Vendor who created/posted the booking
        const vendorToRate = booking.vendor_token;

        if (!vendorToRate) {
            await t.rollback();
            return res.status(400).json(
                responseData('Vendor not found for this booking', {}, req, false)
            );
        }

        // Prevent self rating
        if (vendorToRate === raterToken) {
            await t.rollback();
            return res.status(403).json(
                responseData('You cannot rate your own booking vendor', {}, req, false)
            );
        }

        // Optional: allow only completed bookings
        // if (booking.status !== 'COMPLETED') {
        //     await t.rollback();
        //     return res.status(400).json(
        //         responseData('Only completed bookings can be rated', {}, req, false)
        //     );
        // }

        const alreadyRated = await VendorRating.findOne({
            where: {
                vendor_token: vendorToRate,
                rater_token: raterToken
            },
            transaction: t
        });

        if (alreadyRated) {
            await t.rollback();
            return res.status(400).json(
                responseData('You have already rated this vendor', {}, req, false)
            );
        }

        await VendorRating.create({
            token: randomstring(64),
            booking_token: bookingToken,
            vendor_token: vendorToRate,
            rater_token: raterToken,
            rating: Number(stars),
            comment: comment?.trim() || null,
            created_ip: req.ip?.replace('::ffff:', '') || null,
            user_agent: req.get('User-Agent') || null
        }, { transaction: t });

        await t.commit();

        return res.status(201).json(
            responseData('Vendor rated successfully', {}, req, true)
        );

        // Socket
        // const io = getIO();

        // io?.to(`vendor:${raterToken}`).emit('vendor:rated', {
        //     booking_token: bookingToken,
        //     vendor_token: vendorToRate,
        //     rating: Number(stars),
        //     comment: comment?.trim() || null,
        //     role: 'rater'
        // });

        // io?.to(`vendor:${vendorToRate}`).emit('vendor:rated', {
        //     booking_token: bookingToken,
        //     vendor_token: vendorToRate,
        //     rating: Number(stars),
        //     comment: comment?.trim() || null,
        //     role: 'ratee'
        // });

        // // Queue
        // await ratingNotificationQueue.add('vendor-rating-created', {
        //     booking_token: bookingToken,
        //     rater_token: raterToken,
        //     vendor_token: vendorToRate,
        //     rating: Number(stars),
        //     comment: comment?.trim() || null
        // });

    } catch (error) {
        await t.rollback();
        console.error('Vendor rating error:', error);
        return res.status(500).json(
            responseData('Error occurred', {}, req, false)
        );
    }
});

// changes
router.post('/booking/:token/cancel', [vendorMiddleware, verifiedOnly], async (req, res) => {

    const t = await db.sequelize.transaction();

    try {
        const bookingToken = req.params.token;
        const user = req.user;
        const { reason } = req.body;
        const now = new Date();

        const booking = await Booking.findOne({
            where: { token: bookingToken },
            attributes: [
                'id',
                'token',
                'vendor_token',
                'assigned_vendor_token',
                'accept_type',
                'status',
                'vehicle_type',
                'city',
                'completion_requested_at',
                'completed_at',
                'secure_booking',
                'payment_status'
            ],
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!booking || booking && booking?.accept_type !== 'BID') {
            await t.rollback();
            return res.status(404).json(
                responseData('Cannot cancel this booking', {}, req, false)
            );
        }

        if (booking.vendor_token !== user.token) {
            await t.rollback();
            return res.status(403).json(
                responseData('You can only cancel you booking', {}, req, false)
            );
        }
        if (booking.status === 'CANCELLED') {
            await t.rollback();
            return res.status(400).json(
                responseData('Already cancelled this booking', {}, req, false)
            );
        }

        if (booking.status === 'COMPLETED' || booking.completed_at) {
            await t.rollback();
            return res.status(400).json(
                responseData('Completed booking cannot be cancelled', {}, req, false)
            );
        }

        // create cancel entry
        await Booking.update(
            {
                status: 'CANCELLED'
            },
            {
                where: { token: bookingToken },
                transaction: t
            }
        );

        await t.commit();

        return res.status(200).json(
            responseData(
                'Booking cancelled successfully',
                {
                    booking_token: booking.token,
                },
                req,
                true
            )
        );

    } catch (err) {
        if (!t.finished) {
            await t.rollback();
        }

        console.error('[BOOKING CANCEL ERROR]', err);

        return res.status(500).json(
            responseData(err.message || 'Something went wrong', {}, req, false)
        );
    }
});

// new
router.post('/booking/:token/pay-advance/order', [vendorMiddleware, verifiedOnly], async (req, res) => {
    const t = await db.sequelize.transaction();

    try {
        const ownerToken = req.user.token;
        const bookingToken = req.params.token;

        const { amount } = req.body;

        if (!amount || Number(amount) <= 0) {
            await t.rollback();
            return res.status(400).json(
                responseData('Valid advance amount is required', {}, req, false)
            );
        }

        const booking = await Booking.findOne({
            where: { token: bookingToken },
            attributes: [
                'id',
                'token',
                'vendor_token',
                'assigned_vendor_token',
                'status',
                'accept_type',
                'secure_booking',
                'payment_status',
                'vehicle_type',
                'city'
            ],
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!booking) {
            await t.rollback();
            return res.status(404).json(
                responseData('Booking not found', {}, req, false)
            );
        }

        if (booking.vendor_token !== ownerToken) {
            await t.rollback();
            return res.status(403).json(
                responseData('Only booking owner can create pay advance order', {}, req, false)
            );
        }

        // ✅ FIX HERE
        if (!booking.secure_booking) {
            await t.rollback();
            return res.status(400).json(
                responseData('This booking is not a secure booking', {}, req, false)
            );
        }

        if (!booking.assigned_vendor_token) {
            await t.rollback();
            return res.status(400).json(
                responseData('Please accept/select a vendor before making payment', {}, req, false)
            );
        }

        if (['CANCELLED', 'COMPLETED'].includes(booking.status)) {
            await t.rollback();
            return res.status(400).json(
                responseData(`Payment cannot be created for ${booking.status.toLowerCase()} booking`, {}, req, false)
            );
        }

        if (booking.payment_status === 'PAID') {
            await t.rollback();
            return res.status(409).json(
                responseData('Advance payment already completed for this booking', {}, req, false)
            );
        }

        const amountInPaise = Math.round(Number(amount) * 100);
        const receipt = `adv_${booking.token}_${Date.now()}`;

        const razorpayOrder = await razorpay.orders.create({
            amount: amountInPaise,
            currency: 'INR',
            receipt,
            notes: {
                booking_token: booking.token,
                owner_token: booking.vendor_token,
                assigned_vendor_token: booking.assigned_vendor_token,
                purpose: 'BOOKING_ADVANCE',
                accept_type: booking.accept_type || '',
                vehicle_type: booking.vehicle_type || '',
                city: booking.city || ''
            }
        });

        const paymentRow = await db.bookingPayment.create({
            token: randomstring(64),
            booking_token: booking.token,
            payer_token: booking.vendor_token,
            payee_vendor_token: booking.assigned_vendor_token,
            amount: Number(amount).toFixed(2),
            currency: 'INR',
            payment_for: 'BOOKING_ADVANCE',
            razorpay_order_id: razorpayOrder.id,
            razorpay_receipt: razorpayOrder.receipt,
            order_status: 'CREATED', // 🔥 better naming
            meta: razorpayOrder
        }, { transaction: t });

        await Booking.update(
            {
                payment_status: 'PENDING'
            },
            {
                where: { token: booking.token },
                transaction: t
            }
        );

        await t.commit();

        return res.status(201).json(
            responseData(
                'Pay advance order created successfully',
                {
                    booking_token: booking.token,
                    payment_token: paymentRow.token,
                    amount: Number(amount).toFixed(2),
                    currency: 'INR',
                    razorpay: {
                        key: process.env.RAZORPAY_KEY_ID,
                        order_id: razorpayOrder.id,
                        amount: razorpayOrder.amount,
                        currency: razorpayOrder.currency,
                        receipt: razorpayOrder.receipt
                    }
                },
                req,
                true
            )
        );

    } catch (error) {
        if (!t.finished) {
            await t.rollback();
        }

        console.error('pay advance order create error:', error);
        return res.status(500).json(
            responseData(error.message || 'Something went wrong', {}, req, false)
        );
    }
});

// new
router.post('/booking/:token/pay-advance/verify', [vendorMiddleware, verifiedOnly], async (req, res) => {
    const t = await db.sequelize.transaction();

    try {
        const ownerToken = req.user.token;
        const bookingToken = req.params.token;

        const {
            payment_token,
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        } = req.body;

        if (!payment_token || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            await t.rollback();
            return res.status(400).json(
                responseData('All payment verification fields are required', {}, req, false)
            );
        }

        const booking = await Booking.findOne({
            where: { token: bookingToken },
            attributes: [
                'token',
                'vendor_token',
                'assigned_vendor_token',
                'status',
                'secure_booking',
                'payment_status'
            ],
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!booking) {
            await t.rollback();
            return res.status(404).json(
                responseData('Booking not found', {}, req, false)
            );
        }

        if (booking.vendor_token !== ownerToken) {
            await t.rollback();
            return res.status(403).json(
                responseData('Only booking owner can verify payment', {}, req, false)
            );
        }

        if (!booking.secure_booking) {
            await t.rollback();
            return res.status(400).json(
                responseData('This booking is not a secure booking', {}, req, false)
            );
        }

        const paymentRow = await db.bookingPayment.findOne({
            where: {
                token: payment_token,
                booking_token: bookingToken,
                payer_token: ownerToken,
                flag: false
            },
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!paymentRow) {
            await t.rollback();
            return res.status(404).json(
                responseData('Payment row not found', {}, req, false)
            );
        }

        if (paymentRow.order_status === 'PAID') {
            await t.rollback();
            return res.status(409).json(
                responseData('Payment already verified', {}, req, false)
            );
        }

        if (paymentRow.razorpay_order_id !== razorpay_order_id) {
            await t.rollback();
            return res.status(400).json(
                responseData('Invalid razorpay order id', {}, req, false)
            );
        }

        const generatedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(`${paymentRow.razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        if (generatedSignature !== razorpay_signature) {
            await paymentRow.update({
                order_status: 'FAILED',
                razorpay_payment_id,
                razorpay_signature
            }, { transaction: t });

            await Booking.update(
                { payment_status: 'FAILED' },
                { where: { token: bookingToken }, transaction: t }
            );

            await t.commit();

            return res.status(400).json(
                responseData('Payment signature verification failed', {}, req, false)
            );
        }

        const razorpayPayment = await razorpay.payments.fetch(razorpay_payment_id);

        const isPaid = ['captured', 'authorized'].includes(
            String(razorpayPayment?.status || '').toLowerCase()
        );

        if (!isPaid) {
            await paymentRow.update({
                order_status: 'FAILED',
                razorpay_payment_id,
                razorpay_signature
            }, { transaction: t });

            await Booking.update(
                { payment_status: 'FAILED' },
                { where: { token: bookingToken }, transaction: t }
            );

            await t.commit();

            return res.status(400).json(
                responseData('Payment is not successful', {}, req, false)
            );
        }

        // ✅ SUCCESS
        await paymentRow.update({
            razorpay_payment_id,
            razorpay_signature,
            order_status: 'PAID',
            paid_at: new Date()
        }, { transaction: t });

        await Booking.update(
            {
                payment_status: 'PAID',
                status: booking.status === 'ACCEPTED' ? 'CONFIRMED' : booking.status
            },
            {
                where: { token: bookingToken },
                transaction: t
            }
        );

        // 🔥 NEW: CREATE PAYOUT
        const grossAmount = Number(paymentRow.amount || 0);

        await db.vendorPayout.create({
            token: randomstring(64),
            booking_token: bookingToken,
            payment_token: paymentRow.token,
            vendor_token: booking.assigned_vendor_token,
            payer_token: booking.vendor_token,
            gross_amount: grossAmount,
            commission_amount: 0,
            net_amount: grossAmount,
            payout_status: 'PENDING',
            remarks: 'Auto created after payment success'
        }, { transaction: t });

        await t.commit();

        return res.status(200).json(
            responseData(
                'Advance payment verified successfully',
                {
                    booking_token: bookingToken,
                    payment_token: paymentRow.token,
                    razorpay_payment_id,
                    payment_status: 'PAID',
                    chat_unlocked: true // 🔥 useful for frontend
                },
                req,
                true
            )
        );

    } catch (error) {
        if (!t.finished) {
            await t.rollback();
        }

        console.error('pay advance verify error:', error);
        return res.status(500).json(
            responseData(error.message || 'Something went wrong', {}, req, false)
        );
    }
});


/* ------------  new api socket added -----------*/

// instant complete
router.post('/booking/:token/complete-instant', [vendorMiddleware, verifiedOnly], async (req, res) => {
    const t = await db.sequelize.transaction();

    try {
        const bookingToken = req.params.token;
        const ownerToken = req.user.token;

        const booking = await Booking.findOne({
            where: { token: bookingToken },
            attributes: [
                'id',
                'token',
                'vendor_token',
                'accept_type',
                'status',
                'completed_at',
                'completion_confirmed_by',
                'completion_confirmed_at',
                'vehicle_type',
                'city'
            ],
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!booking) {
            await t.rollback();
            return res.status(404).json(
                responseData('Booking not found', {}, req, false)
            );
        }

        if (booking.accept_type !== 'INSTANT') {
            await t.rollback();
            return res.status(400).json(
                responseData('Invalid booking type', {}, req, false)
            );
        }

        if (booking.vendor_token !== ownerToken) {
            await t.rollback();
            return res.status(403).json(
                responseData('Only booking owner can complete this instant booking', {}, req, false)
            );
        }

        // if (!booking.assigned_vendor_token) {
        //     await t.rollback();
        //     return res.status(400).json(
        //         responseData('No assigned vendor found for this booking', {}, req, false)
        //     );
        // }

        if (!['ACCEPTED', 'IN_PROGRESS', 'OPEN'].includes(booking.status)) {
            await t.rollback();
            return res.status(400).json(
                responseData(
                    `Instant booking cannot be completed in ${booking.status} status`,
                    {},
                    req,
                    false
                )
            );
        }

        if (booking.status === 'COMPLETED' || booking.completed_at) {
            await t.rollback();
            return res.status(400).json(
                responseData('Booking is already completed', {}, req, false)
            );
        }

        const [ownerVendor] = await Promise.all([
            Vendor.findOne({
                where: { token: booking.vendor_token },
                attributes: ['token', 'first_name', 'last_name'],
                transaction: t
            })
        ]);

        const ownerName = [ownerVendor?.first_name, ownerVendor?.last_name].filter(Boolean).join(' ').trim() || 'Vendor';
        // const assignedVendorName = [assignedVendor?.first_name, assignedVendor?.last_name].filter(Boolean).join(' ').trim() || 'Vendor';

        const now = new Date();
        const readableCompletedAt = formatReadableDate(now);

        await Booking.update(
            {
                status: 'COMPLETED',
                completion_confirmed_by: ownerToken,
                completion_confirmed_at: now,
                completed_at: now,
                completion_requested_by: null,
                completion_requested_at: null,
                completion_rejected_at: null,
                completion_rejection_reason: null,
                auto_complete_at: null
            },
            {
                where: { id: booking.id },
                transaction: t
            }
        );

        await t.commit();

        return res.status(200).json(
            responseData(
                'Instant booking completed successfully',
                {
                    booking_token: booking.token,
                    accept_type: booking.accept_type,
                    status: 'COMPLETED',
                    owner_vendor_name: ownerName,
                    // assigned_vendor_name: assignedVendorName,
                    completed_at: now,
                    completed_at_readable: readableCompletedAt,
                    completion_confirmed_by: ownerToken,
                    completion_confirmed_by_name: ownerName,
                    completion_confirmed_at: now,
                    completion_confirmed_at_readable: readableCompletedAt
                },
                req,
                true
            )
        );
    } catch (error) {
        await t.rollback();
        console.error('Complete instant booking error:', error);

        return res.status(500).json(
            responseData('Error occurred', {}, req, false)
        );
    }
});

// approval-bid request completion
router.post('/booking/:token/request-completion', [vendorMiddleware, verifiedOnly], async (req, res) => {
    const t = await db.sequelize.transaction();

    try {
        const bookingToken = req.params.token;
        const loggedInVendorToken = req.user.token;

        const booking = await Booking.findOne({
            where: { token: bookingToken },
            attributes: [
                'id',
                'token',
                'vendor_token',
                'assigned_vendor_token',
                'accept_type',
                'status',
                'completion_requested_by',
                'completion_requested_at',
                'completed_at',
                'completion_confirmed_by',
                'completion_confirmed_at',
                'completion_rejected_at',
                'completion_rejection_reason',
                'extra_requirements',
                'vehicle_type',
                'city'
            ],
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!booking) {
            await t.rollback();
            return res.status(404).json(
                responseData('Booking not found', {}, req, false)
            );
        }

        if (!['APPROVAL', 'BID'].includes(booking.accept_type)) {
            await t.rollback();
            return res.status(400).json(
                responseData('Completion request is only allowed for approval or bid bookings', {}, req, false)
            );
        }

        if (!booking.assigned_vendor_token) {
            await t.rollback();
            return res.status(400).json(
                responseData('No assigned vendor found for this booking', {}, req, false)
            );
        }

        if (booking.assigned_vendor_token !== loggedInVendorToken) {
            await t.rollback();
            return res.status(403).json(
                responseData('You are not allowed to request completion for this booking', {}, req, false)
            );
        }

        const requesterToken = booking.assigned_vendor_token;
        const ownerToken = booking.vendor_token;

        if (ownerToken === loggedInVendorToken) {
            await t.rollback();
            return res.status(403).json(
                responseData('Booking owner cannot request completion from this action', {}, req, false)
            );
        }

        if (!['ACCEPTED', 'IN_PROGRESS', 'COMPLETION_DISPUTED'].includes(booking.status)) {
            await t.rollback();
            return res.status(400).json(
                responseData(
                    `Completion cannot be requested when booking status is ${booking.status}`,
                    {},
                    req,
                    false
                )
            );
        }

        if (booking.status === 'COMPLETED' || booking.completed_at) {
            await t.rollback();
            return res.status(400).json(
                responseData('Booking is already completed', {}, req, false)
            );
        }

        if (booking.status === 'COMPLETION_REQUESTED') {
            await t.rollback();
            return res.status(400).json(
                responseData('Completion already requested for this booking', {}, req, false)
            );
        }

        const [requesterVendor, ownerVendor, activeBookingRequest] = await Promise.all([
            Vendor.findOne({
                where: { token: requesterToken },
                attributes: ['token', 'first_name', 'last_name'],
                transaction: t
            }),
            Vendor.findOne({
                where: { token: ownerToken },
                attributes: ['token', 'first_name', 'last_name'],
                transaction: t
            }),
            BookingRequest.findOne({
                where: {
                    booking_token: booking.token,
                    requested_by_vendor_token: requesterToken,
                    owner_vendor_token: ownerToken,
                    status: {
                        [db.Sequelize.Op.in]: ['ACCEPTED', 'IN_PROGRESS', 'COMPLETION_DISPUTED']
                    }
                },
                attributes: [
                    'token',
                    'booking_token',
                    'requested_by_vendor_token',
                    'owner_vendor_token',
                    'status',
                    'accept_type'
                ],
                transaction: t,
                lock: t.LOCK.UPDATE
            })
        ]);

        if (!activeBookingRequest) {
            await t.rollback();
            return res.status(400).json(
                responseData('Active booking request not found for assigned vendor', {}, req, false)
            );
        }

        const requesterName = [requesterVendor?.first_name, requesterVendor?.last_name]
            .filter(Boolean)
            .join(' ')
            .trim() || 'Vendor';

        const ownerName = [ownerVendor?.first_name, ownerVendor?.last_name]
            .filter(Boolean)
            .join(' ')
            .trim() || 'Vendor';

        const now = new Date();
        const autoCompleteAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const readableRequestedAt = formatReadableDate(now);
        const readableAutoCompleteAt = formatReadableDate(autoCompleteAt);

        await Booking.update(
            {
                status: 'ACCEPTED',
                completion_requested_by: requesterToken,
                completion_requested_at: now,
                completion_confirmed_by: null,
                completion_confirmed_at: null,
                completion_rejected_at: null,
                completion_rejection_reason: null,
                completion_proof: null,
                extra_requirements: booking.extra_requirements,
                auto_complete_at: autoCompleteAt
            },
            {
                where: { id: booking.id },
                transaction: t
            }
        );

        await BookingRequest.update(
            {
                status: 'COMPLETION_REQUESTED'
            },
            {
                where: {
                    token: activeBookingRequest.token,
                    booking_token: booking.token,
                    requested_by_vendor_token: requesterToken,
                    owner_vendor_token: ownerToken,
                    status: {
                        [db.Sequelize.Op.in]: ['ACCEPTED', 'IN_PROGRESS', 'COMPLETION_DISPUTED']
                    }
                },
                transaction: t
            }
        );

        await t.commit();

        res.status(200).json(
            responseData(
                'Completion requested successfully. Waiting for booking owner confirmation.',
                {
                    booking_token: booking.token,
                    booking_request_token: activeBookingRequest.token,
                    accept_type: booking.accept_type,
                    status: 'COMPLETION_REQUESTED',
                    completion_requested_by: requesterToken,
                    completion_requested_by_name: requesterName,
                    owner_vendor_token: ownerToken,
                    owner_vendor_name: ownerName,
                    completion_requested_at: now,
                    completion_requested_at_readable: readableRequestedAt,
                    auto_complete_at: autoCompleteAt,
                    auto_complete_at_readable: readableAutoCompleteAt
                },
                req,
                true
            )
        );

        try {
            const io = getIO?.();

            io?.to(`vendor:${ownerToken}`).emit('booking:completion-requested', {
                booking_token: booking.token,
                booking_request_token: activeBookingRequest.token,
                accept_type: booking.accept_type,
                requested_by: requesterToken,
                requester_name: requesterName,
                owner_token: ownerToken,
                owner_name: ownerName,
                status: 'COMPLETION_REQUESTED',
                completion_requested_at: now,
                completion_requested_at_readable: readableRequestedAt,
                auto_complete_at: autoCompleteAt,
                auto_complete_at_readable: readableAutoCompleteAt,
                message: `${requesterName} requested completion on ${readableRequestedAt}`
            });

            await bookingCompletionQueue.add('BOOKING_COMPLETION_REQUESTED', {
                booking_token: booking.token,
                booking_request_token: activeBookingRequest.token,
                accept_type: booking.accept_type,
                owner_token: ownerToken,
                owner_name: ownerName,
                assigned_vendor_token: requesterToken,
                assigned_vendor_name: requesterName,
                sender_token: requesterToken,
                sender_name: requesterName,
                vehicle_type: booking.vehicle_type,
                city: booking.city,
                completion_requested_at: now,
                completion_requested_at_readable: readableRequestedAt,
                auto_complete_at: autoCompleteAt,
                auto_complete_at_readable: readableAutoCompleteAt,
                notification_title: 'Completion Requested',
                notification_body: `${requesterName} requested completion on ${readableRequestedAt}`
            });
        } catch (socketError) {
            console.error('Completion request socket emit error:', socketError);
        }
    } catch (error) {
        if (!t.finished) {
            await t.rollback();
        }

        console.error('Request completion error:', error);

        return res.status(500).json(
            responseData('Error occurred', {}, req, false)
        );
    }
});

// approval-bid completion confirmed
router.post('/booking/:token/confirm-completion', [vendorMiddleware, verifiedOnly], async (req, res) => {
    const t = await db.sequelize.transaction();

    try {
        const bookingToken = req.params.token;
        const ownerToken = req.user.token;

        const booking = await Booking.findOne({
            where: { token: bookingToken },
            attributes: [
                'id',
                'token',
                'vendor_token',
                'assigned_vendor_token',
                'accept_type',
                'status',
                'completion_requested_by',
                'completion_requested_at',
                'completion_confirmed_by',
                'completion_confirmed_at',
                'completed_at',
                'vehicle_type',
                'city'
            ],
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!booking) {
            await t.rollback();
            return res.status(404).json(
                responseData('Booking not found', {}, req, false)
            );
        }

        if (!['APPROVAL', 'BID'].includes(booking.accept_type)) {
            await t.rollback();
            return res.status(400).json(
                responseData('This API is only for approval or bid bookings', {}, req, false)
            );
        }

        if (booking.vendor_token !== ownerToken) {
            await t.rollback();
            return res.status(403).json(
                responseData('You are not authorized to confirm this booking', {}, req, false)
            );
        }

        if (!booking.assigned_vendor_token) {
            await t.rollback();
            return res.status(400).json(
                responseData('No assigned vendor found for this booking', {}, req, false)
            );
        }

        if (booking.status !== 'ACCEPTED' || booking.status === 'OPEN' || booking.status === 'CANCELLED' || booking.status === 'EXPIRED') {
            await t.rollback();
            return res.status(400).json(
                responseData(
                    `Booking cannot be confirmed in ${booking.status} status`,
                    {},
                    req,
                    false
                )
            );
        }

        const [ownerVendor, assignedVendor, activeBookingRequest] = await Promise.all([
            Vendor.findOne({
                where: { token: booking.vendor_token },
                attributes: ['token', 'first_name', 'last_name'],
                transaction: t
            }),
            Vendor.findOne({
                where: { token: booking.assigned_vendor_token },
                attributes: ['token', 'first_name', 'last_name'],
                transaction: t
            }),
            BookingRequest.findOne({
                where: {
                    booking_token: booking.token,
                    requested_by_vendor_token: booking.assigned_vendor_token,
                    owner_vendor_token: booking.vendor_token,
                    status: 'COMPLETION_REQUESTED'
                },
                attributes: [
                    'token',
                    'booking_token',
                    'requested_by_vendor_token',
                    'owner_vendor_token',
                    'status',
                    'accept_type'
                ],
                transaction: t,
                lock: t.LOCK.UPDATE
            })
        ]);

        if (!activeBookingRequest) {
            await t.rollback();
            return res.status(400).json(
                responseData('Active completion request not found for assigned vendor', {}, req, false)
            );
        }

        const ownerName = [ownerVendor?.first_name, ownerVendor?.last_name]
            .filter(Boolean)
            .join(' ')
            .trim() || 'Vendor';

        const assignedVendorName = [assignedVendor?.first_name, assignedVendor?.last_name]
            .filter(Boolean)
            .join(' ')
            .trim() || 'Vendor';

        const now = new Date();

        const readableCompletedAt = formatReadableDate(now);
        const readableConfirmedAt = formatReadableDate(now);
        const readableRequestedAt = formatReadableDate(booking.completion_requested_at);

        await Booking.update(
            {
                status: 'COMPLETED',
                completion_confirmed_by: ownerToken,
                completion_confirmed_at: now,
                completed_at: now,
                completion_rejected_at: null,
                completion_rejection_reason: null,
                auto_complete_at: null
            },
            {
                where: { id: booking.id },
                transaction: t
            }
        );

        await BookingRequest.update(
            {
                status: 'COMPLETED'
            },
            {
                where: {
                    token: activeBookingRequest.token,
                    booking_token: booking.token,
                    requested_by_vendor_token: booking.assigned_vendor_token,
                    owner_vendor_token: booking.vendor_token,
                    status: 'COMPLETION_REQUESTED'
                },
                transaction: t
            }
        );

        await t.commit();

        res.status(200).json(
            responseData(
                'Booking completed successfully',
                {
                    booking_token: booking.token,
                    booking_request_token: activeBookingRequest.token,
                    accept_type: booking.accept_type,
                    status: 'COMPLETED',
                    completed_at: now,
                    completed_at_readable: readableCompletedAt,
                    completion_confirmed_by: ownerToken,
                    completion_confirmed_by_name: ownerName,
                    completion_confirmed_at: now,
                    completion_confirmed_at_readable: readableConfirmedAt,
                    owner_vendor_token: booking.vendor_token,
                    owner_vendor_name: ownerName,
                    assigned_vendor_token: booking.assigned_vendor_token,
                    assigned_vendor_name: assignedVendorName,
                    completion_requested_by: booking.completion_requested_by,
                    completion_requested_at: booking.completion_requested_at,
                    completion_requested_at_readable: readableRequestedAt
                },
                req,
                true
            )
        );

        try {
            await bookingCompletionQueue.add('BOOKING_COMPLETION_CONFIRMED', {
                booking_token: booking.token,
                booking_request_token: activeBookingRequest.token,
                accept_type: booking.accept_type,
                owner_token: booking.vendor_token,
                owner_name: ownerName,
                assigned_vendor_token: booking.assigned_vendor_token,
                assigned_vendor_name: assignedVendorName,
                sender_token: ownerToken,
                sender_name: ownerName,
                vehicle_type: booking.vehicle_type,
                city: booking.city,
                completed_at: now,
                completed_at_readable: readableCompletedAt,
                completion_confirmed_at: now,
                completion_confirmed_at_readable: readableConfirmedAt,
                completion_requested_at: booking.completion_requested_at,
                completion_requested_at_readable: readableRequestedAt,
                notification_title: 'Completion Confirmed',
                notification_body: `${ownerName} confirmed booking completion on ${readableConfirmedAt}`
            });
        } catch (queueError) {
            console.error('BOOKING_COMPLETION_CONFIRMED queue error:', queueError);
        }

        try {
            const io = getIO?.();

            io?.to(`vendor:${booking.assigned_vendor_token}`).emit('booking:completion-confirmed', {
                booking_token: booking.token,
                booking_request_token: activeBookingRequest.token,
                accept_type: booking.accept_type,
                status: 'COMPLETED',
                owner_token: booking.vendor_token,
                owner_name: ownerName,
                assigned_vendor_token: booking.assigned_vendor_token,
                assigned_vendor_name: assignedVendorName,
                completion_confirmed_by: ownerToken,
                completion_confirmed_by_name: ownerName,
                completion_confirmed_at: now,
                completion_confirmed_at_readable: readableConfirmedAt,
                completed_at: now,
                completed_at_readable: readableCompletedAt,
                completion_requested_at: booking.completion_requested_at,
                completion_requested_at_readable: readableRequestedAt,
                message: `${ownerName} confirmed booking completion on ${readableConfirmedAt}`
            });

            io?.to(`vendor:${booking.vendor_token}`).emit('booking:completion-confirmed', {
                booking_token: booking.token,
                booking_request_token: activeBookingRequest.token,
                accept_type: booking.accept_type,
                status: 'COMPLETED',
                owner_token: booking.vendor_token,
                owner_name: ownerName,
                assigned_vendor_token: booking.assigned_vendor_token,
                assigned_vendor_name: assignedVendorName,
                completion_confirmed_by: ownerToken,
                completion_confirmed_by_name: ownerName,
                completion_confirmed_at: now,
                completion_confirmed_at_readable: readableConfirmedAt,
                completed_at: now,
                completed_at_readable: readableCompletedAt,
                completion_requested_at: booking.completion_requested_at,
                completion_requested_at_readable: readableRequestedAt,
                role: 'owner',
                message: `${ownerName} confirmed booking completion on ${readableConfirmedAt}`
            });
        } catch (socketError) {
            console.error('booking:completion-confirmed socket error:', socketError);
        }
    } catch (error) {
        if (!t.finished) {
            await t.rollback();
        }

        console.error('Confirm booking completion error:', error);

        return res.status(500).json(
            responseData('Error occurred', {}, req, false)
        );
    }
});

// approval-bid completion dispute
router.post('/booking/:token/raise-completion-dispute', [vendorMiddleware, verifiedOnly], async (req, res) => {
    const t = await db.sequelize.transaction();

    try {
        const bookingToken = req.params.token;
        const ownerToken = req.user.token;
        const { dispute_reason, dispute_proof } = req.body;

        const booking = await Booking.findOne({
            where: { token: bookingToken },
            attributes: [
                'id',
                'token',
                'vendor_token',
                'assigned_vendor_token',
                'accept_type',
                'status',
                'completion_requested_by',
                'completion_requested_at',
                'vehicle_type',
                'city'
            ],
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!booking) {
            await t.rollback();
            return res.status(404).json(
                responseData('Booking not found', {}, req, false)
            );
        }

        if (!['APPROVAL', 'BID'].includes(booking.accept_type)) {
            await t.rollback();
            return res.status(400).json(
                responseData('Dispute can only be raised for approval or bid bookings', {}, req, false)
            );
        }

        if (booking.vendor_token !== ownerToken) {
            await t.rollback();
            return res.status(403).json(
                responseData('Only booking owner can raise a completion dispute', {}, req, false)
            );
        }

        if (!booking.assigned_vendor_token) {
            await t.rollback();
            return res.status(400).json(
                responseData('No assigned vendor found for this booking', {}, req, false)
            );
        }

        if (booking.status !== 'COMPLETION_REQUESTED') {
            await t.rollback();
            return res.status(400).json(
                responseData(
                    `Dispute cannot be raised in ${booking.status} status`,
                    {},
                    req,
                    false
                )
            );
        }

        if (!dispute_reason || !String(dispute_reason).trim()) {
            await t.rollback();
            return res.status(400).json(
                responseData('Dispute reason is required', {}, req, false)
            );
        }

        const [ownerVendor, assignedVendor] = await Promise.all([
            Vendor.findOne({
                where: { token: booking.vendor_token },
                attributes: ['token', 'first_name', 'last_name'],
                transaction: t
            }),
            Vendor.findOne({
                where: { token: booking.assigned_vendor_token },
                attributes: ['token', 'first_name', 'last_name'],
                transaction: t
            })
        ]);

        const ownerName = [ownerVendor?.first_name, ownerVendor?.last_name].filter(Boolean).join(' ').trim() || 'Vendor';
        const assignedVendorName = [assignedVendor?.first_name, assignedVendor?.last_name].filter(Boolean).join(' ').trim() || 'Vendor';

        const now = new Date();
        const readableDisputedAt = formatReadableDate(now);
        const readableRequestedAt = formatReadableDate(booking.completion_requested_at);

        await Booking.update(
            {
                status: 'COMPLETION_DISPUTED',
                completion_rejected_at: now,
                completion_rejection_reason: dispute_reason,
                completion_confirmed_by: null,
                completion_confirmed_at: null,
                auto_complete_at: null,
                completion_proof: dispute_proof || null
            },
            {
                where: { id: booking.id },
                transaction: t
            }
        );

        await t.commit();

        res.status(200).json(
            responseData(
                'Completion dispute raised successfully',
                {
                    booking_token: booking.token,
                    accept_type: booking.accept_type,
                    status: 'COMPLETION_DISPUTED',
                    owner_vendor_token: booking.vendor_token,
                    owner_vendor_name: ownerName,
                    assigned_vendor_token: booking.assigned_vendor_token,
                    assigned_vendor_name: assignedVendorName,
                    dispute_reason: dispute_reason,
                    dispute_raised_at: now,
                    dispute_raised_at_readable: readableDisputedAt,
                    completion_requested_at: booking.completion_requested_at,
                    completion_requested_at_readable: readableRequestedAt
                },
                req,
                true
            )
        );

        try {
            await bookingCompletionQueue.add('BOOKING_COMPLETION_DISPUTED', {
                booking_token: booking.token,
                accept_type: booking.accept_type,
                owner_token: booking.vendor_token,
                owner_name: ownerName,
                assigned_vendor_token: booking.assigned_vendor_token,
                assigned_vendor_name: assignedVendorName,
                sender_token: ownerToken,
                sender_name: ownerName,
                vehicle_type: booking.vehicle_type,
                city: booking.city,
                dispute_reason: dispute_reason,
                dispute_raised_at: now,
                dispute_raised_at_readable: readableDisputedAt,
                completion_requested_at: booking.completion_requested_at,
                completion_requested_at_readable: readableRequestedAt,
                notification_title: 'Completion Dispute Raised',
                notification_body: `${ownerName} raised a dispute on ${readableDisputedAt}`
            });
        } catch (queueError) {
            console.error('BOOKING_COMPLETION_DISPUTED queue error:', queueError);
        }

        try {
            const io = getIO?.();

            io?.to(`vendor:${booking.assigned_vendor_token}`).emit('booking:completion-disputed', {
                booking_token: booking.token,
                accept_type: booking.accept_type,
                status: 'COMPLETION_DISPUTED',
                owner_token: booking.vendor_token,
                owner_name: ownerName,
                assigned_vendor_token: booking.assigned_vendor_token,
                assigned_vendor_name: assignedVendorName,
                dispute_reason: dispute_reason,
                dispute_raised_at: now,
                dispute_raised_at_readable: readableDisputedAt,
                completion_requested_at: booking.completion_requested_at,
                completion_requested_at_readable: readableRequestedAt,
                message: `${ownerName} raised a dispute on ${readableDisputedAt}`
            });

            io?.to(`vendor:${booking.vendor_token}`).emit('booking:completion-disputed', {
                booking_token: booking.token,
                accept_type: booking.accept_type,
                status: 'COMPLETION_DISPUTED',
                owner_token: booking.vendor_token,
                owner_name: ownerName,
                assigned_vendor_token: booking.assigned_vendor_token,
                assigned_vendor_name: assignedVendorName,
                dispute_reason: dispute_reason,
                dispute_raised_at: now,
                dispute_raised_at_readable: readableDisputedAt,
                completion_requested_at: booking.completion_requested_at,
                completion_requested_at_readable: readableRequestedAt,
                role: 'owner',
                message: `${ownerName} raised a dispute on ${readableDisputedAt}`
            });
        } catch (socketError) {
            console.error('booking:completion-disputed socket error:', socketError);
        }
    } catch (error) {
        await t.rollback();
        console.error('Raise completion dispute error:', error);

        return res.status(500).json(
            responseData('Error occurred', {}, req, false)
        );
    }
});

// advance request
router.post("/request-advance", [vendorMiddleware, verifiedOnly], async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
        const {
            booking_token,
            booking_request_token,
            requested_advance_amount,
            message = null,
            expires_at = null
        } = req.body;

        const ownerVendorToken = req.user.token;

        if (!booking_token || !booking_request_token || !requested_advance_amount) {
            await transaction.rollback();
            return res.status(400).json(
                responseData(
                    "booking_token, booking_request_token and requested_advance_amount are required",
                    {},
                    req,
                    false
                )
            );
        }

        const amount = Number(requested_advance_amount);

        if (!Number.isFinite(amount) || amount <= 0) {
            await transaction.rollback();
            return res.status(400).json(
                responseData(
                    "requested_advance_amount must be greater than 0",
                    {},
                    req,
                    false
                )
            );
        }

        const booking = await Booking.findOne({
            where: {
                token: booking_token,
                flag: 0
            },
            raw: true,
            transaction
        });

        if (!booking) {
            await transaction.rollback();
            return res.status(404).json(
                responseData("Booking not found", {}, req, false)
            );
        }

        if (booking.vendor_token !== ownerVendorToken) {
            await transaction.rollback();
            return res.status(403).json(
                responseData("Only booking owner can request advance", {}, req, false)
            );
        }

        if (!booking.secure_booking) {
            await transaction.rollback();
            return res.status(400).json(
                responseData("Advance request is allowed only for secure bookings", {}, req, false)
            );
        }

        const bookingRequest = await BookingRequest.findOne({
            where: {
                token: booking_request_token,
                booking_token,
                flag: 0
            },
            raw: true,
            transaction
        });

        if (!bookingRequest) {
            await transaction.rollback();
            return res.status(404).json(
                responseData("Booking request not found", {}, req, false)
            );
        }

        const bidderVendorToken = bookingRequest.requested_by_vendor_token;

        if (!bidderVendorToken) {
            await transaction.rollback();
            return res.status(400).json(
                responseData("Requested vendor not found for this booking request", {}, req, false)
            );
        }

        if (bidderVendorToken === ownerVendorToken) {
            await transaction.rollback();
            return res.status(400).json(
                responseData("Owner cannot request advance from self", {}, req, false)
            );
        }

        const existingAdvanceRequest = await BookingAdvanceRequest.findOne({
            where: {
                booking_request_token,
                is_active: true,
                status: {
                    [Op.in]: ["REQUESTED", "COUNTERED", "ACCEPTED", "PAYMENT_PENDING"]
                },
                flag: 0
            },
            raw: true,
            transaction
        });

        if (existingAdvanceRequest) {
            await transaction.rollback();
            return res.status(400).json(
                responseData(
                    "An active advance request already exists for this booking request",
                    existingAdvanceRequest,
                    req,
                    false
                )
            );
        }

        let parsedExpiry = null;

        if (expires_at) {
            parsedExpiry = new Date(expires_at);

            if (isNaN(parsedExpiry.getTime())) {
                await transaction.rollback();
                return res.status(400).json(
                    responseData("Invalid expires_at value", {}, req, false)
                );
            }
        }

        const advanceRequestToken = randomstring(64);
        const historyToken = randomstring(64);

        const advanceRequestData = {
            token: advanceRequestToken,
            booking_token,
            booking_request_token,
            owner_vendor_token: ownerVendorToken,
            bidder_vendor_token: bidderVendorToken,
            requested_advance_amount: amount,
            responded_advance_amount: null,
            final_advance_amount: null,
            currency: "INR",
            owner_message: message,
            bidder_message: null,
            status: "REQUESTED",
            requested_at: new Date(),
            responded_at: null,
            accepted_at: null,
            expires_at: parsedExpiry,
            payment_status: "UNPAID",
            payment_token: null,
            wallet_hold_token: null,
            is_active: true,
            flag: 0
        };

        const createdAdvanceRequest = await BookingAdvanceRequest.create(
            advanceRequestData,
            { transaction }
        );

        await sendAdvanceRequestMessage({
            booking_token,
            ownerVendorToken,
            requester_token: bidderVendorToken,
            requested_advance_amount: amount,
            booking_request_token
        });

        await BookingAdvanceRequestHistory.create(
            {
                token: historyToken,
                advance_request_token: advanceRequestToken,
                booking_token,
                booking_request_token,
                actor_token: ownerVendorToken,
                actor_role: "OWNER",
                action: "OWNER_REQUESTED_ADVANCE",
                previous_amount: null,
                amount,
                message,
                meta: {
                    secure_booking: booking.secure_booking,
                    booking_status: booking.status,
                    booking_accept_type: booking.accept_type
                },
                flag: 0
            },
            { transaction }
        );

        await Notification.create(
            {
                token: randomstring(64),
                sender_token: ownerVendorToken,
                receiver_token: bidderVendorToken,
                title: "Advance Request Received",
                message: `आपको secure booking के लिए advance request मिली है। Amount: ₹${amount}`,
                type: "BOOKING_ADVANCE_REQUEST",
                reference_token: advanceRequestToken,
                flag: 0
            },
            { transaction }
        );

        await transaction.commit();

        res.status(201).json(
            responseData(
                "Advance request sent successfully",
                createdAdvanceRequest,
                req,
                true
            )
        );

        const io = getIO();

        const conversation = await Conversation.findOne({
            where: { booking_token },
            raw: true,
        });

        if (conversation) {
            const room = `conversation:${conversation.token}`;

            const payload = {
                advance_request_token: advanceRequestToken,
                advance_request_status: "REQUESTED",
                advance_payment_status: "UNPAID",
                requested_advance_amount: amount,
                final_advance_amount: amount,
                advance_requested_at: new Date(),
            };

            io.to(room).emit("bookingChatMeta", payload);

            io.to(room).emit("bookingMessages", {
                messages: [],
                ...payload,
            });
        }

    } catch (error) {
        if (transaction && !transaction.finished) {
            await transaction.rollback();
        }

        console.error("request-advance error:", error);

        return res.status(500).json(
            responseData("Server Error", {}, req, false)
        );
    }
});

// pay advance order create
router.post("/advance-payment/create-order", [vendorMiddleware, verifiedOnly], async (req, res) => {
    const transaction = await db.sequelize.transaction();
    try {
        const { advance_request_token } = req.body;
        const bidderVendorToken = req.user.token;

        if (!advance_request_token) {
            await transaction.rollback();
            return res.status(400).json(
                responseData("advance_request_token is required", {}, req, false)
            );
        }

        const advanceRequest = await BookingAdvanceRequest.findOne({
            where: {
                token: advance_request_token,
                bidder_vendor_token: bidderVendorToken,
                is_active: true,
                flag: 0,
            },
            raw: true,
            transaction,
        });

        if (!advanceRequest) {
            await transaction.rollback();
            return res.status(404).json(
                responseData("Advance request not found", {}, req, false)
            );
        }

        if (
            !["REQUESTED", "COUNTERED", "ACCEPTED", "PAYMENT_PENDING"].includes(
                advanceRequest.status
            )
        ) {
            await transaction.rollback();
            return res.status(400).json(
                responseData("Advance request is not payable", {}, req, false)
            );
        }

        if (advanceRequest.payment_status === "PAID") {
            await transaction.rollback();
            return res.status(400).json(
                responseData("Advance already paid", {}, req, false)
            );
        }

        const booking = await Booking.findOne({
            where: {
                token: advanceRequest.booking_token,
                flag: 0,
            },
            raw: true,
            transaction,
        });

        if (!booking) {
            await transaction.rollback();
            return res.status(404).json(
                responseData("Booking not found", {}, req, false)
            );
        }

        const bookingRequest = await BookingRequest.findOne({
            where: {
                token: advanceRequest.booking_request_token,
                booking_token: advanceRequest.booking_token,
                flag: 0,
            },
            raw: true,
            transaction,
        });

        if (!bookingRequest) {
            await transaction.rollback();
            return res.status(404).json(
                responseData("Booking request not found", {}, req, false)
            );
        }

        const payableAmount =
            Number(advanceRequest.final_advance_amount) ||
            Number(advanceRequest.responded_advance_amount) ||
            Number(advanceRequest.requested_advance_amount);

        if (!Number.isFinite(payableAmount) || payableAmount <= 0) {
            await transaction.rollback();
            return res.status(400).json(
                responseData("Invalid payable amount", {}, req, false)
            );
        }

        const amountInPaise = Math.round(payableAmount * 100);

        const receipt = `adv_${advanceRequest.id}_${Date.now()}`;

        const razorpayOrder = await razorpay.orders.create({
            amount: amountInPaise,
            currency: advanceRequest.currency || "INR",
            receipt,
            notes: {
                type: "BOOKING_ADVANCE",
                advance_request_token: advanceRequest.token,
                booking_token: advanceRequest.booking_token,
                booking_request_token: advanceRequest.booking_request_token,
                owner_vendor_token: advanceRequest.owner_vendor_token,
                bidder_vendor_token: advanceRequest.bidder_vendor_token,
            },
        });

        const paymentToken = randomstring(64);

        const paymentRow = await BookingPayment.create(
            {
                token: paymentToken,
                booking_token: advanceRequest.booking_token,
                payer_token: bidderVendorToken,
                payee_vendor_token: advanceRequest.owner_vendor_token,
                payment_for: "BOOKING_ADVANCE",
                amount: payableAmount,
                currency: advanceRequest.currency || "INR",
                razorpay_order_id: razorpayOrder.id,
                razorpay_payment_id: null,
                razorpay_signature: null,
                receipt: receipt,
                order_status: "CREATED",
                payment_status: "UNPAID",
                refund_status: "NONE",
                meta: {
                    advance_request_token: advanceRequest.token,
                    booking_request_token: advanceRequest.booking_request_token,
                    requested_advance_amount: advanceRequest.requested_advance_amount,
                    responded_advance_amount: advanceRequest.responded_advance_amount,
                    final_advance_amount: advanceRequest.final_advance_amount,
                    payment_receiver: "PLATFORM",
                },
            },
            { transaction }
        );

        await BookingAdvanceRequest.update(
            {
                payment_status: "PENDING",
                status: "PAYMENT_PENDING",
                payment_token: paymentToken,
            },
            {
                where: { token: advanceRequest.token },
                transaction,
            }
        );

        await BookingAdvanceRequestHistory.create(
            {
                token: randomstring(64),
                advance_request_token: advanceRequest.token,
                booking_token: advanceRequest.booking_token,
                booking_request_token: advanceRequest.booking_request_token,
                actor_token: bidderVendorToken,
                actor_role: "BIDDER",
                action: "PAYMENT_INITIATED",
                previous_amount: null,
                amount: payableAmount,
                message: "Advance payment order created",
                meta: {
                    payment_token: paymentToken,
                    razorpay_order_id: razorpayOrder.id,
                    order_status: "CREATED",
                },
                flag: 0,
            },
            { transaction }
        );

        await transaction.commit();

        return res.status(200).json(
            responseData(
                "Advance payment order created successfully",
                {
                    advance_request_token: advanceRequest.token,
                    booking_token: advanceRequest.booking_token,
                    booking_request_token: advanceRequest.booking_request_token,
                    payment_token: paymentToken,
                    amount: payableAmount,
                    currency: advanceRequest.currency || "INR",
                    razorpay_order_id: razorpayOrder.id,
                    razorpay_key: RAZORPAY_KEY_ID,
                    order_status: "CREATED",
                },
                req,
                true
            )
        );
    } catch (error) {
        await transaction.rollback();
        console.error("advance-payment/create-order error:", error);
        return res.status(500).json(
            responseData("Server Error", {}, req, false)
        );
    }
});

// pay advance payment verify
router.post("/advance-payment/verify", [vendorMiddleware, verifiedOnly], async (req, res) => {
    const transaction = await db.sequelize.transaction();
    try {
        const {
            advance_request_token,
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
        } = req.body;

        const bidderVendorToken = req.user.token;

        if (
            !advance_request_token ||
            !razorpay_order_id ||
            !razorpay_payment_id ||
            !razorpay_signature
        ) {
            await transaction.rollback();
            return res.status(400).json(
                responseData("Missing payment verification fields", {}, req, false)
            );
        }

        const advanceRequest = await BookingAdvanceRequest.findOne({
            where: {
                token: advance_request_token,
                bidder_vendor_token: bidderVendorToken,
                is_active: true,
                flag: 0,
            },
            raw: true,
            transaction,
        });

        if (!advanceRequest) {
            await transaction.rollback();
            return res.status(404).json(
                responseData("Advance request not found", {}, req, false)
            );
        }

        const payment = await BookingPayment.findOne({
            where: {
                token: advanceRequest.payment_token,
                booking_token: advanceRequest.booking_token,
            },
            transaction,
        });

        if (!payment) {
            await transaction.rollback();
            return res.status(404).json(
                responseData("Payment record not found", {}, req, false)
            );
        }

        const generatedSignature = crypto
            .createHmac("sha256", RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest("hex");

        if (generatedSignature !== razorpay_signature) {
            await transaction.rollback();
            return res.status(400).json(
                responseData("Invalid payment signature", {}, req, false)
            );
        }

        payment.razorpay_payment_id = razorpay_payment_id;
        payment.razorpay_signature = razorpay_signature;
        payment.order_status = "PAID";
        payment.payment_status = "PAID";
        payment.paid_at = new Date();
        payment.meta = {
            ...(payment.meta || {}),
            payment_receiver: "PLATFORM",
            verified: true,
        };

        await payment.save({ transaction });

        await BookingAdvanceRequest.update(
            {
                payment_status: "PAID",
                status: "PAID",
            },
            {
                where: { token: advanceRequest.token },
                transaction,
            }
        );

        await BookingAdvanceRequestHistory.create(
            {
                token: randomstring(64),
                advance_request_token: advanceRequest.token,
                booking_token: advanceRequest.booking_token,
                booking_request_token: advanceRequest.booking_request_token,
                actor_token: bidderVendorToken,
                actor_role: "BIDDER",
                action: "PAYMENT_SUCCESS",
                previous_amount: null,
                amount: Number(payment.amount),
                message: "Advance payment completed successfully",
                meta: {
                    payment_token: payment.token,
                    razorpay_order_id,
                    razorpay_payment_id,
                },
                flag: 0,
            },
            { transaction }
        );

        const owner = await Vendor.findOne({
            where: { token: advanceRequest.owner_vendor_token },
            attributes: ["token"],
            raw: true,
            transaction,
        });

        if (owner) {
            await Notification.create(
                {
                    sender_token: bidderVendorToken,
                    receiver_token: advanceRequest.owner_vendor_token,
                    type: "BOOKING_ADVANCE_PAID",
                    title: "Advance Payment Received",
                    message: `Secure booking ke liye advance payment successful ho gaya hai.`,
                    payload: {
                        advance_request_token: advanceRequest.token,
                        booking_token: advanceRequest.booking_token,
                        booking_request_token: advanceRequest.booking_request_token,
                        amount: Number(payment.amount),
                        currency: payment.currency,
                        payment_token: payment.token,
                        payment_status: "PAID",
                    },
                },
                { transaction }
            );
        }

        await transaction.commit();

        const io = getIO();
        io.to(`vendor:${advanceRequest.owner_vendor_token}`).emit(
            "booking:advance-paid",
            {
                advance_request_token: advanceRequest.token,
                booking_token: advanceRequest.booking_token,
                booking_request_token: advanceRequest.booking_request_token,
                amount: Number(payment.amount),
                currency: payment.currency,
                payment_status: "PAID",
                payment_token: payment.token,
            }
        );

        return res.status(200).json(
            responseData(
                "Advance payment verified successfully",
                {
                    advance_request_token: advanceRequest.token,
                    booking_token: advanceRequest.booking_token,
                    booking_request_token: advanceRequest.booking_request_token,
                    payment_token: payment.token,
                    amount: Number(payment.amount),
                    currency: payment.currency,
                    payment_status: "PAID",
                    razorpay_order_id,
                    razorpay_payment_id,
                },
                req,
                true
            )
        );
    } catch (error) {
        await transaction.rollback();
        console.error("advance-payment/verify error:", error);
        return res.status(500).json(
            responseData("Server Error", {}, req, false)
        );
    }
});

router.get("/leads/list", [vendorMiddleware, verifiedOnly], async (req, res) => {
    try {
        let {
            page = 1,
            limit = 12,
            services,
            status,
            search,
            from_date,
            to_date,
            cities
        } = req.query;

        page = parseInt(page, 10) || 1;
        limit = parseInt(limit, 10) || 12;

        const validServices = ["cab", "flight", "hotel", "holiday", "insurance"];
        let totalLeads = null;

        const selectedServices = String(services || "")
            .split(",")
            .map((item) => item.trim().toLowerCase())
            .filter((item) => validServices.includes(item));

        if (!selectedServices.length) {
            return res.status(400).json(
                responseData(
                    "Please provide valid services. Example: services=cab,flight,hotel",
                    {},
                    req,
                    false
                )
            );
        }

        const rawCities = String(cities || "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);

        if (cities && !rawCities.length) {
            return res.status(400).json(
                responseData(
                    "Please provide valid cities. Example: cities=Delhi,Mumbai",
                    {},
                    req,
                    false
                )
            );
        }

        if (rawCities.length > 5) {
            return res.status(400).json(
                responseData(
                    "You can select maximum 5 cities only",
                    {},
                    req,
                    false
                )
            );
        }

        const selectedCities = rawCities;
        const vendorToken = req.user.token;
        const now = new Date();

        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);

        const tomorrowStart = new Date(todayStart);
        tomorrowStart.setDate(tomorrowStart.getDate() + 1);

        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        monthStart.setHours(0, 0, 0, 0);

        const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        nextMonthStart.setHours(0, 0, 0, 0);

        const weekStart = new Date(now);
        const day = weekStart.getDay();
        const diffToMonday = day === 0 ? -6 : 1 - day;
        weekStart.setDate(weekStart.getDate() + diffToMonday);
        weekStart.setHours(0, 0, 0, 0);

        const nextWeekStart = new Date(weekStart);
        nextWeekStart.setDate(nextWeekStart.getDate() + 7);

        const Vendor = db.vendor;
        const FlightEnquiry = db.flightEnquiry;
        const HotelEnquiry = db.hotelEnquiry;
        const HolidayPackageEnquiry = db.holydaypackageEnquiry;
        const InsuranceEnquiry = db.insuranceEnquiry;
        const Vehicle = db.AddVehicle;

        const vendorSettingsPromise = Vendor.findOne({
            where: {
                token: vendorToken,
                flag: 0
            },
            attributes: [
                "booking_notification_enabled",
                "customer_notification_enabled",
                "notification_trip_type",
                "notification_vehicle_type",
                "notification_city",
                "notification_state"
            ],
            raw: true
        });

        const serviceConfig = {
            cab: {
                model: db.CabEnquiry,
                enquiryType: "cab",
                attributes: [
                    "id",
                    "token",
                    "vehicle_token",
                    "vendor_token",
                    "who_posted",
                    "from_web",
                    "trip_type",
                    "from_location",
                    "to_location",
                    "departure_date",
                    "return_date",
                    "car_type",
                    "contact",
                    "status",
                    "flag",
                    "create_date",
                    "update_date"
                ],
                searchFields: ["from_location", "to_location", "car_type", "contact"],
                cityField: "from_location"
            },

            flight: {
                model: FlightEnquiry,
                enquiryType: "flight",
                attributes: [
                    "id",
                    "token",
                    "vendor_token",
                    "who_posted",
                    "from_web",
                    "trip_type",
                    "from_location",
                    "to_location",
                    "departure_date",
                    "return_date",
                    "adults",
                    "children",
                    "class_type",
                    "segments",
                    "status",
                    "flag",
                    "create_date",
                    "update_date"
                ],
                searchFields: ["from_location", "to_location", "class_type"],
                cityField: "from_location"
            },

            hotel: {
                model: HotelEnquiry,
                enquiryType: "hotel",
                attributes: [
                    "id",
                    "token",
                    "vendor_token",
                    "who_posted",
                    "from_web",
                    "area",
                    "check_in",
                    "check_out",
                    "adults",
                    "children",
                    "room_type",
                    "status",
                    "flag",
                    "create_date",
                    "update_date"
                ],
                searchFields: ["area", "room_type"],
                cityField: "area"
            },

            holiday: {
                model: HolidayPackageEnquiry,
                enquiryType: "holiday_package",
                attributes: [
                    "id",
                    "token",
                    "vendor_token",
                    "who_posted",
                    "from_web",
                    "from_city",
                    "to_city",
                    "departure_date",
                    "adults",
                    "children",
                    "room_type",
                    "status",
                    "flag",
                    "create_date",
                    "update_date"
                ],
                searchFields: ["from_city", "to_city", "room_type"],
                cityField: "from_city"
            },

            insurance: {
                model: InsuranceEnquiry,
                enquiryType: "insurance",
                attributes: [
                    "id",
                    "token",
                    "vendor_token",
                    "from_web",
                    "car_number",
                    "name",
                    "contact",
                    "agree_policy",
                    "whatsapp",
                    "status",
                    "flag",
                    "create_date",
                    "update_date"
                ],
                searchFields: ["car_number", "name", "contact"],
                cityField: null
            }
        };

        const allServices = Object.keys(serviceConfig);

        const buildWhere = (serviceKey) => {
            const whereCondition = {
                flag: 0
            };

            if (status) {
                whereCondition.status = status;
            }

            if (from_date || to_date) {
                whereCondition.create_date = {};

                if (from_date) {
                    whereCondition.create_date[Op.gte] = new Date(from_date);
                }

                if (to_date) {
                    const endDate = new Date(to_date);
                    endDate.setHours(23, 59, 59, 999);
                    whereCondition.create_date[Op.lte] = endDate;
                }
            }

            if (search) {
                whereCondition[Op.or] = serviceConfig[serviceKey].searchFields.map((field) => ({
                    [field]: {
                        [Op.like]: `%${search}%`
                    }
                }));
            }

            if (selectedCities.length && serviceConfig[serviceKey].cityField) {
                whereCondition[Op.and] = whereCondition[Op.and] || [];
                whereCondition[Op.and].push({
                    [Op.or]: selectedCities.map((city) => ({
                        [serviceConfig[serviceKey].cityField]: {
                            [Op.like]: `%${city}%`
                        }
                    }))
                });
            }

            return whereCondition;
        };

        const buildVendorInclude = (serviceKey) => {
            const includeWhere = {
                flag: 0,
                status: "active"
            };

            if (selectedCities.length && serviceKey === "insurance") {
                includeWhere[Op.and] = [
                    {
                        [Op.or]: selectedCities.map((city) => ({
                            city: {
                                [Op.like]: `%${city}%`
                            }
                        }))
                    }
                ];
            }

            return [
                {
                    model: Vendor,
                    as: "vendor_details",
                    required: selectedCities.length > 0 && serviceKey === "insurance",
                    attributes: [
                        "token",
                        "first_name",
                        "last_name",
                        "contact",
                        "alt_contact",
                        "email",
                        "city",
                        "state"
                    ],
                    where: includeWhere
                }
            ];
        };

        const buildAdditionalIncludes = (serviceKey) => {
            const includes = [...buildVendorInclude(serviceKey)];

            if (serviceKey === "cab") {
                includes.push({
                    model: Vehicle,
                    as: "vehicle_details",
                    required: false,
                    attributes: [
                        "token",
                        "name",
                        "type",
                        "seater",
                        "avg_per_km",
                        "ac",
                        "gps",
                        "availability",
                        "image1",
                        "image2",
                        "status"
                    ]
                });
            }

            return includes;
        };

        const fetchServiceData = async (serviceKey) => {
            const config = serviceConfig[serviceKey];
            const whereCondition = buildWhere(serviceKey);

            const rows = await config.model.findAll({
                where: whereCondition,
                attributes: config.attributes,
                include: buildAdditionalIncludes(serviceKey),
                order: [["create_date", "DESC"]]
            });

            return rows.map((item) => {
                const row = item.toJSON ? item.toJSON() : item;
                const vendor = row.vendor_details || null;
                const vehicle = row.vehicle_details || null;

                const leadContact =
                    row.from_web === true
                        ? row.contact || null
                        : vendor?.contact || vendor?.alt_contact || null;

                const leadName =
                    row.from_web === true
                        ? row.name || null
                        : vendor
                            ? [vendor.first_name, vendor.last_name].filter(Boolean).join(" ").trim() || null
                            : null;

                return {
                    service: serviceKey,
                    enquiry_type: config.enquiryType,
                    id: row.id,
                    token: row.token,
                    vehicle_token: row.vehicle_token || null,
                    vendor_token: row.vendor_token || null,
                    who_posted: row.who_posted || null,
                    from_web: row.from_web,
                    status: row.status,
                    flag: row.flag,
                    create_date: row.create_date,
                    update_date: row.update_date,
                    lead_contact: leadContact,
                    lead_name: leadName,
                    vendor_details: vendor
                        ? {
                            token: vendor.token,
                            name: [vendor.first_name, vendor.last_name].filter(Boolean).join(" ").trim() || null,
                            contact: vendor.contact || null,
                            alt_contact: vendor.alt_contact || null,
                            email: vendor.email || null,
                            city: vendor.city || null,
                            state: vendor.state || null
                        }
                        : null,
                    details:
                        serviceKey === "cab"
                            ? {
                                trip_type: row.trip_type,
                                from_location: row.from_location,
                                to_location: row.to_location,
                                departure_date: row.departure_date,
                                return_date: row.return_date,
                                car_type: row.car_type,
                                vehicle: vehicle
                                    ? {
                                        token: vehicle.token || null,
                                        name: vehicle.name || null,
                                        type: vehicle.type || null,
                                        seater: vehicle.seater ?? null,
                                        avg_per_km: vehicle.avg_per_km ?? null,
                                        ac: vehicle.ac ?? null,
                                        gps: vehicle.gps ?? null,
                                        availability: vehicle.availability || null,
                                        image1: vehicle.image1 || null,
                                        image2: vehicle.image2 || null,
                                        status: vehicle.status || null
                                    }
                                    : null
                            }
                            : serviceKey === "flight"
                                ? {
                                    trip_type: row.trip_type,
                                    from_location: row.from_location,
                                    to_location: row.to_location,
                                    departure_date: row.departure_date,
                                    return_date: row.return_date,
                                    adults: row.adults,
                                    children: row.children,
                                    class_type: row.class_type,
                                    segments: row.segments
                                }
                                : serviceKey === "hotel"
                                    ? {
                                        area: row.area,
                                        check_in: row.check_in,
                                        check_out: row.check_out,
                                        adults: row.adults,
                                        children: row.children,
                                        room_type: row.room_type
                                    }
                                    : serviceKey === "holiday"
                                        ? {
                                            from_city: row.from_city,
                                            to_city: row.to_city,
                                            departure_date: row.departure_date,
                                            adults: row.adults,
                                            children: row.children,
                                            room_type: row.room_type
                                        }
                                        : {
                                            car_number: row.car_number,
                                            name: row.name,
                                            contact: row.contact,
                                            agree_policy: row.agree_policy,
                                            whatsapp: row.whatsapp
                                        }
                };
            });
        };

        const fetchTotalLeadsCounters = async () => {
            const [
                cabTotal,
                flightTotal,
                hotelTotal,
                holidayTotal,
                insuranceTotal
            ] = await Promise.all([
                db.CabEnquiry.count({
                    where: { flag: 0 }
                }),
                FlightEnquiry.count({
                    where: { flag: 0 }
                }),
                HotelEnquiry.count({
                    where: { flag: 0 }
                }),
                HolidayPackageEnquiry.count({
                    where: { flag: 0 }
                }),
                InsuranceEnquiry.count({
                    where: { flag: 0 }
                })
            ]);

            totalLeads =
                cabTotal +
                flightTotal +
                hotelTotal +
                holidayTotal +
                insuranceTotal;

            return {
                total_leads: totalLeads,
                service_wise: [
                    {
                        service: "cab",
                        total: cabTotal
                    },
                    {
                        service: "flight",
                        total: flightTotal
                    },
                    {
                        service: "hotel",
                        total: hotelTotal
                    },
                    {
                        service: "holiday",
                        total: holidayTotal
                    },
                    {
                        service: "insurance",
                        total: insuranceTotal
                    }
                ]
            };
        };

        const fetchAcceptedLeadCounters = async (serviceKey = null) => {
            const baseWhere = {
                requester_token: vendorToken,
                status: "ACCEPTED",
                flag: 0
            };

            if (serviceKey) {
                baseWhere.enquiry_type = serviceConfig[serviceKey].enquiryType;
            } else {
                baseWhere.enquiry_type = {
                    [Op.in]: allServices.map((service) => serviceConfig[service].enquiryType)
                };
            }

            const [
                totalAccepted,
                monthlyAccepted,
                weeklyAccepted,
                todayAccepted
            ] = await Promise.all([
                db.enquiryRequest.count({
                    where: baseWhere
                }),
                db.enquiryRequest.count({
                    where: {
                        ...baseWhere,
                        created_at: {
                            [Op.gte]: monthStart,
                            [Op.lt]: nextMonthStart
                        }
                    }
                }),
                db.enquiryRequest.count({
                    where: {
                        ...baseWhere,
                        created_at: {
                            [Op.gte]: weekStart,
                            [Op.lt]: nextWeekStart
                        }
                    }
                }),
                db.enquiryRequest.count({
                    where: {
                        ...baseWhere,
                        created_at: {
                            [Op.gte]: todayStart,
                            [Op.lt]: tomorrowStart
                        }
                    }
                })
            ]);

            return {
                service: serviceKey || "all",
                total_accepted: totalAccepted,
                monthly_accepted: monthlyAccepted,
                weekly_accepted: weeklyAccepted,
                today_accepted: todayAccepted
            };
        };

        const [
            vendorSettings,
            serviceRows,
            totalLeadsCounters,
            acceptedLeadCounters,
            acceptedLeadServiceWise
        ] = await Promise.all([
            vendorSettingsPromise,
            Promise.all(selectedServices.map((service) => fetchServiceData(service))),
            fetchTotalLeadsCounters(),
            fetchAcceptedLeadCounters(null),
            Promise.all(allServices.map((service) => fetchAcceptedLeadCounters(service)))
        ]);

        let mergedRows = serviceRows.flat();

        const enquiryTokensByType = {};

        for (const row of mergedRows) {
            if (!row?.token || !row?.enquiry_type) continue;

            if (!enquiryTokensByType[row.enquiry_type]) {
                enquiryTokensByType[row.enquiry_type] = [];
            }

            enquiryTokensByType[row.enquiry_type].push(row.token);
        }

        const enquiryRequestConditions = Object.entries(enquiryTokensByType)
            .filter(([, tokens]) => Array.isArray(tokens) && tokens.length)
            .map(([enquiryType, tokens]) => ({
                enquiry_type: enquiryType,
                enquiry_token: {
                    [Op.in]: [...new Set(tokens)]
                },
                requester_token: vendorToken,
                flag: 0
            }));

        let enquiryRequests = [];

        if (enquiryRequestConditions.length) {
            enquiryRequests = await db.enquiryRequest.findAll({
                where: {
                    [Op.or]: enquiryRequestConditions
                },
                attributes: [
                    "id",
                    "token",
                    "enquiry_type",
                    "enquiry_token",
                    "requester_token",
                    "vendor_token",
                    "amount",
                    "message",
                    "status",
                    "meta",
                    "created_at",
                    "updated_at"
                ],
                raw: true
            });
        }

        const enquiryRequestMap = new Map();

        for (const item of enquiryRequests) {
            const key = `${item.enquiry_type}__${item.enquiry_token}`;
            enquiryRequestMap.set(key, item);
        }

        mergedRows = mergedRows.map((row) => {
            const key = `${row.enquiry_type}__${row.token}`;
            const enquiryRequest = enquiryRequestMap.get(key) || null;

            return {
                ...row,
                has_requested: !!enquiryRequest,
                enquiry_request_status: enquiryRequest?.status || null,
                enquiry_request: enquiryRequest
                    ? {
                        id: enquiryRequest.id,
                        token: enquiryRequest.token,
                        requester_token: enquiryRequest.requester_token,
                        vendor_token: enquiryRequest.vendor_token,
                        amount: enquiryRequest.amount,
                        message: enquiryRequest.message,
                        status: enquiryRequest.status,
                        meta: enquiryRequest.meta,
                        created_at: enquiryRequest.created_at,
                        updated_at: enquiryRequest.updated_at
                    }
                    : null
            };
        });

        mergedRows.sort((a, b) => {
            const aDate = a.create_date ? new Date(a.create_date).getTime() : 0;
            const bDate = b.create_date ? new Date(b.create_date).getTime() : 0;
            return bDate - aDate;
        });

        const filteredTotal = mergedRows.length;
        const totalPages = Math.ceil(filteredTotal / limit);
        const startIndex = (page - 1) * limit;
        const paginatedRows = mergedRows.slice(startIndex, startIndex + limit);

        return res.status(200).json(
            responseData(
                "Leads fetched successfully",
                {
                    notification_settings: {
                        booking_notification_enabled: vendorSettings?.booking_notification_enabled ?? true,
                        customer_notification_enabled: vendorSettings?.customer_notification_enabled ?? true,
                        notification_trip_type: vendorSettings?.notification_trip_type ?? "ALL",
                        notification_vehicle_type: vendorSettings?.notification_vehicle_type ?? null,
                        notification_city: vendorSettings?.notification_city ?? null,
                        notification_state: vendorSettings?.notification_state ?? null
                    },

                    applied_filters: {
                        services: selectedServices,
                        cities: selectedCities,
                        status: status || null,
                        search: search || null,
                        from_date: from_date || null,
                        to_date: to_date || null
                    },

                    accepted_leads_counters: {
                        total_accepted: totalLeads,
                        monthly_accepted: acceptedLeadCounters.monthly_accepted,
                        weekly_accepted: acceptedLeadCounters.weekly_accepted,
                        today_accepted: acceptedLeadCounters.today_accepted,
                        service_wise: acceptedLeadServiceWise
                    },

                    total_leads_counters: totalLeadsCounters,

                    date_ranges: {
                        month_start: monthStart,
                        next_month_start: nextMonthStart,
                        week_start_monday: weekStart,
                        next_week_start_monday: nextWeekStart,
                        today_start: todayStart,
                        tomorrow_start: tomorrowStart
                    },

                    filtered_total: filteredTotal,
                    current_page: page,
                    per_page: limit,
                    total_pages: totalPages,
                    data: paginatedRows
                },
                req,
                true
            )
        );
    } catch (error) {
        console.log("get unified leads error:", error);
        return res.status(500).json(
            responseData(
                error.message || "Something went wrong",
                {},
                req,
                false
            )
        );
    }
});

router.get("/my/accepted-leads", [vendorMiddleware, verifiedOnly], async (req, res) => {
    try {
        let {
            page = 1,
            limit = 12,
            services,
            search,
            from_date,
            to_date
        } = req.query;

        const requesterToken = req.user.token;

        page = parseInt(page, 10) || 1;
        limit = parseInt(limit, 10) || 12;
        const offset = (page - 1) * limit;

        const validServices = ["cab", "flight", "hotel", "holiday_package", "insurance"];

        const selectedServices = String(services || "")
            .split(",")
            .map((item) => item.trim().toLowerCase())
            .filter((item) => validServices.includes(item));

        const whereCondition = {
            requester_token: requesterToken,
            status: "ACCEPTED",
            flag: 0
        };

        if (selectedServices.length) {
            whereCondition.enquiry_type = {
                [Op.in]: selectedServices
            };
        }

        if (from_date || to_date) {
            whereCondition.created_at = {};

            if (from_date) {
                whereCondition.created_at[Op.gte] = new Date(from_date);
            }

            if (to_date) {
                const endDate = new Date(to_date);
                endDate.setHours(23, 59, 59, 999);
                whereCondition.created_at[Op.lte] = endDate;
            }
        }

        const enquiryRequests = await db.enquiryRequest.findAndCountAll({
            where: whereCondition,
            attributes: [
                "id",
                "token",
                "enquiry_type",
                "enquiry_token",
                "requester_token",
                "vendor_token",
                "who_posted",
                "from_web",
                "amount",
                "message",
                "contact",
                "status",
                "meta",
                "created_at",
                "updated_at"
            ],
            order: [["created_at", "DESC"]],
            limit,
            offset
        });

        const requestRows = enquiryRequests.rows.map((item) =>
            item.toJSON ? item.toJSON() : item
        );

        const enquiryModelMap = {
            cab: db.CabEnquiry,
            flight: db.flightEnquiry,
            hotel: db.hotelEnquiry,
            holiday_package: db.HolidayPackageEnquiry || db.holidayPackageEnquiry,
            insurance: db.insuranceEnquiry || db.InsuranceEnquiry
        };

        // SAFE attributes per table
        // Only keep columns that actually exist in that table
        const enquiryAttributesMap = {
            cab: [
                "id",
                "token",
                "customer_token",
                "vendor_token",
                "who_posted",
                "from_web",
                "trip_type",
                "from_location",
                "to_location",
                "departure_date",
                "return_date",
                "car_type",
                "contact",
                "status",
                "flag",
                "create_date",
                "update_date"
            ],
            flight: [
                "id",
                "token",
                "customer_token",
                "vendor_token",
                "who_posted",
                "from_web",
                "trip_type",
                "from_location",
                "to_location",
                "departure_date",
                "return_date",
                "adults",
                "children",
                "class_type",
                "segments",
                "status",
                "flag",
                "create_date",
                "update_date"
            ],
            hotel: [
                "id",
                "token",
                "customer_token",
                "vendor_token",
                "who_posted",
                "from_web",
                "area",
                "check_in",
                "check_out",
                "adults",
                "children",
                "room_type",
                "status",
                "flag",
                "create_date",
                "update_date"
            ],
            holiday_package: [
                "id",
                "token",
                "customer_token",
                "vendor_token",
                "who_posted",
                "from_web",
                "from_city",
                "to_city",
                "departure_date",
                "adults",
                "children",
                "room_type",
                "status",
                "flag",
                "create_date",
                "update_date"
            ],
            insurance: [
                "id",
                "token",
                "customer_token",
                "vendor_token",
                "who_posted",
                "from_web",
                "car_number",
                "name",
                "contact",
                "agree_policy",
                "whatsapp",
                "status",
                "flag",
                "create_date",
                "update_date"
            ]
        };

        const normalizePhone = (value) => {
            if (value === null || value === undefined) return null;
            const cleaned = String(value).replace(/\D/g, "");
            return cleaned || null;
        };

        const isValidIndianPhone = (value) => {
            const cleaned = normalizePhone(value);
            return !!(cleaned && cleaned.length === 10);
        };

        const enrichedRows = [];
        const enquiryCache = new Map();
        const customerTokensToLookup = new Set();
        const vendorTokensToLookup = new Set();

        for (const row of requestRows) {
            const normalizedType = String(row.enquiry_type || "").toLowerCase().trim();
            const EnquiryModel = enquiryModelMap[normalizedType];
            const cacheKey = `${normalizedType}__${row.enquiry_token}`;

            let lead = null;

            if (EnquiryModel && row.enquiry_token) {
                if (enquiryCache.has(cacheKey)) {
                    lead = enquiryCache.get(cacheKey);
                } else {
                    lead = await EnquiryModel.findOne({
                        where: { token: row.enquiry_token },
                        attributes: enquiryAttributesMap[normalizedType] || ["id", "token"],
                        raw: true
                    });

                    enquiryCache.set(cacheKey, lead || null);
                }
            }

            if (lead) {
                const enquiryType = normalizedType;
                const whoPosted = String(lead.who_posted || "").toUpperCase().trim();

                // CAB: always customer flow
                if (enquiryType === "cab") {
                    const customerToken = lead.customer_token ? String(lead.customer_token).trim() : null;
                    if (customerToken && !isValidIndianPhone(customerToken)) {
                        customerTokensToLookup.add(customerToken);
                    }
                } else {
                    if (whoPosted === "CUSTOMER") {
                        const customerToken = lead.customer_token ? String(lead.customer_token).trim() : null;
                        if (customerToken && !isValidIndianPhone(customerToken)) {
                            customerTokensToLookup.add(customerToken);
                        }
                    }

                    if (whoPosted === "VENDOR") {
                        const vendorToken = lead.vendor_token ? String(lead.vendor_token).trim() : null;
                        if (vendorToken) {
                            vendorTokensToLookup.add(vendorToken);
                        }
                    }
                }
            }

            enrichedRows.push({ row, lead });
        }

        let customerMap = {};
        let vendorMap = {};

        const CustomerModel = db.tbl_customer || db.Customer || db.customer;
        const VendorModel = db.tbl_vendor || db.Vendor || db.vendor;

        if (customerTokensToLookup.size && CustomerModel) {
            const customers = await CustomerModel.findAll({
                where: {
                    token: {
                        [Op.in]: [...customerTokensToLookup]
                    }
                },
                attributes: ["token", "contact"],
                raw: true
            });

            customerMap = Object.fromEntries(
                customers.map((item) => [item.token, item.contact])
            );
        }

        if (vendorTokensToLookup.size && VendorModel) {
            const vendors = await VendorModel.findAll({
                where: {
                    token: {
                        [Op.in]: [...vendorTokensToLookup]
                    }
                },
                attributes: ["token", "contact"],
                raw: true
            });

            vendorMap = Object.fromEntries(
                vendors.map((item) => [item.token, item.contact])
            );
        }

        const resolveContact = (lead, fallbackContact = null, enquiryType = null) => {
            if (!lead) return fallbackContact || null;

            // if actual enquiry table has contact, use it
            if (lead.contact) {
                return lead.contact;
            }

            const normalizedEnquiryType = String(enquiryType || "").toLowerCase().trim();

            // CAB always from customer
            if (normalizedEnquiryType === "cab") {
                const customerToken = lead.customer_token ? String(lead.customer_token).trim() : null;

                if (!customerToken) return fallbackContact || null;

                if (isValidIndianPhone(customerToken)) {
                    return normalizePhone(customerToken);
                }

                return customerMap[customerToken] || fallbackContact || null;
            }

            const whoPosted = String(lead.who_posted || "").toUpperCase().trim();

            if (whoPosted === "CUSTOMER") {
                const customerToken = lead.customer_token ? String(lead.customer_token).trim() : null;

                if (!customerToken) return fallbackContact || null;

                if (isValidIndianPhone(customerToken)) {
                    return normalizePhone(customerToken);
                }

                return customerMap[customerToken] || fallbackContact || null;
            }

            if (whoPosted === "VENDOR") {
                const vendorToken = lead.vendor_token ? String(lead.vendor_token).trim() : null;

                if (!vendorToken) return fallbackContact || null;

                return vendorMap[vendorToken] || fallbackContact || null;
            }

            return fallbackContact || null;
        };

        let rows = enrichedRows.map(({ row, lead }) => {
            let leadDetails = null;
            let leadSource = null;
            let leadTitle = null;
            let leadLocation = null;

            if (row.enquiry_type === "cab" && lead) {
                leadDetails = {
                    trip_type: lead.trip_type,
                    from_location: lead.from_location,
                    to_location: lead.to_location,
                    departure_date: lead.departure_date,
                    return_date: lead.return_date,
                    car_type: lead.car_type
                };
                leadSource = lead.from_web ? "WEB" : "VENDOR";
                leadTitle = `${lead.from_location || ""} to ${lead.to_location || ""}`.trim();
                leadLocation = lead.from_location || null;
            }

            if (row.enquiry_type === "flight" && lead) {
                leadDetails = {
                    trip_type: lead.trip_type,
                    from_location: lead.from_location,
                    to_location: lead.to_location,
                    departure_date: lead.departure_date,
                    return_date: lead.return_date,
                    adults: lead.adults,
                    children: lead.children,
                    class_type: lead.class_type,
                    segments: lead.segments
                };
                leadSource = lead.from_web ? "WEB" : "VENDOR";
                leadTitle = `${lead.from_location || ""} to ${lead.to_location || ""}`.trim();
                leadLocation = lead.from_location || null;
            }

            if (row.enquiry_type === "hotel" && lead) {
                leadDetails = {
                    area: lead.area,
                    check_in: lead.check_in,
                    check_out: lead.check_out,
                    adults: lead.adults,
                    children: lead.children,
                    room_type: lead.room_type
                };
                leadSource = lead.from_web ? "WEB" : "VENDOR";
                leadTitle = lead.area || "Hotel Lead";
                leadLocation = lead.area || null;
            }

            if (row.enquiry_type === "holiday_package" && lead) {
                leadDetails = {
                    from_city: lead.from_city,
                    to_city: lead.to_city,
                    departure_date: lead.departure_date,
                    adults: lead.adults,
                    children: lead.children,
                    room_type: lead.room_type
                };
                leadSource = lead.from_web ? "WEB" : "VENDOR";
                leadTitle = `${lead.from_city || ""} to ${lead.to_city || ""}`.trim();
                leadLocation = lead.from_city || null;
            }

            if (row.enquiry_type === "insurance" && lead) {
                leadDetails = {
                    car_number: lead.car_number,
                    name: lead.name,
                    contact: resolveContact(lead, row.contact, row.enquiry_type),
                    agree_policy: lead.agree_policy,
                    whatsapp: lead.whatsapp
                };
                leadSource = lead.from_web ? "WEB" : "VENDOR";
                leadTitle = lead.car_number || "Insurance Lead";
                leadLocation = null;
            }

            return {
                enquiry_request_id: row.id,
                enquiry_request_token: row.token,
                enquiry_type: row.enquiry_type,
                enquiry_token: row.enquiry_token,
                requester_token: row.requester_token,
                vendor_token: row.vendor_token,
                who_posted: row.who_posted,
                from_web: row.from_web,
                amount: row.amount,
                message: row.message,
                contact: resolveContact(lead, row.contact, row.enquiry_type),
                status: row.status,
                meta: row.meta,
                created_at: row.created_at,
                updated_at: row.updated_at,
                lead_source: leadSource,
                lead_title: leadTitle,
                lead_location: leadLocation,
                lead_details: leadDetails
            };
        });

        if (search) {
            const searchText = String(search).toLowerCase().trim();

            rows = rows.filter((item) => {
                return (
                    String(item.enquiry_type || "").toLowerCase().includes(searchText) ||
                    String(item.contact || "").toLowerCase().includes(searchText) ||
                    String(item.lead_title || "").toLowerCase().includes(searchText) ||
                    String(item.lead_location || "").toLowerCase().includes(searchText) ||
                    JSON.stringify(item.lead_details || {}).toLowerCase().includes(searchText)
                );
            });
        }


        const filteredTotal = search ? rows.length : enquiryRequests.count;

        return res.status(200).json(
            responseData(
                "Accepted leads fetched successfully",
                {
                    total: filteredTotal,
                    current_page: page,
                    per_page: limit,
                    total_pages: Math.ceil(filteredTotal / limit),
                    filters: {
                        services: selectedServices.length ? selectedServices : null,
                        search: search || null,
                        from_date: from_date || null,
                        to_date: to_date || null
                    },
                    data: rows
                },
                req,
                true
            )
        );
    } catch (error) {
        console.log("my accepted leads error:", error);
        return res.status(500).json(
            responseData(
                error.message || "Something went wrong",
                {},
                req,
                false
            )
        );
    }
});

// enquiry apis
router.post("/holiday-package-enquiry", [vendorMiddleware, vendorValidation.validate('post-holiday-package')], async (req, res) => {
    try {
        const vendorToken = req?.user?.token || null;
        const {
            from_city,
            to_city,
            departure_date,
            adults,
            children,
            rooms,
            contact = null,
            from_web = false
        } = req.body;

        const enquiry = await HolidayPackageEnquiry.create({
            token: randomstring(64),
            vendor_token: vendorToken,
            from_city,
            to_city,
            departure_date,
            adults: adults || 1,
            children: children || 0,
            who_posted: 'VENDOR',
            from_web: from_web,
            rooms: rooms || 1,
        });

        await queueEnquiryForOtherVendors({
            senderToken: vendorToken,
            type: "NEW_HOLIDAY_PACKAGE_ENQUIRY",
            title: "New Holiday Package Enquiry",
            message: `A new holiday package enquiry has been submitted from ${from_city || "N/A"} to ${to_city || "N/A"} for ${departure_date || "N/A"}. Please review the traveller details and connect soon.`,
            payload: {
                module: "holiday_package_enquiry",
                enquiry: {
                    id: enquiry.id,
                    token: enquiry.token,
                    vendor_token: enquiry.vendor_token,
                    from_city: enquiry.from_city,
                    to_city: enquiry.to_city,
                    departure_date: enquiry.departure_date,
                    adults: enquiry.adults,
                    children: enquiry.children,
                    rooms: rooms || 1,
                    who_posted: enquiry.who_posted,
                    from_web: enquiry.from_web
                }
            }
        });

        return res.status(201).json(
            responseData("Holiday enquiry submitted successfully", {}, req, true)
        );
    } catch (error) {
        console.log("Holiday enquiry error", error);
        return res.status(500).json(
            responseData("Internal server error", {}, req, false)
        );
    }
});

router.post("/insurance-enquiry", [vendorMiddleware, vendorValidation.validate('post-insurance-enquiry')], async (req, res) => {
    try {
        const vendorToken = req?.user?.token || null;

        const {
            car_number,
            name,
            contact,
            agree_policy,
            whatsapp,
            from_web = false
        } = req.body;

        const enquiry = await InsuranceEnquiry.create({
            token: randomstring(64),
            vendor_token: vendorToken,
            car_number,
            name,
            contact,
            agree_policy,
            whatsapp,
            who_posted: 'VENDOR',
            from_web: from_web
        });

        await queueEnquiryForOtherVendors({
            senderToken: vendorToken,
            type: "NEW_INSURANCE_ENQUIRY",
            title: "New Insurance Enquiry",
            message: `A new insurance enquiry has been received for vehicle number ${car_number || "N/A"}. Please review the customer details and get in touch soon.`,
            payload: {
                module: "insurance_enquiry",
                enquiry: {
                    id: enquiry.id,
                    token: enquiry.token,
                    vendor_token: enquiry.vendor_token,
                    car_number: enquiry.car_number,
                    name: enquiry.name,
                    contact: enquiry.contact,
                    agree_policy: enquiry.agree_policy,
                    whatsapp: enquiry.whatsapp,
                    from_web: enquiry.from_web
                }
            }
        });

        return res.status(201).json(
            responseData("Insurance enquiry submitted successfully", {}, req, true)
        );
    } catch (error) {
        console.log("Insurance enquiry error", error);
        return res.status(500).json(
            responseData("Internal server error", {}, req, false)
        );
    }
});

router.post("/hotel-enquiry", [vendorMiddleware, vendorValidation.validate('post-hotel-enquiry')], async (req, res) => {
    try {
        const vendorToken = req?.user?.token || null;
        const {
            area,
            check_in,
            check_out,
            adults,
            children,
            rooms,
            contact = null,
            from_web = false
        } = req.body;

        const enquiry = await HotelEnquiry.create({
            token: randomstring(64),
            vendor_token: vendorToken,
            area,
            check_in,
            check_out,
            adults: adults || 1,
            children: children || 0,
            rooms: rooms || 1,
            who_posted: 'VENDOR',
            from_web: from_web
        });

        await queueEnquiryForOtherVendors({
            senderToken: vendorToken,
            type: "NEW_HOTEL_ENQUIRY",
            title: "New Hotel Enquiry",
            message: `A new hotel enquiry has been submitted for ${area || "N/A"} from ${check_in || "N/A"} to ${check_out || "N/A"}. Please review the stay details and respond quickly.`,
            payload: {
                module: "hotel_enquiry",
                enquiry: {
                    id: enquiry.id,
                    token: enquiry.token,
                    vendor_token: enquiry.vendor_token,
                    area: enquiry.area,
                    check_in: enquiry.check_in,
                    check_out: enquiry.check_out,
                    adults: enquiry.adults,
                    children: enquiry.children,
                    rooms: rooms || 1,
                    who_posted: enquiry.who_posted,
                    from_web: enquiry.from_web
                }
            }
        });

        return res.status(201).json(
            responseData("Hotel enquiry submitted successfully", {}, req, true)
        );
    } catch (error) {
        console.error("Hotel enquiry error", error);
        return res.status(500).json(
            responseData("Internal server error", {}, req, false)
        );
    }
});

router.post("/flight-enquiry", [vendorMiddleware, vendorValidation.validate('post-flight-enquiry')], async (req, res) => {
    try {
        const vendorToken = req?.user?.token || null;

        const {
            trip_type,
            from_location,
            to_location,
            departure_date,
            return_date,
            segments,
            adults,
            children,
            class_type,
            contact = null,
            from_web = false
        } = req.body;

        const payload = {
            token: randomstring(64),
            vendor_token: vendorToken,
            trip_type,
            adults: adults || 1,
            children: children || 0,
            class_type,
            who_posted: 'VENDOR',
            from_web: from_web
        };

        if (trip_type === 'multi') {
            payload.from_location = null;
            payload.to_location = null;
            payload.departure_date = null;
            payload.return_date = null;
            payload.segments = segments;
        } else {
            payload.from_location = from_location;
            payload.to_location = to_location;
            payload.departure_date = departure_date;
            payload.return_date = trip_type === 'round' ? return_date : null;
            payload.segments = null;
        }

        const enquiry = await FlightEnquiry.create(payload);

        const flightMessage =
            trip_type === "multi"
                ? `A new multi-city flight enquiry has been submitted. Please review the travel segments and passenger details before responding.`
                : `A new flight enquiry has been submitted from ${from_location || "N/A"} to ${to_location || "N/A"} for ${departure_date || "N/A"}. Please review the travel details and respond soon.`;

        await queueEnquiryForOtherVendors({
            senderToken: vendorToken,
            type: "NEW_FLIGHT_ENQUIRY",
            title: "New Flight Enquiry",
            message: flightMessage,
            payload: {
                module: "flight_enquiry",
                enquiry: {
                    id: enquiry.id,
                    token: enquiry.token,
                    vendor_token: enquiry.vendor_token,
                    trip_type: enquiry.trip_type,
                    from_location: enquiry.from_location,
                    to_location: enquiry.to_location,
                    departure_date: enquiry.departure_date,
                    return_date: enquiry.return_date,
                    segments: enquiry.segments,
                    adults: enquiry.adults,
                    children: enquiry.children,
                    class_type: enquiry.class_type,
                    who_posted: enquiry.who_posted,
                    from_web: enquiry.from_web
                }
            }
        });

        return res.status(201).json(
            responseData("Flight enquiry submitted successfully", {}, req, true)
        );
    } catch (error) {
        console.log("Flight enquiry error", error);
        return res.status(500).json(
            responseData("Internal server error", {}, req, false)
        );
    }
});

router.post("/lead/request", [vendorMiddleware], async (req, res) => {
    const t = await db.sequelize.transaction();

    try {
        const requesterToken = req.user.token;
        const { enquiry_type, enquiry_token } = req.body;

        if (!enquiry_type || !enquiry_token) {
            await t.rollback();
            return res.status(400).json(
                responseData(
                    "enquiry_type and enquiry_token are required",
                    {},
                    req,
                    false
                )
            );
        }

        const allowedTypes = [
            "cab",
            "flight",
            "hotel",
            "holiday_package",
            "insurance"
        ];

        if (!allowedTypes.includes(enquiry_type)) {
            await t.rollback();
            return res.status(400).json(
                responseData(
                    "Invalid enquiry_type",
                    {},
                    req,
                    false
                )
            );
        }

        const enquiryModelMap = {
            cab: db.CabEnquiry,
            flight: db.flightEnquiry,
            hotel: db.hotelEnquiry,
            holiday_package: db.holydaypackageEnquiry,
            insurance: db.insuranceEnquiry
        };

        const enquiryModel = enquiryModelMap[enquiry_type];

        const enquiry = await enquiryModel.findOne({
            where: {
                token: enquiry_token,
                flag: 0
            },
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!enquiry) {
            await t.rollback();
            return res.status(404).json(
                responseData(
                    "Lead not found",
                    {},
                    req,
                    false
                )
            );
        }

        if (enquiry.status !== "active") {
            await t.rollback();
            return res.status(409).json(
                responseData(
                    "This lead is not active",
                    {},
                    req,
                    false
                )
            );
        }

        if (enquiry.vendor_token && enquiry.vendor_token === requesterToken) {
            await t.rollback();
            return res.status(400).json(
                responseData(
                    "You cannot request your own lead",
                    {},
                    req,
                    false
                )
            );
        }

        const existingRequest = await db.enquiryRequest.findOne({
            where: {
                enquiry_type,
                enquiry_token,
                requester_token: requesterToken,
                flag: 0
            },
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (existingRequest) {
            await t.rollback();
            return res.status(409).json(
                responseData(
                    "You have already requested this lead",
                    {},
                    req,
                    false
                )
            );
        }

        const requestCount = await db.enquiryRequest.count({
            where: {
                enquiry_type,
                enquiry_token,
                flag: 0
            },
            transaction: t
        });

        if (requestCount >= 10) {
            if (enquiry.status !== "inactive") {
                await enquiry.update(
                    { status: "inactive" },
                    { transaction: t }
                );
            }

            await t.rollback();
            return res.status(409).json(
                responseData(
                    "This lead is no longer available. Maximum request limit reached",
                    {},
                    req,
                    false
                )
            );
        }

        const wallet = await db.wallet.findOne({
            where: {
                user_token: requesterToken,
                role: "VENDOR",
                flag: false,
                status: "ACTIVE"
            },
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!wallet) {
            await t.rollback();
            return res.status(404).json(
                responseData(
                    "Wallet not found",
                    {},
                    req,
                    false
                )
            );
        }

        const walletBalance = parseFloat(wallet.wallet_balance || 0);
        const referralBalance = parseFloat(wallet.referral_balance || 0);
        const totalBalance = parseFloat(wallet.total_balance || 0);

        let walletDebit = 0;
        let referralDebit = 0;
        let deductionMode = "";

        if (referralBalance >= 15 && walletBalance >= 15) {
            referralDebit = 15;
            walletDebit = 15;
            deductionMode = "REFERRAL_15_WALLET_15";
        } else if (walletBalance >= 30) {
            walletDebit = 30;
            referralDebit = 0;
            deductionMode = "WALLET_30";
        } else {
            await t.rollback();
            return res.status(400).json(
                responseData(
                    "Insufficient balance to request this lead",
                    {
                        required: 30,
                        wallet_balance: walletBalance,
                        referral_balance: referralBalance,
                        total_balance: totalBalance
                    },
                    req,
                    false
                )
            );
        }

        const openingBalance = totalBalance;
        const newWalletBalance = walletBalance - walletDebit;
        const newReferralBalance = referralBalance - referralDebit;
        const closingBalance = newWalletBalance + newReferralBalance;

        await wallet.update(
            {
                wallet_balance: newWalletBalance,
                referral_balance: newReferralBalance,
                total_balance: closingBalance,
                last_transaction_at: new Date()
            },
            { transaction: t }
        );

        let leadContact = null;

        if (enquiry.from_web === true) {
            leadContact = enquiry.contact || null;
        } else if (enquiry.vendor_token) {
            const leadOwnerVendor = await db.vendor.findOne({
                where: {
                    token: enquiry.vendor_token,
                    flag: 0
                },
                attributes: ["contact", "alt_contact"],
                transaction: t
            });

            leadContact =
                leadOwnerVendor?.contact ||
                leadOwnerVendor?.alt_contact ||
                null;
        }

        const enquiryRequest = await db.enquiryRequest.create(
            {
                token: randomstring(64),
                enquiry_type,
                enquiry_token,
                requester_token: requesterToken,
                vendor_token: enquiry.vendor_token || null,
                who_posted: enquiry.who_posted || null,
                from_web: enquiry.from_web === true,
                amount: null,
                message: null,
                contact: leadContact,
                status: "ACCEPTED",
                meta: {
                    deduction_mode: deductionMode,
                    wallet_debit: walletDebit,
                    referral_debit: referralDebit,
                    total_deducted: walletDebit + referralDebit
                }
            },
            { transaction: t }
        );

        await db.wallet_transaction.create(
            {
                token: randomstring(64),
                wallet_id: wallet.id,
                transaction_type: "DEBIT",
                amount: walletDebit + referralDebit,
                opening_balance: openingBalance,
                closing_balance: closingBalance,
                wallet_balance: newWalletBalance,
                referral_balance: newReferralBalance,
                reason: "LEAD_REQUEST",
                reference_type: "ENQUIRY_REQUEST",
                reference_id: enquiryRequest.token,
                status: "SUCCESS",
                meta: {
                    enquiry_type,
                    enquiry_token,
                    requester_token: requesterToken,
                    deduction_mode: deductionMode,
                    wallet_debit: walletDebit,
                    referral_debit: referralDebit
                }
            },
            { transaction: t }
        );

        const updatedRequestCount = requestCount + 1;

        if (updatedRequestCount >= 10) {
            await enquiry.update(
                { status: "inactive" },
                { transaction: t }
            );
        }

        const requesterVendor = await Vendor.findOne({
            where: {
                token: requesterToken,
                flag: 0
            },
            attributes: ["first_name", "last_name", "contact"],
            transaction: t
        });

        let customerTokenForNotification = null;

        if (enquiry.who_posted === "CUSTOMER") {
            customerTokenForNotification = enquiry.customer_token || null;
        }

        await t.commit();

        res.status(201).json(
            responseData(
                "Lead request sent successfully",
                {
                    enquiry_request_token: enquiryRequest.token,
                    enquiry_type,
                    enquiry_token,
                    request_count: updatedRequestCount,
                    max_request_limit: 10,
                    lead_status: updatedRequestCount >= 10 ? "inactive" : "active",
                    deduction: {
                        total_deducted: walletDebit + referralDebit,
                        wallet_debited: walletDebit,
                        referral_debited: referralDebit,
                        deduction_mode: deductionMode
                    },
                    wallet: {
                        wallet_balance: newWalletBalance,
                        referral_balance: newReferralBalance,
                        total_balance: closingBalance
                    }
                },
                req,
                true
            )
        );

        const io = getIO();

        await leadRequestCustomerNotificationQueue.add(
            "LEAD_REQUEST_CUSTOMER",
            {
                enquiry_type,
                enquiry_token,
                enquiry_request_token: enquiryRequest.token,
                requester_token: requesterToken,
                vendor_name:
                    `${requesterVendor?.first_name || ""} ${requesterVendor?.last_name || ""}`.trim() ||
                    "Vendor",
                vendor_contact: requesterVendor?.contact || null,
                title: "नई लीड रिक्वेस्ट मिली",
                message: "आपकी enquiry पर एक vendor ने request भेजी है।",
                meta: {
                    who_posted: enquiry.who_posted || null,
                    from_web: enquiry.from_web === true,
                    lead_status: updatedRequestCount >= 10 ? "inactive" : "active"
                }
            },
            {
                removeOnComplete: true,
                removeOnFail: false
            }
        );
    } catch (error) {
        if (!t.finished) {
            await t.rollback();
        }

        console.log("enquiry request error:", error);

        if (error.name === "SequelizeUniqueConstraintError") {
            return res.status(409).json(
                responseData(
                    "You have already requested this lead",
                    {},
                    req,
                    false
                )
            );
        }

        return res.status(500).json(
            responseData(
                error.message || "Something went wrong",
                {},
                req,
                false
            )
        );
    }
});

router.post('/enquiry/send-request', [vendorMiddleware, verifiedOnly], async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
        const requesterToken = req.user.token;
        const {
            enquiry_token,
            enquiry_type,
            message = null,
            contact = null
        } = req.body;



        if (!enquiry_token || !enquiry_type) {
            await transaction.rollback();
            return res.status(400).json(
                responseData('enquiry_token and enquiry_type are required', {}, req, false)
            );
        }

        const allowedTypes = ['cab', 'tour', 'hotel', 'flight'];
        if (!allowedTypes.includes(String(enquiry_type).toLowerCase())) {
            await transaction.rollback();
            return res.status(400).json(
                responseData('Invalid enquiry type', {}, req, false)
            );
        }

        const normalizedEnquiryType = String(enquiry_type).toLowerCase();

        const enquiryModelMap = {
            cab: db.CabEnquiry,
            tour: db.TourEnquiry,
            hotel: db.hotelEnquiry,
            flight: db.flightEnquiry
        };

        const EnquiryModel = enquiryModelMap[normalizedEnquiryType];

        if (!EnquiryModel) {
            await transaction.rollback();
            return res.status(400).json(
                responseData('Invalid enquiry model', {}, req, false)
            );
        }

        const enquiry = await EnquiryModel.findOne({
            where: {
                token: enquiry_token
            },
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (!enquiry) {
            await transaction.rollback();
            return res.status(404).json(
                responseData('Enquiry not found', {}, req, false)
            );
        }

        if (String(enquiry.status || '').toLowerCase() === 'inactive') {
            await transaction.rollback();
            return res.status(400).json(
                responseData('This enquiry is already booked', {}, req, false)
            );
        }

        const existingRequestCount = await db.enquiryRequest.count({
            where: {
                enquiry_token,
                enquiry_type: normalizedEnquiryType,
                flag: false
            },
            transaction
        });

        if (existingRequestCount >= 10) {
            await enquiry.update(
                { status: 'inactive' },
                { transaction }
            );

            await transaction.rollback();
            return res.status(400).json(
                responseData('This enquiry is already full', {}, req, false)
            );
        }

        const existingRequest = await db.enquiryRequest.findOne({
            where: {
                enquiry_token,
                enquiry_type: normalizedEnquiryType,
                requester_token: requesterToken,
                flag: false
            },
            transaction
        });

        if (existingRequest) {
            await transaction.rollback();
            return res.status(400).json(
                responseData('You have already sent request for this enquiry', {}, req, false)
            );
        }

        const wallet = await db.wallet.findOne({
            where: {
                user_token: requesterToken,
                role: 'VENDOR',
                status: 'ACTIVE'
            },
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (!wallet) {
            await transaction.rollback();
            return res.status(404).json(
                responseData('Wallet not found', {}, req, false)
            );
        }

        const openingWalletBalance = Number(wallet.wallet_balance || 0);
        const openingReferralBalance = Number(wallet.referral_balance || 0);
        const openingTotalBalance = Number(wallet.total_balance || 0);

        if (openingTotalBalance < REQUEST_FEE) {
            await transaction.rollback();
            return res.status(400).json(
                responseData('Not enough balance', {}, req, false)
            );
        }

        const HALF_REQUEST_FEE = REQUEST_FEE / 2;

        let walletDebit = 0;
        let referralDebit = 0;

        // First 15 from wallet
        walletDebit = Math.min(openingWalletBalance, HALF_REQUEST_FEE);

        // Second 15 from referral
        referralDebit = Math.min(openingReferralBalance, HALF_REQUEST_FEE);

        // If referral side is short, take remaining from wallet
        const remainingAfterReferral = HALF_REQUEST_FEE - referralDebit;
        if (remainingAfterReferral > 0) {
            walletDebit += remainingAfterReferral;
        }

        // Final safety check
        if (
            (walletDebit + referralDebit) < REQUEST_FEE ||
            walletDebit > openingWalletBalance ||
            referralDebit > openingReferralBalance
        ) {
            await transaction.rollback();
            return res.status(400).json(
                responseData('Not enough balance', {}, req, false)
            );
        }

        const closingWalletBalance = openingWalletBalance - walletDebit;
        const closingReferralBalance = openingReferralBalance - referralDebit;
        const closingTotalBalance = closingWalletBalance + closingReferralBalance;

        await wallet.update(
            {
                wallet_balance: closingWalletBalance,
                referral_balance: closingReferralBalance,
                total_balance: closingTotalBalance,
                last_transaction_at: new Date()
            },
            { transaction }
        );

        const request = await db.enquiryRequest.create(
            {
                token: randomstring(64),
                enquiry_token,
                enquiry_type: normalizedEnquiryType,
                requester_token: requesterToken,
                message,
                contact,
                status: 'PENDING',
                flag: false
            },
            { transaction }
        );

        await db.wallet_transaction.create(
            {
                token: randomstring(64),
                wallet_id: wallet.id,
                transaction_type: 'DEBIT',
                amount: REQUEST_FEE,
                opening_balance: openingTotalBalance,
                closing_balance: closingTotalBalance,
                wallet_balance: closingWalletBalance,
                referral_balance: closingReferralBalance,
                reason: 'ENQUIRY_REQUEST_FEE',
                reference_type: normalizedEnquiryType,
                reference_id: enquiry_token,
                status: 'SUCCESS',
                flag: false,
                meta: {
                    enquiry_type: normalizedEnquiryType,
                    enquiry_token,
                    requester_token: requesterToken,
                    request_token: request.token,
                    message,
                    contact,
                    deduction: {
                        wallet_debit: walletDebit,
                        referral_debit: referralDebit
                    }
                }
            },
            { transaction }
        );

        const updatedRequestCount = existingRequestCount + 1;

        if (updatedRequestCount >= 10) {
            await enquiry.update(
                { status: 'inactive' },
                { transaction }
            );
        }

        await transaction.commit();

        res.status(200).json(
            responseData(
                'Request sent successfully',
                {
                    request: {
                        token: request.token,
                        enquiry_token: request.enquiry_token,
                        enquiry_type: request.enquiry_type,
                        requester_token: request.requester_token,
                        status: request.status,
                        message: request.message,
                        contact: request.contact,
                        created_at: request.createdAt || request.created_at
                    },
                    wallet: {
                        deducted_amount: REQUEST_FEE,
                        wallet_debit: walletDebit,
                        referral_debit: referralDebit,
                        wallet_balance: closingWalletBalance,
                        referral_balance: closingReferralBalance,
                        total_balance: closingTotalBalance
                    },
                    enquiry: {
                        token: enquiry_token,
                        total_requests: updatedRequestCount,
                        status: updatedRequestCount >= 10 ? 'inactive' : enquiry.status
                    }
                },
                req,
                true
            )
        );
        const io = getIO()

        io.to(`vendor:${requesterToken}`).emit('lead:accept', {
            booking_token: enquiry?.token || null,
            accepted_by: fullName,
            deducted_amount: deductionAmount,
            message: `आपने यह लीड स्वीकार कर ली है। आपके वॉलेट से 30 काट लिए गए हैं।`,
            event: 'LEAD_REQUEST_ACCEPTED',
            type: 'SUCCESS',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        await transaction.rollback();
        console.error('send enquiry request error:', error);

        return res.status(500).json(
            responseData('Something went wrong', {}, req, false)
        );
    }
});

router.patch("/enquiry/request/cancel", [vendorMiddleware, verifiedOnly], async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
        const requesterToken = req.user.token;
        const { request_token } = req.body;
        const REQUEST_FEE = 30;

        if (!request_token) {
            await transaction.rollback();
            return res.status(400).json(
                responseData("request_token is required", {}, req, false)
            );
        }

        const enquiryRequest = await db.enquiryRequest.findOne({
            where: {
                token: request_token,
                requester_token: requesterToken,
                flag: 0
            },
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (!enquiryRequest) {
            await transaction.rollback();
            return res.status(404).json(
                responseData("Request not found", {}, req, false)
            );
        }

        if (enquiryRequest.status === "CANCELLED") {
            await transaction.rollback();
            return res.status(409).json(
                responseData("Request already cancelled", {}, req, false)
            );
        }

        const wallet = await db.wallet.findOne({
            where: {
                user_token: requesterToken,
                role: "VENDOR",
                status: "ACTIVE",
                flag: false
            },
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (!wallet) {
            await transaction.rollback();
            return res.status(404).json(
                responseData("Wallet not found", {}, req, false)
            );
        }

        // check original debit transaction
        const debitTransaction = await db.walletTransaction.findOne({
            where: {
                wallet_id: wallet.id,
                transaction_type: "DEBIT",
                reason: "ENQUIRY_REQUEST_FEE",
                reference_type: enquiryRequest.enquiry_type,
                reference_id: enquiryRequest.enquiry_token,
                status: "SUCCESS",
                flag: false
            },
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (!debitTransaction) {
            await transaction.rollback();
            return res.status(404).json(
                responseData("Original debit transaction not found", {}, req, false)
            );
        }

        // prevent duplicate refund
        const existingRefund = await db.walletTransaction.findOne({
            where: {
                wallet_id: wallet.id,
                transaction_type: "CREDIT",
                reason: "ENQUIRY_REQUEST_REFUND",
                reference_type: enquiryRequest.enquiry_type,
                reference_id: enquiryRequest.enquiry_token,
                status: "SUCCESS",
                flag: false
            },
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (existingRefund) {
            await transaction.rollback();
            return res.status(409).json(
                responseData("Refund already processed for this request", {}, req, false)
            );
        }

        await enquiryRequest.update(
            { status: "CANCELLED" },
            { transaction }
        );

        const openingBalance = Number(wallet.balance || 0);
        const closingBalance = openingBalance + REQUEST_FEE;

        await wallet.update(
            {
                balance: closingBalance,
                last_transaction_at: new Date()
            },
            { transaction }
        );

        await db.walletTransaction.create({
            token: randomstring(64),
            wallet_id: wallet.id,
            transaction_type: "CREDIT",
            amount: REQUEST_FEE,
            opening_balance: openingBalance,
            closing_balance: closingBalance,
            reason: "ENQUIRY_REQUEST_REFUND",
            reference_type: enquiryRequest.enquiry_type,
            reference_id: enquiryRequest.enquiry_token,
            status: "SUCCESS",
            flag: false,
            meta: {
                request_token: enquiryRequest.token,
                enquiry_type: enquiryRequest.enquiry_type,
                enquiry_token: enquiryRequest.enquiry_token,
                requester_token: requesterToken,
                refunded_against: debitTransaction.token
            }
        }, { transaction });

        const EnquiryModel = enquiryModelMap[enquiryRequest.enquiry_type];

        let enquiryStatus = null;

        if (EnquiryModel) {
            const activeRequestCount = await db.enquiryRequest.count({
                where: {
                    enquiry_type: enquiryRequest.enquiry_type,
                    enquiry_token: enquiryRequest.enquiry_token,
                    flag: 0,
                    status: {
                        [Op.ne]: "CANCELLED"
                    }
                },
                transaction
            });

            if (activeRequestCount < 10) {
                await EnquiryModel.update(
                    { status: "active" },
                    {
                        where: { token: enquiryRequest.enquiry_token },
                        transaction
                    }
                );
                enquiryStatus = "active";
            } else {
                enquiryStatus = "inactive";
            }
        }

        await transaction.commit();

        return res.status(200).json(
            responseData(
                "Request cancelled successfully and ₹30 refunded to wallet",
                {
                    request: enquiryRequest,
                    enquiry_status: enquiryStatus,
                    wallet: {
                        refunded_amount: REQUEST_FEE,
                        balance: closingBalance
                    }
                },
                req,
                true
            )
        );
    } catch (error) {
        await transaction.rollback();
        console.log("cancel enquiry request error:", error);
        return res.status(500).json(
            responseData(error.message || "Something went wrong", {}, req, false)
        );
    }
});

/* --------------- chat list ----------- */
router.get("/my-chats", [vendorMiddleware, verifiedOnly], async (req, res) => {
    try {
        const userToken = req.user.token;
        const search = (req.query.search || "").trim();

        const conversationWhere = {
            is_active: true,
            [Sequelize.Op.or]: [
                { owner_token: userToken },
                { requester_token: userToken },
            ],
        };

        const conversations = await Conversation.findAll({
            where: conversationWhere,
            attributes: [
                "token",
                "booking_token",
                "owner_token",
                "requester_token",
                "last_message_token",
                "last_message",
                "last_message_type",
                "last_message_sender_token",
                "last_message_at",
                "unread_count_owner",
                "unread_count_requester",
                "created_at",
                "updated_at",
            ],
            order: [
                ["last_message_at", "DESC"],
                ["updated_at", "DESC"],
                ["created_at", "DESC"],
            ],
        });

        // console.log(conversations)

        if (!conversations || conversations.length === 0) {
            return res.status(200).json(
                responseData(
                    "Chat list fetched successfully",
                    {
                        total: 0,
                        conversations: [],
                    },
                    req,
                    true
                )
            );
        }

        const otherUserTokens = [
            ...new Set(
                conversations
                    .map((conv) =>
                        conv.owner_token === userToken
                            ? conv.requester_token
                            : conv.owner_token
                    )
                    .filter(Boolean)
            ),
        ];

        const bookingTokens = [
            ...new Set(
                conversations.map((conv) => conv.booking_token).filter(Boolean)
            ),
        ];

        const vendorWhere = {
            token: {
                [Sequelize.Op.in]: otherUserTokens,
            },
        };

        const bookingWhere = {
            token: {
                [Sequelize.Op.in]: bookingTokens,
            },
        };

        const vendors = await Vendor.findAll({
            where: vendorWhere,
            attributes: [
                "token",
                "first_name",
                "last_name",
                "contact",
                [Sequelize.literal(`CONCAT('${admin_url}', profile_image)`), 'profile_image'],
                "city",
                "state",
            ],
        });

        const bookings = await Booking.findAll({
            where: bookingWhere,
            attributes: [
                "token",
                "trip_type",
                "vehicle_type",
                "vehicle_name",
                "pickup_datetime",
                "return_datetime",
                "pickup_location",
                "drop_location",
                "city",
                "state",
                "status",
                "created_at",
            ],
        });

        const vendorMap = {};
        vendors.forEach((vendor) => {
            vendorMap[vendor.token] = vendor.get({ plain: true });
        });

        const bookingMap = {};
        bookings.forEach((booking) => {
            bookingMap[booking.token] = booking.get({ plain: true });
        });

        let formattedConversations = conversations.map((conv) => {
            const plain = conv.get({ plain: true });

            const isOwner = plain.owner_token === userToken;
            const otherUserToken = isOwner
                ? plain.requester_token
                : plain.owner_token;

            const otherUser = vendorMap[otherUserToken] || null;
            const booking = bookingMap[plain.booking_token] || null;

            return {
                conversation: {
                    token: plain.token,
                    booking_token: plain.booking_token,
                    owner_token: plain.owner_token,
                    requester_token: plain.requester_token,
                    last_message_token: plain.last_message_token,
                    last_message: plain.last_message,
                    last_message_type: plain.last_message_type,
                    last_message_sender_token: plain.last_message_sender_token,
                    last_message_at: plain.last_message_at,
                    unread_count: isOwner
                        ? plain.unread_count_owner
                        : plain.unread_count_requester,
                    created_at: plain.created_at,
                    updated_at: plain.updated_at,
                },

                other_user: otherUser
                    ? {
                        token: otherUser.token,
                        first_name: otherUser.first_name,
                        last_name: otherUser.last_name,
                        contact: otherUser.contact,
                        profile_image: otherUser.profile_image,
                        city: otherUser.city,
                        state: otherUser.state,
                    }
                    : null,

                booking: booking
                    ? {
                        token: booking.token,
                        trip_type: booking.trip_type,
                        vehicle_type: booking.vehicle_type,
                        vehicle_name: booking.vehicle_name,
                        pickup_datetime: booking.pickup_datetime,
                        return_datetime: booking.return_datetime,
                        pickup_location: booking.pickup_location,
                        drop_location: booking.drop_location,
                        city: booking.city,
                        state: booking.state,
                        status: booking.status,
                        created_at: booking.created_at,
                    }
                    : null,
            };
        });

        // SEARCH FILTER
        if (search) {
            const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const regex = new RegExp(escapedSearch, "i");

            formattedConversations = formattedConversations.filter((item) => {
                const firstName = item.other_user?.first_name || "";
                const lastName = item.other_user?.last_name || "";
                const fullName = `${firstName} ${lastName}`.trim();
                const contact = item.other_user?.contact || "";

                const vehicleType = item.booking?.vehicle_type || "";
                const vehicleName = item.booking?.vehicle_name || "";
                const pickupLocation = item.booking?.pickup_location || "";
                const dropLocation = item.booking?.drop_location || "";
                const city = item.booking?.city || "";
                const state = item.booking?.state || "";

                const lastMessage = item.conversation?.last_message || "";

                return (
                    regex.test(firstName) ||
                    regex.test(lastName) ||
                    regex.test(fullName) ||
                    regex.test(contact) ||
                    regex.test(vehicleType) ||
                    regex.test(vehicleName) ||
                    regex.test(pickupLocation) ||
                    regex.test(dropLocation) ||
                    regex.test(city) ||
                    regex.test(state) ||
                    regex.test(lastMessage)
                );
            });
        }

        return res.status(200).json(
            responseData(
                "Chat list fetched successfully",
                {
                    total: formattedConversations.length,
                    conversations: formattedConversations,
                },
                req,
                true
            )
        );
    } catch (error) {
        console.error("Fetch chat list error:", error);

        return res.status(500).json(
            responseData("Error occurred", {}, req, false)
        );
    }
});

router.get("/messages/:conversationToken", [vendorMiddleware, verifiedOnly], async (req, res) => {
    try {
        const userToken = req.user.token;
        const conversationToken = req.params.conversationToken;
        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
        const before = req.query.before || null;

        const conversation = await Conversation.findOne({
            where: {
                token: conversationToken,
                is_active: true,
                [Sequelize.Op.or]: [
                    { owner_token: userToken },
                    { requester_token: userToken },
                ],
            },
        });

        if (!conversation) {
            return res.status(404).json(
                responseData("Conversation not found", {}, req, false)
            );
        }

        const where = {
            conversation_token: conversation.token,
        };

        if (before) {
            where.created_at = {
                [Sequelize.Op.lt]: new Date(before),
            };
        }

        const messages = await Chat.findAll({
            where,
            attributes: [
                "token",
                "conversation_token",
                "booking_token",
                "sender_token",
                "receiver_token",
                "message",
                "message_type",
                "attachment_url",
                "status",
                "created_at",
            ],
            order: [["created_at", "DESC"]],
            limit,
        });

        const orderedMessages = messages.reverse();

        const nextCursor =
            messages.length === limit
                ? messages[messages.length - 1].created_at
                : null;

        return res.status(200).json(
            responseData(
                "Messages fetched successfully",
                {
                    conversation_token: conversation.token,
                    messages: orderedMessages,
                    pagination: {
                        limit,
                        next_cursor: nextCursor,
                        has_more: !!nextCursor,
                    },
                },
                req,
                true
            )
        );
    } catch (error) {
        console.error("Fetch messages error:", error);
        return res.status(500).json(
            responseData("Error occurred", {}, req, false)
        );
    }
});

/* -------------- calls ----------------- */
router.get("/enquiry/call/list", [vendorMiddleware, verifiedOnly, vendorValidation.validate("get-call-enquiry-list")], async (req, res) => {
    try {
        const vendorToken = req.user.token;

        const {
            page = 1,
            limit = 10,
            search = "",
            enquiry_token,
            enquiry_type,
            customer_token,
            status,
            call_type,
            from_date,
            to_date,
        } = req.query;

        const safePage = Math.max(Number(page) || 1, 1);
        const safeLimit = Math.max(Number(limit) || 10, 1);
        const offset = (safePage - 1) * safeLimit;

        const where = {
            called_by: vendorToken,
        };

        if (enquiry_token) {
            where.enquiry_token = enquiry_token;
        }

        if (enquiry_type) {
            where.enquiry_type = String(enquiry_type).toLowerCase();
        }

        if (customer_token) {
            where.customer_token = customer_token;
        }

        if (status) {
            where.status = status;
        }

        if (call_type) {
            where.call_type = call_type;
        }

        if (from_date || to_date) {
            where.call_time = {};
            if (from_date) {
                where.call_time[Op.gte] = new Date(from_date);
            }
            if (to_date) {
                where.call_time[Op.lte] = new Date(to_date);
            }
        }

        if (search && String(search).trim()) {
            const regex = String(search).trim();

            where[Op.or] = [
                { enquiry_token: { [Op.iLike]: `%${regex}%` } },
                { customer_token: { [Op.iLike]: `%${regex}%` } },
                { called_by: { [Op.iLike]: `%${regex}%` } },
                { status: { [Op.iLike]: `%${regex}%` } },
                { call_type: { [Op.iLike]: `%${regex}%` } },
            ];
        }

        const { count, rows } = await EnquiryCall.findAndCountAll({
            where,
            order: [["call_time", "DESC"]],
            limit: safeLimit,
            offset,
        });

        return res.status(200).json(
            responseData(
                "Calls fetched successfully",
                {
                    total: count,
                    page: safePage,
                    limit: safeLimit,
                    total_pages: Math.ceil(count / safeLimit),
                    data: rows,
                },
                req,
                true
            )
        );
    } catch (error) {
        console.error("getEnquiryCallList error:", error);
        return res.status(500).json(
            responseData("Something went wrong", {}, req, false)
        );
    }
});

router.get("/enquiry/call/check", [vendorMiddleware, verifiedOnly], async (req, res) => {
    try {
        const vendorToken = req.user.token;
        const { enquiry_token, customer_token } = req.query;

        if (!enquiry_token || !customer_token) {
            return res.status(400).json(
                responseData(
                    "enquiry_token and customer_token are required",
                    {},
                    req,
                    false
                )
            );
        }

        const exists = await EnquiryCall.findOne({
            where: {
                enquiry_token,
                customer_token,
                called_by: vendorToken,
            },
        });

        return res.status(200).json(
            responseData(
                "Call check fetched successfully",
                {
                    already_called: !!exists,
                    data: exists || null,
                },
                req,
                true
            )
        );
    } catch (error) {
        console.error("checkEnquiryCall error:", error);
        return res.status(500).json(
            responseData("Something went wrong", {}, req, false)
        );
    }
});

router.post("/enquiry/call/store", [vendorMiddleware, verifiedOnly, vendorValidation.validate("post-call-enquiry")], async (req, res) => {
    try {
        const vendorToken = req.user.token;
        const {
            enquiry_token,
            enquiry_type,
            customer_token,
            contact,
            call_type = "outgoing",
            status = "success",
        } = req.body;

        console.log('body ->>> ', req.body)

        // process.exit(1)

        const callEntry = await EnquiryCall.create({
            token: randomstring(64),
            enquiry_token,
            enquiry_type: String(enquiry_type).toLowerCase(),
            customer_token: customer_token || contact,
            called_by: vendorToken,
            call_type,
            status,
            call_time: new Date(),
        });

        return res.status(200).json(
            responseData("Call stored successfully", { call: callEntry }, req, true)
        );
    } catch (error) {
        console.error("storeEnquiryCall error:", error);
        return res.status(500).json(
            responseData("Something went wrong", {}, req, false)
        );
    }
});

/* --------------- wallet -------------- */

// trasaction history of platform
router.get("/advance-payment/history/:advance_request_token", [vendorMiddleware, verifiedOnly], async (req, res) => {
    try {
        const { advance_request_token } = req.params;
        const currentVendorToken = req.user.token;

        const advanceRequest = await BookingAdvanceRequest.findOne({
            where: {
                token: advance_request_token,
                flag: 0,
            },
            raw: true,
        });

        if (!advanceRequest) {
            return res.status(404).json(
                responseData("Advance request not found", {}, req, false)
            );
        }

        if (
            currentVendorToken !== advanceRequest.owner_vendor_token &&
            currentVendorToken !== advanceRequest.bidder_vendor_token
        ) {
            return res.status(403).json(
                responseData("You are not allowed to view this history", {}, req, false)
            );
        }

        const booking = await Booking.findOne({
            where: {
                token: advanceRequest.booking_token,
                flag: 0,
            },
            raw: true,
        });

        const bookingRequest = await BookingRequest.findOne({
            where: {
                token: advanceRequest.booking_request_token,
                flag: 0,
            },
            raw: true,
        });

        const payment = advanceRequest.payment_token
            ? await BookingPayment.findOne({
                where: { token: advanceRequest.payment_token },
                raw: true,
            })
            : null;

        const payout = payment
            ? await VendorPayout.findOne({
                where: {
                    payment_token: payment.token,
                    booking_token: advanceRequest.booking_token,
                },
                order: [["created_at", "DESC"]],
                raw: true,
            })
            : null;

        const timeline = await BookingAdvanceRequestHistory.findAll({
            where: {
                advance_request_token,
                flag: 0,
            },
            order: [["created_at", "ASC"]],
            raw: true,
        });

        const paidToPlatform = payment?.payment_status === "PAID"
            ? Number(payment.amount || 0)
            : 0;

        const platformPayableToOwner = payout
            ? Number(payout.amount || 0)
            : payment?.payment_status === "PAID"
                ? Number(payment.amount || 0)
                : 0;

        const platformAlreadyPaidToOwner =
            payout && ["PAID", "SUCCESS", "COMPLETED"].includes(payout.status)
                ? Number(payout.amount || 0)
                : 0;

        const platformPendingToOwner = Math.max(
            platformPayableToOwner - platformAlreadyPaidToOwner,
            0
        );

        return res.status(200).json(
            responseData(
                "Advance payment history fetched successfully",
                {
                    advance_request: {
                        token: advanceRequest.token,
                        booking_token: advanceRequest.booking_token,
                        booking_request_token: advanceRequest.booking_request_token,
                        owner_vendor_token: advanceRequest.owner_vendor_token,
                        bidder_vendor_token: advanceRequest.bidder_vendor_token,
                        requested_advance_amount: Number(
                            advanceRequest.requested_advance_amount || 0
                        ),
                        responded_advance_amount: Number(
                            advanceRequest.responded_advance_amount || 0
                        ),
                        final_advance_amount: Number(
                            advanceRequest.final_advance_amount || 0
                        ),
                        currency: advanceRequest.currency || "INR",
                        status: advanceRequest.status,
                        payment_status: advanceRequest.payment_status,
                        requested_at: advanceRequest.requested_at,
                        accepted_at: advanceRequest.accepted_at,
                        expires_at: advanceRequest.expires_at,
                    },
                    booking: booking || null,
                    booking_request: bookingRequest || null,
                    payment_summary: {
                        payment_token: payment?.token || null,
                        payment_for: payment?.payment_for || "BOOKING_ADVANCE",
                        payer_token: payment?.payer_token || null,
                        payee_vendor_token: payment?.payee_vendor_token || null,
                        amount_paid_to_platform: paidToPlatform,
                        currency: payment?.currency || advanceRequest.currency || "INR",
                        payment_status: payment?.payment_status || "UNPAID",
                        order_status: payment?.order_status || null,
                        razorpay_order_id: payment?.razorpay_order_id || null,
                        razorpay_payment_id: payment?.razorpay_payment_id || null,
                        paid_at: payment?.paid_at || null,
                    },
                    platform_summary: {
                        received_from_bidder: paidToPlatform,
                        payable_to_owner: platformPayableToOwner,
                        already_paid_to_owner: platformAlreadyPaidToOwner,
                        pending_to_owner: platformPendingToOwner,
                    },
                    payout_summary: payout
                        ? {
                            payout_token: payout.token || null,
                            vendor_token: payout.vendor_token || null,
                            amount: Number(payout.amount || 0),
                            status: payout.status || null,
                            paid_at: payout.paid_at || null,
                        }
                        : null,
                    timeline,
                },
                req,
                true
            )
        );
    } catch (error) {
        console.error("advance-payment/history error:", error);
        return res.status(500).json(
            responseData("Server Error", {}, req, false)
        );
    }
});

router.get('/wallet/summary', [vendorMiddleware, verifiedOnly], async (req, res) => {
    try {
        const vendorToken = req.user.token;
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 4;
        const { status } = req.query;

        const wallet = await getOrCreateWallet({
            user_token: vendorToken,
            role: 'VENDOR'
        });

        const offset = (page - 1) * limit;

        const whereCondition = { wallet_id: wallet.id };

        if (status) {
            if (status === 'COMPLETED') {
                whereCondition.status = 'SUCCESS';
            } else if (status === 'FAILED') {
                whereCondition.status = 'FAILED';
            } else if (status === 'PENDING') {
                whereCondition.status = 'PENDING';
            }
        }

        const { rows, count } = await WalletTransaction.findAndCountAll({
            where: whereCondition,
            order: [
                ['created_at', 'DESC'],
                ['id', 'DESC']
            ],
            limit,
            offset,
            attributes: [
                'id',
                'token',
                'transaction_type',
                'amount',
                'opening_balance',
                'closing_balance',
                'wallet_balance',
                'referral_balance',
                'reason',
                'reference_type',
                'reference_id',
                'status',
                'created_at'
            ]
        });

        const transactions = rows.map((txn) => ({
            id: txn.id,
            token: txn.token,
            type: txn.transaction_type,
            amount: Number(txn.amount),
            opening_balance: Number(txn.opening_balance) || 0,
            closing_balance: Number(txn.closing_balance) || 0,
            wallet_balance: Number(txn.wallet_balance) || 0,
            referral_balance: Number(txn.referral_balance) || 0,
            reason: txn.reason,
            reference_type: txn.reference_type,
            reference_id: txn.reference_id,
            status: txn.status,
            created_at: txn.created_at
        }));

        const responseObject = {
            wallet: {
                wallet_token: wallet.token,
                wallet_balance: Number(wallet.wallet_balance) || 0,
                referral_balance: Number(wallet.referral_balance) || 0,
                total_balance: Number(wallet.total_balance) || 0,
                last_transaction_at: wallet.last_transaction_at,
                created_at: wallet.created_at,
                updated_at: wallet.updated_at
            },
            transactions: {
                docs: transactions,
                page,
                limit,
                totalDocs: count,
                totalPages: Math.ceil(count / limit)
            }
        };

        return res.json(
            responseData(
                'Wallet summary fetched successfully',
                responseObject,
                req,
                true
            )
        );
    } catch (err) {
        console.error('❌ wallet summary error:', err);

        return res.status(500).json(
            responseData('Failed to fetch wallet summary', {}, req, false)
        );
    }
});

router.post('/wallet/create-order', [vendorMiddleware, verifiedOnly], async (req, res) => {
    try {
        const { amount } = req.body;
        const vendorToken = req.user.token;

        const numericAmount = Number(amount);

        if (!numericAmount || numericAmount <= 0) {
            return res.status(400).json(
                responseData('Invalid amount', {}, req, false)
            );
        }

        if (numericAmount < 100) {
            return res.status(400).json(
                responseData('Minimum amount is 100', {}, req, false)
            );
        }

        const wallet = await getOrCreateWallet({
            user_token: vendorToken,
            role: 'VENDOR'
        });

        const currentWalletBalance = Number(wallet.wallet_balance) || 0;
        const currentReferralBalance = Number(wallet.referral_balance) || 0;
        const currentTotalBalance = Number(wallet.total_balance) || 0;

        const amountInPaise = Math.round(numericAmount * 100);

        if (!Number.isInteger(amountInPaise) || amountInPaise <= 0) {
            return res.status(400).json(
                responseData('Invalid amount value', {}, req, false)
            );
        }

        const order = await razorpay.orders.create({
            amount: amountInPaise,
            currency: 'INR',
            receipt: `wallet_${wallet.id}_${Date.now()}`,
            notes: {
                wallet_id: String(wallet.id),
                vendor_token: vendorToken,
                purpose: 'ADD_MONEY'
            }
        });

        await WalletTransaction.create({
            token: randomstring(64),
            wallet_id: wallet.id,
            transaction_type: 'CREDIT',
            amount: numericAmount,
            opening_balance: currentTotalBalance,
            closing_balance: currentTotalBalance,
            wallet_balance: currentWalletBalance,
            referral_balance: currentReferralBalance,
            reason: 'ADD_MONEY',
            reference_type: 'RAZORPAY_ORDER',
            reference_id: order.id,
            status: 'PENDING'
        });

        return res.json(
            responseData(
                'Order created',
                {
                    order_id: order.id,
                    razorpay_key: RAZORPAY_KEY_ID,
                    amount: order.amount,
                    currency: order.currency,
                    wallet: {
                        wallet_token: wallet.token,
                        wallet_balance: currentWalletBalance,
                        referral_balance: currentReferralBalance,
                        total_balance: currentTotalBalance
                    }
                },
                req,
                true
            )
        );
    } catch (err) {
        console.error('❌ create-order error:', err);
        return res.status(500).json(
            responseData('Order creation failed', {}, req, false)
        );
    }
});

router.post('/wallet/verify-payment', [vendorMiddleware, verifiedOnly], async (req, res) => {
    const t = await db.sequelize.transaction();

    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        } = req.body;

        const vendorToken = req.user.token;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            await t.rollback();
            return res.status(400).json(
                responseData('razorpay_order_id, razorpay_payment_id and razorpay_signature are required', {}, req, false)
            );
        }

        const wallet = await getOrCreateWallet({
            user_token: vendorToken,
            role: 'VENDOR',
            transaction: t
        });

        const lockedWallet = await db.wallet.findOne({
            where: {
                id: wallet.id,
                user_token: vendorToken,
                role: 'VENDOR',
                status: 'ACTIVE'
            },
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!lockedWallet) {
            await t.rollback();
            return res.status(404).json(
                responseData('Wallet not found', {}, req, false)
            );
        }

        const txn = await WalletTransaction.findOne({
            where: {
                wallet_id: lockedWallet.id,
                reference_type: 'RAZORPAY_ORDER',
                reference_id: razorpay_order_id,
                status: 'PENDING'
            },
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!txn) {
            await t.rollback();
            return res.status(400).json(
                responseData('Transaction not found or already processed', {}, req, false)
            );
        }

        const body = `${razorpay_order_id}|${razorpay_payment_id}`;
        const expectedSignature = crypto
            .createHmac('sha256', RAZORPAY_KEY_SECRET)
            .update(body)
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            await txn.update(
                {
                    status: 'FAILED',
                    reference_type: 'RAZORPAY_PAYMENT',
                    reference_id: razorpay_payment_id,
                    failure_reason: 'INVALID_SIGNATURE'
                },
                { transaction: t }
            );

            await t.commit();

            return res.status(400).json(
                responseData('Invalid payment signature', {}, req, false)
            );
        }

        const payment = await razorpay.payments.fetch(razorpay_payment_id);

        if (payment.order_id !== razorpay_order_id) {
            await txn.update(
                {
                    status: 'FAILED',
                    reference_type: 'RAZORPAY_PAYMENT',
                    reference_id: razorpay_payment_id,
                    failure_reason: 'ORDER_MISMATCH'
                },
                { transaction: t }
            );

            await t.commit();

            return res.status(400).json(
                responseData('Order mismatch', {}, req, false)
            );
        }

        if (payment.status !== 'captured') {
            await txn.update(
                {
                    status: 'FAILED',
                    reference_type: 'RAZORPAY_PAYMENT',
                    reference_id: razorpay_payment_id,
                    failure_reason: 'PAYMENT_NOT_CAPTURED'
                },
                { transaction: t }
            );

            await t.commit();

            return res.status(400).json(
                responseData('Payment not captured', {}, req, false)
            );
        }

        if (Number(payment.amount) !== Math.round(Number(txn.amount) * 100)) {
            await txn.update(
                {
                    status: 'FAILED',
                    reference_type: 'RAZORPAY_PAYMENT',
                    reference_id: razorpay_payment_id,
                    failure_reason: 'AMOUNT_MISMATCH'
                },
                { transaction: t }
            );

            await t.commit();

            return res.status(400).json(
                responseData('Payment amount mismatch', {}, req, false)
            );
        }

        const amount = Number(txn.amount) || 0;

        if (amount <= 0) {
            await txn.update(
                {
                    status: 'FAILED',
                    reference_type: 'RAZORPAY_PAYMENT',
                    reference_id: razorpay_payment_id,
                    failure_reason: 'INVALID_TRANSACTION_AMOUNT'
                },
                { transaction: t }
            );

            await t.commit();

            return res.status(400).json(
                responseData('Invalid transaction amount', {}, req, false)
            );
        }

        const openingWalletBalance = Number(lockedWallet.wallet_balance) || 0;
        const openingReferralBalance = Number(lockedWallet.referral_balance) || 0;
        const openingTotalBalance = Number(lockedWallet.total_balance) || 0;

        const closingWalletBalance = openingWalletBalance + amount;
        const closingReferralBalance = openingReferralBalance;
        const closingTotalBalance = closingWalletBalance + closingReferralBalance;

        await lockedWallet.update(
            {
                wallet_balance: closingWalletBalance,
                referral_balance: closingReferralBalance,
                total_balance: closingTotalBalance,
                last_transaction_at: new Date()
            },
            { transaction: t }
        );

        await txn.update(
            {
                status: 'SUCCESS',
                reference_type: 'RAZORPAY_PAYMENT',
                reference_id: razorpay_payment_id,
                opening_balance: openingTotalBalance,
                closing_balance: closingTotalBalance,
                wallet_balance: closingWalletBalance,
                referral_balance: closingReferralBalance,
                failure_reason: null
            },
            { transaction: t }
        );

        await t.commit();

        return res.json(
            responseData(
                'Wallet credited successfully',
                {
                    wallet_token: lockedWallet.token,
                    credited_amount: amount,
                    wallet_balance: closingWalletBalance,
                    referral_balance: closingReferralBalance,
                    total_balance: closingTotalBalance
                },
                req,
                true
            )
        );
    } catch (err) {
        await t.rollback();

        console.error('❌ verify-payment error:', err);

        return res.status(500).json(
            responseData('Payment verification failed', {}, req, false)
        );
    }
});

module.exports = router