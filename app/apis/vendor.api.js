const router = require('express').Router()
const crypto = require('crypto')
const razorpay = require('../config/razorpay.js');
const { Op, Transaction, Sequelize } = require("sequelize");
const { vendorMiddleware, verifiedOnly } = require('../middleware/auth.js')
const { responseData, getSequelizePagination, getCache, setCache, randomstring, generateRefCode } = require("../shared/utils/helper.js")
const { admin_url, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = require('../config/globals.js')
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
const freeVehicleCancelQueue = require('../queues/vendor/freeVehicle_queue/free_vehicle_cancel.queue.js')

// const vendorHelpQueue = require('../queues/vendor/vendor_help.queue.js')

const Vendor = db.vendor;
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


router.get('/get/dashboard', [vendorMiddleware], async (req, res) => {
    // const cacheKey = 'dashboard_data';

    try {
        // const lastUpdate = await Promise.all([
        //     SiteSlider.max('updated_at'),
        //     Counter.max('updated_at'),
        //     Review.max('updated_at'),
        //     Video.max('updated_at')
        // ]);

        // const lastModified = Math.max(...lastUpdate.map(d => new Date(d).getTime()));

        // const cached = await getCache(cacheKey);

        // if (cached && cached.lastModified === lastModified) {
        //     console.log('Serving dashboard from cache (no new updates)');
        //     return res.status(200).json(responseData('Dashboard fetched successfully (from cache)', cached.data, req, true));
        // }

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
                where: { status: 'APPROVED' },
                order: [['created_at', 'DESC']],
                limit: 5,
                include: [{
                    model: Vendor,
                    attributes: [[Sequelize.literal(`CASE WHEN profile_image IS NOT NULL THEN CONCAT('${admin_url}', profile_image) ELSE NULL END`), 'profile_image']],
                    required: false,
                    as: 'reviewer'
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
            profile_image: r.reviewer?.profile_image || null
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
    // const cacheKey = `video_${token}`;

    try {
        // const lastUpdate = await Video.max('updated_at', { where: { token } });
        // const cached = await getCache(cacheKey);

        // if (cached && cached.lastModified === new Date(lastUpdate).getTime()) {
        //     console.log(`Serving video ${token} from cache`);
        //     return res.json(responseData("Video fetched successfully (from cache)", { url: cached.url }, req, true));
        // }

        const video = await Video.findOne({
            where: { token, status: 1 }
        });

        if (!video) return res.json(responseData("Video not found", {}, req, false));

        let videoUrl = video.video_url;
        if (!videoUrl.startsWith("http")) videoUrl = `${admin_url}${video.video_url}`;

        // await setCache(cacheKey, { url: videoUrl, lastModified: new Date(video.updated_at).getTime() }, 300);

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

router.get('/get/help/data', vendorMiddleware, async (req, res) => {
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
            COMPLETED: 'ANSWERED'
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
        // const cacheKey = `my_free_vehicle_with_requests_${vendorToken}_${page}_${limit}_${status || 'all'}_${date || 'all'}_${vehicle_type || 'all'}`;

        // const lastUpdate = await db.freeVehicle.max('updated_at', { where: { vendor_token: vendorToken } });
        // const cached = await getCache(cacheKey);

        // if (cached && cached.lastModified === new Date(lastUpdate).getTime()) {
        //     return res.status(200).json(
        //         responseData('My free vehicles fetched successfully (from cache)', cached.data, req, true)
        //     );
        // }

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
            attributes: { exclude: ['updated_at', 'flag', 'id'] },
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
                    as: 'requests',               // ⚠️ use your actual alias
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
        // const cacheKey = `free_vehicle_requests_${freeVehicleToken}_${page}_${limit}_${type}_${status}`;

        // const lastUpdate = await db.requestFreeVehicle.max('updated_at', {
        //     where: { free_vehicle_token: freeVehicleToken }
        // });

        // const cached = await getCache(cacheKey);

        // if (cached && cached.lastModified === new Date(lastUpdate).getTime()) {
        //     return res.status(200).json(
        //         responseData('Free vehicle requests fetched successfully (from cache)', cached.data, req, true)
        //     );
        // }

        const result = await getSequelizePagination({
            page,
            limit,
            model: db.requestFreeVehicle,
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
                    model: db.freeVehicle,
                    as: 'freeVehicle',
                    required: true,
                    where: { token: freeVehicleToken, accept_type: type },
                    attributes: ['token']
                },
                {
                    model: db.vendor,
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
                    token: row.requester.token,
                    first_name: row.requester.first_name,
                    last_name: row.requester.last_name,
                    contact: row.requester.contact,
                    acceptedAt: row.get('created_at'),
                    status: row.get('status')
                }
                : null
        }));

        // await setCache(cacheKey, { data: { docs: data, page: result.page, limit: result.limit, totalDocs: result.totalDocs, totalPages: result.totalPages }, lastModified: new Date(lastUpdate).getTime() }, 300);

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

        // const cacheKey = `all_vehicle_${vendorToken}_${page}_${limit}_${search || 'all'}`;

        // const lastUpdate = await FreeVehicle.max('updated_at', {
        //     where: {
        //         city: { [Op.in]: Array.isArray(rawSavedCities) ? rawSavedCities : [] },
        //         status: 'AVAILABLE',
        //         vendor_token: { [Op.ne]: vendorToken }
        //     }
        // });

        // const cached = await getCache(cacheKey);

        // if (cached && cached.lastModified === new Date(lastUpdate).getTime()) {
        //     return res.status(200).json(
        //         responseData('Vehicle leads fetched successfully (from cache)', cached.data, req, true)
        //     );
        // }

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
                'token',
                'vehicle_type',
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
        // const cacheKey = `my_accepted_free_vehicles_${vendorToken}_${page}_${limit}`;

        // const lastUpdate = await db.freeVehicle.max('updated_at', {
        //     where: { vendor_token: vendorToken }
        // });

        // const cached = await getCache(cacheKey);

        // if (cached && cached.lastModified === new Date(lastUpdate).getTime()) {
        //     return res.status(200).json(
        //         responseData('Accepted free vehicles fetched successfully (from cache)', cached.data, req, true)
        //     );
        // }

        const { count, rows } = await db.freeVehicle.findAndCountAll({
            where: {
                vendor_token: vendorToken,
                status: { [db.Sequelize.Op.in]: ['AVAILABLE', 'REQUESTED', 'BOOKED', 'EXPIRED'] },
                flag: 0
            },
            attributes: [
                'id',
                'token',
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
                    model: db.requestFreeVehicle,
                    as: 'requests',
                    required: false,
                    where: {
                        status: 'ACCEPTED',
                        accepted_by_vendor_token: vendorToken
                    },
                    attributes: [
                        'id',
                        'token',
                        'requested_by_vendor_token',
                        'requested_start_time',
                        'requested_end_time',
                        'accepted_at',
                        'status'
                    ],
                    include: [
                        {
                            model: db.vendor,
                            as: 'requester',
                            required: false,
                            attributes: ['first_name', 'last_name', 'contact']
                        }
                    ]
                }
            ],
            order: [
                ['status', 'ASC'],
                ['created_at', 'DESC']
            ],
            limit,
            offset,
            distinct: true
        });

        const responseDataObj = {
            total: count,
            page,
            limit,
            free_vehicles: rows
        };

        // await setCache(cacheKey, { data: responseDataObj, lastModified: new Date(lastUpdate).getTime() }, 300);

        return res.status(200).json(
            responseData('Accepted free vehicles fetched successfully', responseDataObj, req, true)
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

        // const activeCount = await FreeVehicle.count({
        //     where: {
        //         vendor_token: vendorToken,
        //         status: { [Op.in]: ['AVAILABLE', 'REQUESTED'] }
        //     },
        //     transaction: t,
        //     lock: t.LOCK.UPDATE
        // });

        // if (activeCount >= 5) {
        //     await t.rollback();
        //     return res.status(429).json(
        //         responseData('Free vehicle posting limit reached', {}, req, false)
        //     );
        // }

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
                status: ['AVAILABLE', 'REQUESTED']
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
                    requested_start_time,
                    requested_end_time,
                    status: 'ACCEPTED',
                    accepted_at: new Date(),
                    accepted_by_vendor_token: owner.token
                },
                { transaction: t }
            );

            await t.commit();

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

            return res.status(200).json(
                responseData('Vehicle booked successfully', {}, req, true)
            );
        }

        const existingRequest = await FreeVehicleRequest.findOne({
            where: {
                free_vehicle_token: freeVehicle.token,
                requested_by_vendor_token: requester.token,
                status: ['PENDING', 'ACCEPTED']
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
                requested_start_time,
                requested_end_time,
                status: 'PENDING'
            },
            { transaction: t }
        );

        if (freeVehicle.status === 'AVAILABLE') {
            await freeVehicle.update(
                { status: 'AVAILABLE' },
                { transaction: t }
            );
        }

        await t.commit();

        res.status(200).json(
            responseData('Request sent successfully', {}, req, true)
        );

        const io = getIO();
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

router.post('/free-vehicle/:token/request-action', [vendorMiddleware, verifiedOnly, vendorValidation.validate('free-vehicle-request-action')], async (req, res) => {
    const { action, reason } = req.body;
    const { token } = req.params
    const vendor = req.user;

    console.log('action ->>>>> ', action)

    const t = await db.sequelize.transaction({
        isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED
    });

    try {
        const request = await FreeVehicleRequest.findOne({
            where: {
                token,
                status: 'PENDING'
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
            return res.status(404).json(
                responseData('Request not found or already handled', {}, req, false)
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

            await request.update({
                status: 'ACCEPTED',
                accepted_at: new Date(),
                accepted_by_vendor_token: vendor.token
            }, { transaction: t });

            await freeVehicle.update({
                status: 'BOOKED',
                booked_by_vendor_token: request.requested_by_vendor_token,
                booked_at: new Date()
            }, { transaction: t });

            await FreeVehicleRequest.update(
                { status: 'REJECTED' },
                {
                    where: {
                        free_vehicle_token: freeVehicle.token,
                        status: 'PENDING',
                        id: { [db.Sequelize.Op.ne]: request.token }
                    },
                    transaction: t
                }
            );

        } else {
            await request.update({
                status: 'REJECTED',
                rejections_reason: reason
            }, { transaction: t });

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
                message: `Your request was ${action.toLowerCase()} by ${vendor.first_name + ' ' + vendor.last_name}`,
                visibility: 'private'
            }
        ]);

        return res.status(200).json(
            responseData(`Request ${action.toLowerCase()}ed successfully`, {}, req, true)
        );

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

        return res.status(200).json(
            responseData('Request cancelled successfully', {}, req, true)
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
                'aadhaar_verified',
                'dl_verified',
                'verification_status',
                'verification_percentage'
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

router.post('/update-basic-details', [vendorMiddleware, uploadImages, vendorValidation.validate('basic-details')], async (req, res) => {
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
        // const io = getIO();

        // const verification_status = req?.user?.verification_status
        // const VP = req?.user?.verification_percentage

        // if (!req.files?.identity_front_image || !req.files?.identity_back_image) {
        //     return res.status(400).json(
        //         responseData('Both identity images are required', {}, req, false)
        //     )
        // }

        if (!req.files?.profile_image) {
            return res.status(400).json(
                responseData('Profile image is required', {}, req, false)
            )
        }

        // const frontImage = `/uploads/${req.files.identity_front_image[0].filename}`
        // const backImage = `/uploads/${req.files.identity_back_image[0].filename}`
        const profileImage = `/uploads/${req.files.profile_image[0].filename}`

        // const { vp, vp_status } = calculateVerificationPercentage({ name, city, state }, VP, verification_status)

        const ref = generateRefCode({
            role: "vendor",
            state: "Rajasthan"
        });

        const updateData = {
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
            ref_code: ref,
            /*identity_type,*/
            /*identity_front_image: frontImage,*/
            /*identity_back_image: backImage,*/
            profile_image: profileImage
            /*verification_percentage: vp,*/
            // verification_status: 'PARTIAL',
            /*identity_submitted_at: new Date()*/
        };

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

        const { page = 1, limit = 12, accept_type, status } = req.query;
        const vendorToken = req.user.token;

        const siteSettings = await SiteSetting.findOne({
            attributes: [
                'send_to_all_cities',
                'city_filter_enabled',
                'selected_cities'
            ],
            raw: true
        });

        const {
            send_to_all_cities,
        } = siteSettings || {};

        const rawSavedCities = req.user.preferred_cities;

        let normalizedCities = null;

        if (!send_to_all_cities) {

            let cityArray = [];

            if (Array.isArray(rawSavedCities)) {
                cityArray = rawSavedCities;
            } else if (typeof rawSavedCities === 'string') {
                try {
                    cityArray = JSON.parse(rawSavedCities);
                } catch {
                    cityArray = rawSavedCities.split(',').map(c => c.trim());
                }
            }

            normalizedCities = cityArray.map(c => c.trim());
        }

        const whereCondition = {
            vendor_token: {
                [Op.ne]: vendorToken
            },
            status: {
                [Op.ne]: 'EXPIRED'
            },
            [Op.not]: [
                {
                    status: 'ACCEPTED',
                    accept_type: 'INSTANT'
                }
            ]
        };

        // Apply city filter ONLY if global toggle is OFF
        if (normalizedCities && normalizedCities.length) {
            whereCondition.city = {
                [Op.in]: normalizedCities
            };
        }

        if (accept_type) {
            whereCondition.accept_type = accept_type.toUpperCase();
        }

        if (status) {
            whereCondition.status = status.toUpperCase();
        }

        const result = await getSequelizePagination({
            page,
            limit,
            model: Booking,
            where: whereCondition,
            order: [['created_at', 'DESC']],
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
                        '$Booking.vendor_token$': {
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
                ]
            ],

            group: [
                'Booking.id',
                'vendor.id'
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
                            WHERE br.booking_token = Booking.token
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
                        'id',
                        'token',
                        'first_name',
                        'last_name',
                        'contact',
                        'verification_status'
                    ],
                    on: {
                        '$Booking.vendor_token$': {
                            [Op.eq]: Sequelize.col('vendor.token')
                        }
                    }
                }
            ]
        });

        console.log(booking)

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
                            FROM tbl_booking_rating br
                            WHERE br.booking_token = Booking.token
                        )`),
                    'rating_quality'
                ]
            ],

            include: [
                // Booking Owner
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
                    ],
                    on: {
                        '$Booking.vendor_token$': {
                            [Op.eq]: Sequelize.col('vendor.token')
                        }
                    }
                },

                // Booking Requests
                {
                    model: db.bookingRequest,
                    as: 'booking_requests',
                    required: false,
                    attributes: [
                        'token',
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
                                'contact',
                                'profile_image'
                            ],
                            on: {
                                '$booking_requests.requested_by_vendor_token$': {
                                    [Op.eq]: Sequelize.col('booking_requests->requester.token')
                                }
                            }
                        }
                    ]
                },

                // Booking Rejections
                {
                    model: db.bookingRejection,
                    as: 'booking_rejections',
                    required: false,
                    attributes: [
                        'token',
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
                                'contact',
                                'profile_image'
                            ],
                            on: {
                                '$booking_rejections.rejected_by_token$': {
                                    [Op.eq]: Sequelize.col('booking_rejections->rejecter.token')
                                }
                            }
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
            booking.booking_requests?.find(r => r.status === 'ACCEPTED') || null;

        const rejectedRequests =
            booking.booking_requests?.filter(r => r.status === 'REJECTED') || [];

        const responseDataObj = {
            booking,
            accepted_request: acceptedRequest,
            rejected_requests: rejectedRequests,
            rejections: booking.booking_rejections || []
        };

        return res.status(200).json(
            responseData('Booking fetched successfully', responseDataObj, req, true)
        );

    } catch (error) {
        console.error('Get booking with requests error:', error);
        return res.status(500).json(
            responseData('Error occurred', {}, req, false)
        );
    }
});

router.get('/my-bookings', [vendorMiddleware, verifiedOnly], async (req, res) => {
    try {
        const vendorToken = req.user.token;
        const { page = 1, limit = 12, type } = req.query;

        const whereClause = {
            vendor_token: vendorToken
        };

        if (type) {
            const normalizedType = type.toUpperCase();
            if (!['APPROVAL', 'INSTANT'].includes(normalizedType)) {
                return res.status(400).json(
                    responseData('Invalid booking type filter', {}, req, false)
                );
            }
            whereClause.accept_type = normalizedType;
        }

        const paginatedResult = await getSequelizePagination({
            model: Booking,
            page,
            limit,
            where: whereClause,
            order: [['created_at', 'DESC']],
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
                        '$Booking.vendor_token$': {
                            [Op.eq]: Sequelize.col('vendor.token')
                        }
                    }
                }
            ],

            attributes: [
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
                        WHERE br.booking_token = Booking.token
                    )`),
                    'rating_quality'
                ]
            ]
        });

        const responseDataObj = {
            bookings: paginatedResult.docs,
            applied_filter: type || 'ALL',
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

router.get('/my/accepted/booking', [vendorMiddleware, verifiedOnly], async (req, res) => {
    try {
        const vendorToken = req.vendor.token;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        // const cacheKey = `my_accepted_booking_${vendorToken}_${page}_${limit}`;
        // const lastUpdate = await db.booking.max('updated_at', {
        //     where: {
        //         vendor_token: vendorToken,
        //         status: { [db.Sequelize.Op.in]: ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'] },
        //         flag: 0
        //     }
        // });

        // const cached = await getCache(cacheKey);
        // if (cached && cached.lastModified === new Date(lastUpdate).getTime()) {
        //     return res.status(200).json(
        //         responseData('Accepted bookings fetched successfully (from cache)', cached.data, req, true)
        //     );
        // }

        const { count, rows } = await db.booking.findAndCountAll({
            where: {
                vendor_token: vendorToken,
                status: { [db.Sequelize.Op.in]: ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'] },
                flag: 0
            },
            attributes: [
                'id',
                'token',
                'trip_type',
                'vehicle_type',
                'vehicle_name',
                'pickup_datetime',
                'return_datetime',
                'pickup_location',
                'drop_location',
                'city',
                'state',
                'booking_amount',
                'commission',
                'total_amount',
                'accept_type',
                'status',
                'created_at'
            ],
            include: [
                {
                    model: db.bookingRequest,
                    as: 'booking_requests',
                    required: false,
                    where: {
                        status: 'ACCEPTED',
                        owner_vendor_token: vendorToken
                    },
                    attributes: [
                        'id',
                        'token',
                        'requested_by_vendor_token',
                        'responded_at',
                        'remarks'
                    ]
                }
            ],
            order: [['created_at', 'DESC']],
            limit,
            offset
        });

        const responseDataObj = {
            total: count,
            page,
            limit,
            bookings: rows
        };

        // await setCache(cacheKey, { data: responseDataObj, lastModified: new Date(lastUpdate).getTime() }, 300);

        return res.status(200).json(
            responseData('Accepted bookings fetched successfully', responseDataObj, req, true)
        );

    } catch (error) {
        console.error('My accepted booking error:', error);
        return res.status(500).json(
            responseData('Error occurred', {}, req, false)
        );
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
                'created_at',
            ],
            include: [
                // ===============================
                // BOOKING REQUESTS (includes BID)
                // ===============================
                {
                    model: db.bookingRequest,
                    as: 'booking_requests',
                    required: false,
                    on: {
                        '$booking.token$': {
                            [Sequelize.Op.eq]: Sequelize.col(
                                'booking_requests.booking_token'
                            ),
                        },
                    },
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
                            model: db.vendor,
                            as: 'requester',
                            required: false,
                            on: {
                                '$booking_requests.requested_by_vendor_token$': {
                                    [Sequelize.Op.eq]: Sequelize.col(
                                        'booking_requests->requester.token'
                                    ),
                                },
                            },
                            attributes: [
                                'token',
                                'first_name',
                                'last_name',
                                'contact',
                            ],
                        },
                    ],
                },

                // ===============================
                // BOOKING REJECTIONS
                // ===============================
                {
                    model: db.bookingRejection,
                    as: 'booking_rejections',
                    required: false,
                    on: {
                        '$booking.token$': {
                            [Sequelize.Op.eq]: Sequelize.col(
                                'booking_rejections.booking_token'
                            ),
                        },
                    },
                    attributes: [
                        'token',
                        'reason',
                        'rejected_by_token',
                        'created_at',
                    ],
                    include: [
                        {
                            model: db.vendor,
                            as: 'rejecter',
                            required: false,
                            on: {
                                '$booking_rejections.rejected_by_token$': {
                                    [Sequelize.Op.eq]: Sequelize.col(
                                        'booking_rejections->rejecter.token'
                                    ),
                                },
                            },
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
                    { model: db.bookingRequest, as: 'booking_requests' },
                    'created_at',
                    'DESC',
                ],
                [
                    { model: db.bookingRejection, as: 'booking_rejections' },
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
            booking.booking_requests?.find(
                (r) => r.status === 'ACCEPTED'
            ) || null;

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
            booking.booking_rejections?.map((rej) => ({
                token: rej.token,
                reason: rej.reason,
                rejected_at: rej.created_at,

                vendor: rej.rejecter
                    ? {
                        token: rej.rejecter.token,
                        first_name: rej.rejecter.first_name,
                        last_name: rej.rejecter.last_name,
                        contact: rej.rejecter.contact,
                    }
                    : null,
            })) || [];

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

            accepted_by: acceptedRequest
                ? {
                    accepted_at: acceptedRequest.created_at,
                    vendor: acceptedRequest.requester
                        ? {
                            token:
                                acceptedRequest.requester.token,
                            first_name:
                                acceptedRequest.requester.first_name,
                            last_name:
                                acceptedRequest.requester.last_name,
                            contact:
                                acceptedRequest.requester.contact,
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
        console.error(
            'Booking request overview error:',
            error
        );

        return res.status(500).json(
            responseData('Error occurred', {}, req, false)
        );
    }
});

// router.post('/post-booking', [vendorMiddleware, verifiedOnly, vendorValidation.validate('post-booking')], async (req, res) => {
//     try {
//         const {
//             trip_type,
//             vehicle_type,
//             vehicle_name,
//             pickup_datetime,
//             return_datetime,
//             pickup_location,
//             drop_location,
//             city,
//             state,
//             accept_type,
//             booking_amount,
//             commission = 0,
//             total_amount,
//             is_negotiable = false,
//             secure_booking = false,
//             visibility = 'public',
//             extra_requirements = {}
//         } = req.body;

//         const vendorToken = req.user.token;

//         const pickupDate = new Date(pickup_datetime);
//         if (isNaN(pickupDate.getTime()) || pickupDate < new Date()) {
//             return res
//                 .status(400)
//                 .json(responseData('Invalid pickup date', {}, req, false));
//         }

//         let returnDate = null;
//         if (trip_type === 'round_trip') {
//             returnDate = new Date(return_datetime);
//             if (isNaN(returnDate.getTime()) || returnDate <= pickupDate) {
//                 return res
//                     .status(400)
//                     .json(responseData('Invalid return date', {}, req, false));
//             }
//         }

//         const booking = await Booking.create({
//             token: randomstring(64),
//             vendor_token: vendorToken,
//             trip_type: trip_type.toUpperCase(),
//             vehicle_type,
//             vehicle_name,
//             pickup_datetime: pickupDate,
//             return_datetime: returnDate,
//             pickup_location,
//             drop_location,
//             city,
//             state,
//             accept_type: accept_type.toUpperCase(),
//             booking_amount,
//             commission,
//             total_amount,
//             is_negotiable,
//             secure_booking,
//             visibility: visibility.toUpperCase(),
//             extra_requirements
//         });

//         res.status(201).json(
//             responseData('Booking posted successfully', {}, req, true)
//         );

//         bookingQueue.add(
//             'BOOKING_CREATED',
//             {
//                 bookingToken: booking.token,
//                 city: booking.city,
//                 vehicle_type: booking.vehicle_type
//             },
//             {
//                 jobId: `bookingCreated_${booking.token}`,
//                 removeOnComplete: true
//             }
//         ).catch(err => {
//             console.error('[BOOKING QUEUE ERROR]', err);
//         });

//         (async () => {
//             try {
//                 const io = getIO();

//                 const vendors = await Vendor.findAll({
//                     where: Sequelize.and(
//                         { flag: 0 },
//                         { token: { [Op.ne]: vendorToken } },
//                         { booking_notification_enabled: true },
//                         Sequelize.literal(`JSON_CONTAINS(preferred_cities, '"${city}"')`)
//                     ),
//                     attributes: ['token'],
//                     raw: true
//                 });

//                 vendors.forEach(v => {
//                     io.to(`vendor:${v.token}`).emit('new_duty_alert', {
//                         booking_token: booking.token,
//                         vehicle_type: booking.vehicle_type,
//                         city: booking.city,
//                         title: 'LehConnect require',
//                         message: `New ${booking.vehicle_type} ${booking.vehicle_name} trip available in ${booking.city} at ${booking.pickup_datetime}`
//                     });
//                 });
//             } catch (socketErr) {
//                 console.error('[BOOKING SOCKET ERROR]', socketErr);
//             }
//         })();

//     } catch (error) {
//         console.error('Post booking error:', error);
//         return res
//             .status(500)
//             .json(responseData('Error occurred', {}, req, false));
//     }
// });

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

        // console.log('body ->>> ', req.body)

        // process.exit(1)

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
            booking_notification_enabled: true
        };

        if (!send_to_all_cities) {

            whereCondition.preferred_cities = {
                [Op.like]: `%${booking.city}%`
            };
        }

        /* -------------------- RESPONSE -------------------- */
        res.status(201).json(
            responseData('Booking posted successfully', booking, req, true)
        );
        /* -------------------- QUEUE -------------------- */
        bookingQueue.add(
            'BOOKING_CREATED',
            {
                bookingToken: booking.token,
                city: booking.city,
                vehicle_type: booking.vehicle_type
            },
            {
                jobId: `bookingCreated_${booking.token}`,
                removeOnComplete: true
            }
        ).catch(console.error);
        /* -------------------- SOCKET -------------------- */
        const formattedPickupDate = pickupDate.toLocaleString('en-IN');
        const io = getIO();
        const vendors = await Vendor.findAll({
            where: whereCondition,
            attributes: ['token'],
            raw: true
        });

        vendors.forEach(v => {
            io.to(`vendor:${v.token}`).emit('new_duty_alert', {
                booking_token: booking.token,
                vehicle_type: booking.vehicle_type,
                city: booking.city,
                title: 'New Booking',
                message: `New ${booking.vehicle_type} trip in ${booking.city} at ${formattedPickupDate}`
            });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json(
            responseData('Server Error', {}, req, false)
        );

    }
});

router.post('/booking/:token/request-action', [vendorMiddleware, verifiedOnly, vendorValidation.validate('booking-request-action')], async (req, res) => {

    const t = await db.sequelize.transaction();

    try {

        const { action, reason, request_token } = req.body;
        const ownerToken = req.user.token;
        const ownerRole = req.user.role;
        const bookingToken = req.params.token;

        if (!['accept', 'reject', 'ACCEPT', 'REJECT'].includes(action)) {
            await t.rollback();
            return res.status(400).json(
                responseData('Invalid action type', {}, req, false)
            );
        }

        /* =========================
           FETCH BOOKING
        ========================== */
        const booking = await db.booking.findOne({
            where: { token: bookingToken },
            attributes: ['token', 'vendor_token', 'accept_type', 'status'],
            include: [{
                model: db.bookingRequest,
                as: 'booking_requests',
                attributes: [
                    'token',
                    'requested_by_vendor_token',
                    'status',
                    'accept_type',
                    'bid_amount'
                ]
            }],
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

        if (!['APPROVAL', 'BID'].includes(booking.accept_type)) {
            await t.rollback();
            return res.status(400).json(
                responseData('Invalid booking type for request action', {}, req, false)
            );
        }

        /* =========================
           FIND TARGET REQUEST
        ========================== */

        let bookingRequest;

        if (booking.accept_type === 'APPROVAL') {

            bookingRequest = booking.booking_requests?.find(
                r => r.status === 'PENDING'
            );

        } else {
            // BID → require specific request_token
            if (!request_token) {
                await t.rollback();
                return res.status(400).json(
                    responseData('Request token required for bid action', {}, req, false)
                );
            }

            bookingRequest = booking.booking_requests?.find(
                r => r.token === request_token && r.status === 'PENDING'
            );
        }

        if (!bookingRequest) {
            await t.rollback();
            return res.status(400).json(
                responseData('Invalid booking request state', {}, req, false)
            );
        }

        if ((action.toUpperCase() === 'REJECT') && !reason) {
            await t.rollback();
            return res.status(400).json(
                responseData('Reject reason required', {}, req, false)
            );
        }

        const finalStatus =
            action.toUpperCase() === 'ACCEPT'
                ? 'ACCEPTED'
                : 'REJECTED';

        /* =========================
           UPDATE SELECTED REQUEST
        ========================== */

        await db.bookingRequest.update(
            {
                status: finalStatus,
                responded_at: new Date(),
                remarks: finalStatus === 'REJECTED' ? reason : null
            },
            { where: { token: bookingRequest.token }, transaction: t }
        );

        /* =========================
           IF ACCEPT → UPDATE BOOKING
        ========================== */

        if (finalStatus === 'ACCEPTED') {

            await db.booking.update(
                { status: 'ACCEPTED' },
                { where: { token: bookingToken }, transaction: t }
            );

            // 🔥 If BID → Reject all other bids automatically
            if (booking.accept_type === 'BID') {

                await db.bookingRequest.update(
                    {
                        status: 'REJECTED',
                        responded_at: new Date(),
                        remarks: 'Another bid accepted'
                    },
                    {
                        where: {
                            booking_token: bookingToken,
                            status: 'PENDING',
                            token: { [db.Sequelize.Op.ne]: bookingRequest.token }
                        },
                        transaction: t
                    }
                );
            }
        }

        await t.commit();

        /* =========================
           SOCKET EVENT
        ========================== */
        const io = getIO();

        io.to(`vendor:${bookingRequest.requested_by_vendor_token}`).emit(
            'booking:request-action',
            {
                event:
                    finalStatus === 'ACCEPTED'
                        ? 'BOOKING_REQUEST_ACCEPTED'
                        : 'BOOKING_REQUEST_REJECTED',
                booking_token: bookingToken,
                request_token: bookingRequest.token,
                action: finalStatus
            }
        );

        /* =========================
           QUEUE EVENT
        ========================== */
        await bookingRequestActionQueue.add('REQUEST_ACTION', {
            bookingToken,
            requestToken: bookingRequest.token,
            receiverVendorToken: bookingRequest.requested_by_vendor_token,
            action: finalStatus,
            reason: finalStatus === 'REJECTED' ? reason : null,
            actorToken: ownerToken
        });

        return res.status(200).json(
            responseData(
                `Booking request ${finalStatus.toLowerCase()} successfully`,
                {
                    booking_token: bookingToken,
                    request_token: bookingRequest.token,
                    status: finalStatus,
                    accepted_bid_amount:
                        booking.accept_type === 'BID' && finalStatus === 'ACCEPTED'
                            ? bookingRequest.bid_amount
                            : null
                },
                req,
                true
            )
        );

    } catch (error) {

        await t.rollback();
        console.error('Booking request action error:', error);

        return res.status(500).json(
            responseData('Error occurred', {}, req, false)
        );
    }
});

router.post('/booking/:token/accept', [vendorMiddleware, verifiedOnly, vendorValidation.validate('booking-accept')], async (req, res) => {

    const t = await db.sequelize.transaction();

    try {
        const requesterToken = req.user.token;
        const { token } = req.params;
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
                    model: BookingRequest,
                    as: 'booking_requests',
                    required: false,
                    attributes: ['token', 'status'],
                    where: {
                        requested_by_vendor_token: requesterToken
                    }
                },
                {
                    model: BookingReject,
                    as: 'booking_rejections',
                    required: false,
                    attributes: ['token'],
                    where: {
                        rejected_by_token: requesterToken
                    }
                }
            ],
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!booking) {
            await t.rollback();
            return res.status(404).json(responseData('Booking not found', {}, req, false));
        }

        if (booking.vendor_token === requesterToken) {
            await t.rollback();
            return res.status(404).json(responseData('You can not booking own booking', {}, req, false));
        }

        if (booking.status !== 'OPEN') {
            await t.rollback();
            return res.status(404).json(responseData('Booking is not available or already processed', {}, req, false));
        }

        if (new Date(booking.pickup_datetime) <= now) {
            await t.rollback();
            return res.status(404).json(responseData('Booking pickup time expired', {}, req, false));
        }

        if (booking.booking_requests?.length) {
            await t.rollback();
            return res.status(404).json(responseData('Already requested this booking', {}, req, false));
        }

        if (booking.booking_rejections?.length) {
            await t.rollback();
            return res.status(404).json(responseData('You are not allowed to book this booking', {}, req, false));
        }

        const bookingRequest = await BookingRequest.create(
            {
                token: randomstring(64),
                booking_token: booking.token,
                requested_by_vendor_token: requesterToken,
                owner_vendor_token: booking.vendor_token,
                accept_type: booking.accept_type,
                status:
                    booking.accept_type === 'INSTANT' ? 'ACCEPTED' : 'PENDING',
                responded_at:
                    booking.accept_type === 'INSTANT' ? new Date() : null
            },
            { transaction: t }
        );

        if (booking.accept_type === 'INSTANT') {

            const [updated] = await Booking.update(
                { status: 'ACCEPTED' },
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
                return res.status(404).json(responseData('Booking already taken', {}, req, false));
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

            // Queue push notifications
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

            return res.status(201).json(
                responseData(
                    'Booking accepted successfully',
                    {
                        booking_token: booking.token,
                        booking_request_token: bookingRequest.token
                    },
                    req,
                    true
                )
            );
        }

        // for approval type
        await Notification.create(
            {
                sender_token: requesterToken,
                receiver_token: booking.vendor_token,
                receiver_role: 'vendor',
                booking_token: booking.token,
                type: 'BOOKING_REQUEST',
                title: 'New booking request',
                message: 'A vendor has requested your booking.',
                visibility: 'private'
            },
            { transaction: t }
        );

        await t.commit();

        await bookingNotificationQueue.add('approval-request', {
            receiver_token: booking.vendor_token,
            type: 'BOOKING_REQUEST',
            title: 'New Booking Request',
            message: 'A vendor has requested your booking.',
            booking_token: booking.token,
            event: 'booking:request'
        });

        return res.status(201).json(
            responseData(
                'Booking request sent successfully',
                {
                    booking_token: booking.token,
                    booking_request_token: bookingRequest.token
                },
                req,
                true
            )
        );

    } catch (error) {
        await t.rollback();
        console.error('Booking accept error:', error);
        return res.status(500).json(responseData('Error occured', {}, req, false))
    }
});

router.post('/booking/:token/reject', [vendorMiddleware, verifiedOnly, vendorValidation.validate('booking-reject')], async (req, res) => {

    const t = await db.sequelize.transaction();

    try {
        const { reason } = req.body;
        const rejecterToken = req.user.token;
        const rejecterRole = req.user.role;
        const bookingToken = req.params.token;

        const booking = await Booking.findOne({
            where: { token: bookingToken },
            attributes: ['token', 'vendor_token', 'status'],
            include: [
                {
                    model: BookingRequest,
                    as: 'booking_requests',
                    required: false,
                    attributes: ['token', 'status']
                },
                {
                    model: BookingReject,
                    as: 'booking_rejections',
                    required: false,
                    attributes: ['token']
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

        if (booking.booking_requests?.some(br => br.status === 'ACCEPTED')) {
            await t.rollback();
            return res.status(400).json(
                responseData('Booking already accepted', {}, req, false)
            );
        }

        if (booking.booking_requests?.some(br => br.status === 'PENDING')) {
            await t.rollback();
            return res.status(400).json(
                responseData('Booking request still pending', {}, req, false)
            );
        }

        if (booking.booking_rejections?.length) {
            await t.rollback();
            return res.status(400).json(
                responseData('Booking already rejected', {}, req, false)
            );
        }

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

        await Booking.update(
            { status: 'REJECTED' },
            {
                where: { token: bookingToken, status: 'OPEN' },
                transaction: t
            }
        );

        await t.commit();

        // **ENQUEUE NOTIFICATION BEFORE RESPONDING**
        await bookingNotificationQueue.add('booking-rejected', {
            booking_token: bookingToken,
            receiver_token: booking.vendor_token,
            type: 'BOOKING_REJECTED',
            title: 'Booking Rejected',
            message: reason || 'Your booking has been rejected.',
            event: 'booking:rejected',
            rejected_by: rejecterToken,
            role: rejecterRole
        });

        // Socket emit (if needed)
        const io = getIO();
        io?.to(`vendor:${booking.vendor_token}`).emit(
            'booking:rejected',
            {
                booking_token: bookingToken,
                reason
            }
        );

        return res.status(200).json(
            responseData('Booking rejected successfully', {}, req, true)
        );

    } catch (error) {
        await t.rollback();
        console.error('Booking rejection error:', error);
        return res.status(500).json(
            responseData('Error occurred', {}, req, false)
        );
    }
});

router.post('/booking/:token/bid', [vendorMiddleware, verifiedOnly, vendorValidation.validate('bid-booking')], async (req, res) => {
    const t = await db.sequelize.transaction();
    try {

        const bidderToken = req.user.token;
        const { token } = req.params;

        console.log('bidder token ->>>>> ', bidderToken)

        const {
            bid_amount,
            remarks
        } = req.body;

        console.log('body ->>>>> ', req.body)

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
                    model: BookingRequest,
                    as: 'booking_requests',
                    required: false,
                    attributes: ['token'],
                    where: {
                        requested_by_vendor_token: bidderToken
                    }
                },
                {
                    model: BookingReject,
                    as: 'booking_rejections',
                    required: false,
                    attributes: ['token'],
                    where: {
                        rejected_by_token: bidderToken
                    }
                }
            ],
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        console.log('booking ->>>>> ', booking)
        if (!booking) {
            await t.rollback();
            return res.status(404).json(responseData('Booking not found', {}, req, false));
        }

        if (booking.vendor_token === bidderToken) {
            await t.rollback();
            return res.status(400).json(responseData('You cannot bid on your own booking', {}, req, false));
        }

        if (booking.status !== 'OPEN') {
            await t.rollback();
            return res.status(400).json(responseData('Booking is not open for bidding', {}, req, false));
        }

        if (booking.accept_type !== 'BID') {
            await t.rollback();
            return res.status(400).json(responseData('This booking does not allow bidding', {}, req, false));
        }

        if (new Date(booking.pickup_datetime) <= now) {
            await t.rollback();
            return res.status(400).json(responseData('Booking pickup time expired', {}, req, false));
        }

        if (booking.booking_requests?.length) {
            await t.rollback();
            return res.status(400).json(responseData('You have already placed a bid on this booking', {}, req, false));
        }

        if (booking.booking_rejections?.length) {
            await t.rollback();
            return res.status(403).json(responseData('You are not allowed to bid on this booking', {}, req, false));
        }

        if (!bid_amount || Number(bid_amount) <= 0) {
            await t.rollback();
            return res.status(400).json(responseData('Invalid bid amount', {}, req, false));
        }

        const validTillDate = new Date(Date.now() + (24 * 60 * 60 * 1000));

        const bookingRequest = await BookingRequest.create(
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
                status: 'PENDING'
            },
            { transaction: t }
        );

        await Notification.create(
            {
                sender_token: bidderToken,
                receiver_token: booking.vendor_token,
                receiver_role: 'vendor',
                booking_token: booking.token,
                type: 'NEW_BID',
                title: 'New Bid Received',
                message: `A vendor has placed a bid of ₹${bid_amount} on your booking.`,
                visibility: 'private'
            },
            { transaction: t }
        );

        await t.commit();

        await bookingNotificationQueue.add('new-bid', {
            receiver_token: booking.vendor_token,
            type: 'NEW_BID',
            title: 'New Bid Received',
            message: `A vendor has placed a bid of ₹${bid_amount} on your booking.`,
            booking_token: booking.token,
            event: 'booking:bid'
        });

        return res.status(201).json(
            responseData(
                'Bid placed successfully',
                {
                    booking_token: booking.token,
                    booking_request_token: bookingRequest.token
                },
                req,
                true
            )
        );

    } catch (error) {

        await t.rollback();
        console.error('Booking bid error:', error);

        return res.status(500).json(
            responseData('Error occurred', {}, req, false)
        );
    }
});

router.post('/report-booking/:token', [vendorMiddleware, verifiedOnly, vendorValidation.validate('rate-booking')], async (req, res) => {

    const t = await db.sequelize.transaction();

    try {
        const { stars, comment } = req.body;
        const raterToken = req.user.token;
        const bookingToken = req.params.token;

        if (!stars || stars < 1 || stars > 5) {
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

        if (booking.vendor_token === raterToken) {
            await t.rollback();
            return res.status(403).json(
                responseData('You are not authorized to rate this booking', {}, req, false)
            );
        }

        // if (booking.status !== 'COMPLETED') {
        //     await t.rollback();
        //     return res.status(400).json(
        //         responseData('Only completed bookings can be rated', {}, req, false)
        //     );
        // }

        const alreadyRated = await BookingRating.findOne({
            where: { booking_token: bookingToken, rater_token: raterToken },
            transaction: t
        });

        if (alreadyRated) {
            await t.rollback();
            return res.status(400).json(
                responseData('You have already rated this booking', {}, req, false)
            );
        }

        const quality =
            stars <= 2 ? 'LOW' : stars === 3 ? 'MEDIUM' : 'HIGH';

        await BookingRating.create(
            {
                token: randomstring(64),
                booking_token: bookingToken,
                rater_token: raterToken,
                rater_role: 'VENDOR',
                ratee_token: booking.vendor_token,
                ratee_role: 'VENDOR',
                stars,
                quality,
                comment: comment?.trim() || null,
                created_ip: req.ip.replace('::ffff:', ''),
                user_agent: req.get('User-Agent')
            },
            { transaction: t }
        );

        await t.commit();

        // Socket (Foreground)
        const io = getIO();
        io?.to(`vendor:${raterToken}`).emit('booking:rated', {
            booking_token: bookingToken,
            stars,
            comment,
            role: 'reporter'
        });

        io?.to(`customer:${booking.customer_token}`).emit('booking:rated', {
            booking_token: bookingToken,
            stars,
            comment,
            role: 'ratee'
        });

        // Queue for DB + Push
        await ratingNotificationQueue.add('rating-created', {
            booking_token: bookingToken,
            reporter_token: raterToken,
            ratee_token: booking.customer_token,
            stars,
            comment
        });

        return res.status(201).json(
            responseData('Booking rated successfully', {}, req, true)
        );

    } catch (error) {
        await t.rollback();
        console.error('Booking rating error:', error);
        return res.status(500).json(
            responseData('Error occurred', {}, req, false)
        );
    }
});

router.post('/booking/:token/cancel', [vendorMiddleware, verifiedOnly], async (req, res) => {

    const t = await db.sequelize.transaction();

    try {
        const bookingToken = req.params.token;
        const user = req.user;
        const { reason } = req.body;

        const booking = await Booking.findOne({
            where: { token: bookingToken, accept_type: 'APPROVAL' },
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!booking || booking.status !== 'OPEN') {
            await t.rollback();
            return res.status(400).json(
                responseData('Booking cannot be cancelled', {}, req, false)
            );
        }

        await Booking.update(
            { status: 'CANCELLED' },
            { where: { token: bookingToken }, transaction: t }
        );

        await BookingCancel.create(
            {
                token: randomstring(64),
                booking_token: bookingToken,
                cancelled_by_token: user.token,
                cancelled_by_role: user.role.toUpperCase(),
                reason
            },
            { transaction: t }
        );

        await t.commit();

        await bookingCancelQueue.add('BOOKING_CANCELLED', {
            booking_token: booking.token,
            cancelled_by_token: user.token,
            cancelled_by_role: user.role,
            owner_token: booking.vendor_token,
            reason
        });

        const io = getIO();
        io?.to(`vendor:${booking.vendor_token}`).emit('booking:cancelled', {
            booking_token: booking.token,
            reason
        });


        return res.status(200).json(
            responseData('Booking cancelled successfully', {}, req, true)
        );

    } catch (err) {
        await t.rollback();
        console.error('[BOOKING CANCEL ERROR]', err);
        return res.status(500).json(
            responseData('Something went wrong', {}, req, false)
        );
    }
});

// jatin api

router.post("/holiday-package-enquiry", [vendorMiddleware, vendorValidation.validate('post-holiday-package')], async (req, res) => {
    try {
        const vendorToken = req?.user?.token || null;
        const {
            from_city,
            to_city,
            departure_date,
            adults,
            children,
            rooms
        } = req.body;

        await HolidayPackageEnquiry.create({
            token: randomstring(64),
            vendor_token: vendorToken,
            from_city,
            to_city,
            departure_date,
            adults: adults || 1,
            children: children || 0,
            rooms: rooms || 1,
        });

        return res.status(201).json(
            responseData(
                "Holiday enquiry submitted successfully",
                {},
                req,
                true
            )
        );
    }
    catch (error) {
        console.log("Holiday enquiry error", error);
        return res.status(500).json(
            responseData(
                "Internal server error",
                {},
                req,
                false
            )
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
            whatsapp
        } = req.body;


        await InsuranceEnquiry.create({

            token: randomstring(64),

            vendor_token: vendorToken,

            car_number,

            name,

            contact,

            agree_policy,

            whatsapp

        });


        return res.status(201).json(
            responseData(
                "Insurance enquiry submitted successfully",
                {},
                req,
                true
            )
        );


    }
    catch (error) {

        console.log("Insurance enquiry error", error);

        return res.status(500).json(
            responseData(
                "Internal server error",
                {},
                req,
                false
            )
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
            rooms
        } = req.body;


        await HotelEnquiry.create({

            token: randomstring(64),

            vendor_token: vendorToken,

            area,

            check_in,

            check_out,

            adults: adults || 1,

            children: children || 0,

            rooms: rooms || 1,

        });


        return res.status(201).json(
            responseData(
                "Hotel enquiry submitted successfully",
                {},
                req,
                true
            )
        );


    }
    catch (error) {

        console.log("Hotel enquiry error", error);

        return res.status(500).json(
            responseData(
                "Internal server error",
                {},
                req,
                false
            )
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
            adults,
            children,
            class_type
        } = req.body;


        await FlightEnquiry.create({

            token: randomstring(64),

            vendor_token: vendorToken,

            trip_type,

            from_location,

            to_location,

            departure_date,

            return_date,

            adults: adults || 1,

            children: children || 0,

            class_type

        });


        return res.status(201).json(
            responseData(
                "Flight enquiry submitted successfully",
                {},
                req,
                true
            )
        );


    }
    catch (error) {

        console.log("Flight enquiry error", error);

        return res.status(500).json(
            responseData(
                "Internal server error",
                {},
                req,
                false
            )
        );

    }

});






/* --------------- wallet -------------- */

router.get('/wallet/summary', [vendorMiddleware, verifiedOnly], async (req, res) => {
    try {
        const vendorToken = req.user.token;
        const { page = 1, limit = 4, status } = req.query;

        const wallet = await getOrCreateWallet({
            user_token: vendorToken,
            role: 'VENDOR'
        });

        const offset = (Number(page) - 1) * Number(limit);

        // const lastTxnTime = await WalletTransaction.max('created_at', {
        //     where: { wallet_id: wallet.id }
        // });

        // const cacheKey = `wallet_summary_${vendorToken}_${page}_${limit}_${status || 'ALL'}`;
        // const cached = await getCache(cacheKey);

        // if (cached && cached.lastModified === new Date(lastTxnTime).getTime()) {
        //     return res.json(
        //         responseData(
        //             'Wallet summary fetched successfully (from cache)',
        //             cached.data,
        //             req,
        //             true
        //         )
        //     );
        // }

        const whereCondition = { wallet_id: wallet.id };

        if (status) {
            if (status === 'COMPLETED') whereCondition.status = 'SUCCESS';
            else if (status === 'FAILED') whereCondition.status = 'FAILED';
            else whereCondition.status = 'PENDING';
        }

        const { rows, count } = await WalletTransaction.findAndCountAll({
            where: whereCondition,
            order: [
                ['created_at', 'DESC'],
                ['id', 'DESC']
            ],
            limit: Number(limit),
            offset,
            attributes: [
                'id',
                'token',
                'transaction_type',
                'amount',
                'opening_balance',
                'closing_balance',
                'reason',
                'reference_type',
                'reference_id',
                'status',
                'created_at'
            ]
        });

        const transactions = rows.map(txn => ({
            id: txn.id,
            token: txn.token,
            type: txn.transaction_type,
            amount: Number(txn.amount),
            opening_balance: Number(txn.opening_balance),
            closing_balance: Number(txn.closing_balance),
            reason: txn.reason,
            reference_type: txn.reference_type,
            reference_id: txn.reference_id,
            status: txn.status,
            created_at: txn.created_at
        }));

        const responseObject = {
            wallet: {
                wallet_token: wallet.token,
                balance: Number(wallet.balance),
                last_transaction_at: wallet.last_transaction_at,
                created_at: wallet.created_at,
                updated_at: wallet.updated_at
            },
            transactions: {
                docs: transactions,
                page: Number(page),
                limit: Number(limit),
                totalDocs: count,
                totalPages: Math.ceil(count / limit)
            }
        };

        // await setCache(cacheKey, { data: responseObject, lastModified: new Date(lastTxnTime).getTime() }, 300);

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

        if (!amount || Number(amount) <= 0) {
            return res.status(400).json(
                responseData('Invalid amount', {}, req, false)
            );
        }

        if (!amount || Number(amount) < 100) {
            return res.status(400).json(
                responseData('Minimum amount is 100', {}, req, false)
            );
        }

        const wallet = await getOrCreateWallet({
            user_token: vendorToken,
            role: 'VENDOR'
        });

        const amountInPaise = Math.round(Number(amount) * 100);

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
                wallet_id: wallet.id,
                purpose: 'ADD_MONEY'
            }
        });

        await WalletTransaction.create({
            token: randomstring(64),
            wallet_id: wallet.id,
            transaction_type: 'CREDIT',
            amount: Number(amount),
            opening_balance: wallet.balance,
            closing_balance: wallet.balance,
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
                    currency: order.currency
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

        const wallet = await getOrCreateWallet({
            user_token: vendorToken,
            role: 'VENDOR'
        });

        const txn = await WalletTransaction.findOne({
            where: {
                wallet_id: wallet.id,
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

        if (txn.status === 'SUCCESS') {
            await t.rollback();
            return res.json(
                responseData('Payment already processed', {}, req, true)
            );
        }

        const amount = Number(txn.amount);
        const opening = Number(wallet.balance);
        const closing = opening + amount;

        await wallet.update(
            {
                balance: closing,
                last_transaction_at: new Date()
            },
            { transaction: t }
        );

        await txn.update(
            {
                status: 'SUCCESS',
                reference_type: 'RAZORPAY_PAYMENT',
                reference_id: razorpay_payment_id,
                opening_balance: opening,
                closing_balance: closing
            },
            { transaction: t }
        );

        await t.commit();

        return res.json(
            responseData(
                'Wallet credited successfully',
                {
                    wallet_token: wallet.token,
                    credited_amount: amount,
                    balance: closing
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