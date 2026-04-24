const router = require('express').Router();
const crypto = require('crypto')
const razorpay = require('../config/razorpay.js');
const { responseData, formatReadableDate, registerCustomerIfNotExists, fillMissingContactsFromCustomer, generateRefCode } = require("../shared/utils/helper.js");
const { randomstring } = require('../shared/utils/helper.js');
const customerValidation = require('../validation/customer.auth.js');
const db = require('../models/index');
const { Op, Transaction, Sequelize, col, literal, where } = require("sequelize");
const { getIO } = require('../sockets/index.js');
const enquiryNotificationQueue = require('../queues/vendor/enquiries/enquiry.queue.js');
const { admin_url, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, REQUEST_FEE } = require('../config/globals.js');
const getOrCreateWallet = require('../shared/utils/wallet.js');

const { customerMiddleware } = require('../middleware/auth.js');
const { uploadImages } = require('../middleware/multer.js');

const Customer = db.customer
const CabEnquiry = db.CabEnquiry;
const HolidayPackageEnquiry = db.holydaypackageEnquiry;
const InsuranceEnquiry = db.insuranceEnquiry;
const HotelEnquiry = db.hotelEnquiry;
const FlightEnquiry = db.flightEnquiry;
const Vendor = db.vendor;
const Enquiry = db.enquiry;
const Service = db.service
const SiteSlider = db.sliderSeting
const Counter = db.counter
const Review = db.review
const Video = db.helpVideo
const Vehicle = db.AddVehicle
const EnquiryRequest = db.enquiryRequest
const WalletTransaction = db.wallet_transaction
const Wallet = db.wallet
const About = db.about
const Faq = db.customerFaqs
const CustomerHelp = db.customerHelp
const CustomerHelpAnswer = db.customerHelpAnswer


const queueEnquiryToAllVendors = async ({
    senderToken = null,
    type,
    title,
    message,
    payload
}) => {
    const vendors = await Vendor.findAll({
        where: {
            flag: 0,
            status: "active",
            booking_notification_enabled: true,
            ...(senderToken ? { token: { [Op.ne]: senderToken } } : {})
        },
        attributes: ["token"],
        raw: true
    });

    const vendorTokens = [
        ...new Set(
            vendors.map(v => String(v.token || "").trim()).filter(Boolean)
        )
    ];

    if (!vendorTokens.length) return;

    await Promise.all(
        vendorTokens.map((receiverToken) =>
            enquiryNotificationQueue.add("enquiry-notification", {
                sender_token: senderToken,
                receiver_token: receiverToken,
                receiver_role: "vendor",
                type,
                title,
                message,
                payload
            })
        )
    );
};

async function getCustomerEnquiries({
    token,
    number,
    enquiry_type = null,
    search = "",
}) {
    const normalizedType = enquiry_type ? String(enquiry_type).toLowerCase() : null;
    const matchCustomerTokens = [...new Set([token, number].filter(Boolean))];

    const enquiryConfigs = [
        {
            type: "cab",
            model: CabEnquiry,
            attributes: [
                "id",
                "token",
                "customer_token",
                "vehicle_token",
                "vendor_token",
                "trip_type",
                "from_location",
                "to_location",
                "departure_date",
                "return_date",
                "car_type",
                "contact",
                "status",
                "who_posted",
                "create_date",
            ],
            mapRow: (row) => ({
                enquiry_table: "tbl_cab_enquiry",
                enquiry_type: "cab",
                enquiry_token: row.token,
                customer_token: row.customer_token || null,
                vehicle_token: row.vehicle_token || null,
                vendor_token: row.vendor_token || null,
                trip_type: row.trip_type || null,
                from_location: row.from_location || null,
                to_location: row.to_location || null,
                departure_date: row.departure_date || null,
                return_date: row.return_date || null,
                car_type: row.car_type || null,
                contact: row.contact || null,
                status: row.status || null,
                created_at: row.create_date || null,
            }),
        },
        {
            type: "flight",
            model: FlightEnquiry,
            attributes: [
                "id",
                "token",
                "customer_token",
                "from_location",
                "to_location",
                "status",
                "create_date",
            ],
            mapRow: (row) => ({
                enquiry_table: "tbl_flight_enquiry",
                enquiry_type: "flight",
                enquiry_token: row.token,
                customer_token: row.customer_token || null,
                from_location: row.from_location || null,
                to_location: row.to_location || null,
                status: row.status || null,
                created_at: row.create_date || null,
            }),
        },
        {
            type: "holiday_package",
            model: HolidayPackageEnquiry,
            attributes: [
                "id",
                "token",
                "customer_token",
                "from_city",
                "to_city",
                "status",
                "create_date",
            ],
            mapRow: (row) => ({
                enquiry_table: "tbl_holiday_package_enquiry",
                enquiry_type: "holiday_package",
                enquiry_token: row.token,
                customer_token: row.customer_token || null,
                from_city: row.from_city || null,
                to_city: row.to_city || null,
                status: row.status || null,
                created_at: row.create_date || null,
            }),
        },
        {
            type: "hotel",
            model: HotelEnquiry,
            attributes: [
                "id",
                "token",
                "customer_token",
                "area",
                "status",
                "create_date",
            ],
            mapRow: (row) => ({
                enquiry_table: "tbl_hotel_enquiry",
                enquiry_type: "hotel",
                enquiry_token: row.token,
                customer_token: row.customer_token || null,
                area: row.area || null,
                status: row.status || null,
                created_at: row.create_date || null,
            }),
        },
        {
            type: "insurance",
            model: InsuranceEnquiry,
            attributes: [
                "id",
                "token",
                "customer_token",
                "status",
                "create_date",
            ],
            mapRow: (row) => ({
                enquiry_table: "tbl_insurance_enquiry",
                enquiry_type: "insurance",
                enquiry_token: row.token,
                customer_token: row.customer_token || null,
                status: row.status || null,
                created_at: row.create_date || null,
            }),
        },
    ];

    const filteredConfigs = normalizedType
        ? enquiryConfigs.filter((item) => item.type === normalizedType)
        : enquiryConfigs;

    const results = await Promise.all(
        filteredConfigs.map(async (config) => {
            const rows = await config.model.findAll({
                where: {
                    customer_token: {
                        [Op.in]: matchCustomerTokens,
                    },
                    who_posted: "CUSTOMER",
                },
                attributes: config.attributes,
                order: [["create_date", "DESC"]],
                raw: true,
            });

            return rows.map(config.mapRow);
        })
    );

    let finalResults = results
        .flat()
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (search && String(search).trim()) {
        const searchText = String(search).trim().toLowerCase();

        finalResults = finalResults.filter((item) => {
            return Object.values(item).some((value) => {
                if (value === null || value === undefined) return false;

                if (typeof value === "object") {
                    try {
                        return JSON.stringify(value).toLowerCase().includes(searchText);
                    } catch (err) {
                        return false;
                    }
                }

                return String(value).toLowerCase().includes(searchText);
            });
        });
    }

    return finalResults;
}

async function getCustomerEnquiryByToken({
    token,
    number,
    enquiry_type,
    enquiry_token,
}) {
    const normalizedType = String(enquiry_type).toLowerCase().trim();
    const matchCustomerTokens = [...new Set([token, number].filter(Boolean))];

    const enquiryConfigMap = {
        cab: {
            model: CabEnquiry,
            attributes: [
                "id",
                "token",
                "customer_token",
                "vehicle_token",
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
                "update_date",
            ],
            mapRow: (row) => ({
                id: row.id,
                enquiry_table: "tbl_cab_enquiry",
                enquiry_type: "cab",
                enquiry_token: row.token,
                customer_token: row.customer_token || null,
                vehicle_token: row.vehicle_token || null,
                who_posted: row.who_posted || null,
                from_web: row.from_web === true,
                trip_type: row.trip_type || null,
                from_location: row.from_location || null,
                to_location: row.to_location || null,
                departure_date: row.departure_date || null,
                return_date: row.return_date || null,
                car_type: row.car_type || null,
                contact: row.contact || null,
                status: row.status || null,
                flag: row.flag ?? 0,
                created_at: row.create_date || null,
                updated_at: row.update_date || null,
            }),
        },

        flight: {
            model: FlightEnquiry,
            attributes: [
                "id",
                "token",
                "customer_token",
                "who_posted",
                "from_location",
                "to_location",
                "departure_date",
                "return_date",
                "trip_type",
                "adults",
                "children",
                "class_type",
                "segments",
                "status",
                "create_date",
            ],
            mapRow: (row) => ({
                enquiry_table: "tbl_flight_enquiry",
                enquiry_type: "flight",
                enquiry_token: row.token,
                id: row.id,
                customer_token: row.customer_token || null,
                who_posted: row.who_posted || null,
                from_location: row.from_location || null,
                to_location: row.to_location || null,
                departure_date: row.departure_date || null,
                return_date: row.return_date || null,
                trip_type: row.trip_type || null,
                adults: row.adults ?? null,
                children: row.children ?? null,
                class_type: row.class_type || null,
                segments: row.segments || null,
                status: row.status || null,
                created_at: row.create_date || null,
            }),
        },

        holiday_package: {
            model: HolidayPackageEnquiry,
            attributes: [
                "id",
                "token",
                "customer_token",
                "who_posted",
                "from_city",
                "to_city",
                "departure_date",
                "adults",
                "children",
                "room_type",
                "status",
                "create_date",
            ],
            mapRow: (row) => ({
                id: row.id,
                enquiry_table: "tbl_holiday_package_enquiry",
                enquiry_type: "holiday_package",
                enquiry_token: row.token,
                customer_token: row.customer_token || null,
                who_posted: row.who_posted || null,
                from_city: row.from_city || null,
                to_city: row.to_city || null,
                departure_date: row.departure_date || null,
                adults: row.adults ?? null,
                children: row.children ?? null,
                room_type: row.room_type || null,
                status: row.status || null,
                created_at: row.create_date || null,
            }),
        },

        hotel: {
            model: HotelEnquiry,
            attributes: [
                "id",
                "token",
                "customer_token",
                "who_posted",
                "area",
                "check_in",
                "check_out",
                "adults",
                "children",
                "room_type",
                "status",
                "create_date",
            ],
            mapRow: (row) => ({
                id: row.id,
                enquiry_table: "tbl_hotel_enquiry",
                enquiry_type: "hotel",
                enquiry_token: row.token,
                customer_token: row.customer_token || null,
                who_posted: row.who_posted || null,
                area: row.area || null,
                check_in: row.check_in || null,
                check_out: row.check_out || null,
                adults: row.adults ?? null,
                children: row.children ?? null,
                room_type: row.room_type || null,
                status: row.status || null,
                created_at: row.create_date || null,
            }),
        },

        insurance: {
            model: InsuranceEnquiry,
            attributes: [
                "id",
                "token",
                "customer_token",
                "who_posted",
                "car_number",
                "name",
                "contact",
                "status",
                "create_date",
            ],
            mapRow: (row) => ({
                id: row.id,
                enquiry_table: "tbl_insurance_enquiry",
                enquiry_type: "insurance",
                enquiry_token: row.token,
                customer_token: row.customer_token || null,
                who_posted: row.who_posted || null,
                car_number: row.car_number || null,
                name: row.name || null,
                contact: row.contact || null,
                status: row.status || null,
                created_at: row.create_date || null,
            }),
        },
    };

    const config = enquiryConfigMap[normalizedType];
    if (!config) return null;

    const row = await config.model.findOne({
        where: {
            token: enquiry_token,
            customer_token: {
                [Op.in]: matchCustomerTokens,
            },
            who_posted: "CUSTOMER",
        },
        attributes: config.attributes,
        raw: true,
    });

    if (!row) return null;

    let enquiryData = config.mapRow(row);

    if (normalizedType === "cab" && enquiryData.vehicle_token) {
        const vehicleRow = await Vehicle.findOne({
            where: {
                token: enquiryData.vehicle_token,
            },
            attributes: [
                "id",
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
                "status",
                "created_at",
                "updated_at",
            ],
            raw: true,
        });

        enquiryData.vehicle = vehicleRow
            ? {
                id: vehicleRow.id || null,
                token: vehicleRow.token || null,
                name: vehicleRow.name || null,
                type: vehicleRow.type || null,
                seater: vehicleRow.seater ?? null,
                avg_per_km: vehicleRow.avg_per_km ?? null,
                ac: vehicleRow.ac === true,
                gps: vehicleRow.gps === true,
                availability: vehicleRow.availability || null,
                image1: vehicleRow.image1 || null,
                image2: vehicleRow.image2 || null,
                status: vehicleRow.status || null,
                created_at: vehicleRow.created_at || null,
                updated_at: vehicleRow.updated_at || null,
            }
            : null;
    } else if (normalizedType === "cab") {
        enquiryData.vehicle = null;
    }

    const enquiryRequests = await EnquiryRequest.findAll({
        where: {
            enquiry_type: normalizedType,
            enquiry_token,
            flag: 0,
        },
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
            "updated_at",
        ],
        order: [["created_at", "DESC"]],
        raw: true,
    });

    const vendorTokens = [
        ...new Set(
            enquiryRequests
                .map((item) => item.requester_token || item.vendor_token)
                .filter(Boolean)
        ),
    ];

    let vendorMap = {};

    if (vendorTokens.length) {
        const vendors = await Vendor.findAll({
            where: {
                token: {
                    [Op.in]: vendorTokens,
                },
                flag: 0,
            },
            attributes: [
                "token",
                "first_name",
                "last_name",
                "contact",
                "alt_contact",
                "email",
                "image",
                "city",
                "state",
                "address",
            ],
            raw: true,
        });

        vendorMap = vendors.reduce((acc, vendor) => {
            acc[vendor.token] = {
                token: vendor.token || null,
                name: `${vendor.first_name || ""} ${vendor.last_name || ""}`.trim() || null,
                contact: vendor.contact || null,
                alt_contact: vendor.alt_contact || null,
                email: vendor.email || null,
                image: vendor.image || null,
                city: vendor.city || null,
                state: vendor.state || null,
                address: vendor.address || null,
            };
            return acc;
        }, {});
    }

    const requestsWithVendor = enquiryRequests.map((item) => {
        const vendorToken = item.requester_token || item.vendor_token || null;

        return {
            id: item.id,
            request_token: item.token || null,
            enquiry_type: item.enquiry_type || null,
            enquiry_token: item.enquiry_token || null,
            requester_token: item.requester_token || null,
            vendor_token: item.vendor_token || null,
            who_posted: item.who_posted || null,
            from_web: item.from_web === true,
            amount: item.amount ?? null,
            message: item.message || null,
            contact: item.contact || null,
            status: item.status || null,
            meta: item.meta || null,
            created_at: item.created_at || null,
            updated_at: item.updated_at || null,
            vendor: vendorMap[vendorToken] || null,
        };
    });

    return {
        ...enquiryData,
        total_requests: requestsWithVendor.length,
        enquiry_requests: requestsWithVendor,
    };
}

router.get('/get/dashboard', [customerMiddleware], async (req, res) => {
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
                where: { status: 'APPROVED' },
                order: [['created_at', 'DESC']],
                limit: 5,
                include: [{
                    model: Customer,
                    attributes: [[Sequelize.literal(`CASE WHEN profile_image IS NOT NULL THEN CONCAT('${admin_url}', profile_image) ELSE NULL END`), 'profile_image']],
                    required: false,
                    as: 'customer_reviewer'
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
            profile_image: r.customer_reviewer?.profile_image || null
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

router.get('/get/faqs', [customerMiddleware], async (req, res) => {
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

router.get('/get/about', [customerMiddleware], async (req, res) => {
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

router.post('/post/help', [customerMiddleware], async (req, res) => {
    try {
        const { description } = req.body;
        if (!description || description.length < 10) {
            return res.status(401).json(responseData('Description is empty', {}, req, false))
        }
        const customerToken = req.user.token;

        const help = await CustomerHelp.create({
            token: randomstring(64),
            customer_token: customerToken,
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

router.get('/get/help/data', [customerMiddleware], async (req, res) => {
    try {
        const customer = req.user;

        if (!customer?.token) {
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
            customer_token: customer.token,
            status
        };

        const { count, rows } = await CustomerHelp.findAndCountAll({
            where,
            order: [['create_date', 'DESC']],
            limit,
            offset,
            distinct: true,
            subQuery: false,
            include: [
                {
                    model: CustomerHelpAnswer,
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

// enquiry
router.post("/holiday/package/enquiry", [customerValidation.validate('post-holiday-package')], async (req, res) => {
    try {
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

        await registerCustomerIfNotExists(req, {
            contact,
            location: from_city || null
        });

        const enquiry = await HolidayPackageEnquiry.create({
            token: randomstring(64),
            customer_token: contact,
            from_city,
            to_city,
            departure_date,
            adults: adults || 1,
            children: children || 0,
            who_posted: 'CUSTOMER',
            from_web: from_web,
            rooms: rooms || 1,
        });

        await queueEnquiryToAllVendors({
            senderToken: null,
            type: "NEW_HOLIDAY_PACKAGE_ENQUIRY",
            title: "New Holiday Package Enquiry",
            message: `A new holiday package enquiry has been submitted from ${from_city || "N/A"} to ${to_city || "N/A"} for ${departure_date || "N/A"}. Please review the traveller details and follow up soon.`,
            payload: {
                module: "holiday_package_enquiry",
                enquiry: {
                    id: enquiry.id,
                    token: enquiry.token,
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

router.post("/insurance/enquiry", [customerValidation.validate('post-insurance-enquiry')], async (req, res) => {
    try {
        const {
            car_number,
            name,
            contact,
            agree_policy,
            whatsapp,
            from_web = false
        } = req.body;

        await registerCustomerIfNotExists(req, {
            contact,
            name
        });

        const enquiry = await InsuranceEnquiry.create({
            token: randomstring(64),
            customer_token: contact,
            car_number,
            name,
            contact,
            agree_policy,
            whatsapp,
            who_posted: 'CUSTOMER',
            from_web: from_web
        });

        await queueEnquiryToAllVendors({
            senderToken: null,
            type: "NEW_INSURANCE_ENQUIRY",
            title: "New Insurance Enquiry",
            message: `A new insurance enquiry has been received for vehicle number ${car_number || "N/A"}. Please review the customer details and contact them soon.`,
            payload: {
                module: "insurance_enquiry",
                enquiry: {
                    id: enquiry.id,
                    token: enquiry.token,
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

router.post("/hotel/enquiry", [customerValidation.validate('post-hotel-enquiry')], async (req, res) => {
    try {
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

        await registerCustomerIfNotExists(req, {
            contact,
            location: area || null
        });

        const enquiry = await HotelEnquiry.create({
            token: randomstring(64),
            customer_token: contact,
            area,
            check_in,
            check_out,
            adults: adults || 1,
            children: children || 0,
            rooms: rooms || 1,
            who_posted: 'CUSTOMER',
            from_web: from_web
        });

        await queueEnquiryToAllVendors({
            senderToken: null,
            type: "NEW_HOTEL_ENQUIRY",
            title: "New Hotel Enquiry",
            message: `A new hotel enquiry has been submitted for ${area || "N/A"} from ${check_in || "N/A"} to ${check_out || "N/A"}. Please review the stay details and respond quickly.`,
            payload: {
                module: "hotel_enquiry",
                enquiry: {
                    id: enquiry.id,
                    token: enquiry.token,
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
        console.log("Hotel enquiry error", error);
        return res.status(500).json(
            responseData("Internal server error", {}, req, false)
        );
    }
});

router.post("/flight/enquiry", [customerValidation.validate('post-flight-enquiry')], async (req, res) => {
    try {
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

        await registerCustomerIfNotExists(req, {
            contact,
            location: from_location || null
        });

        const payload = {
            token: randomstring(64),
            customer_token: contact,
            trip_type,
            adults: adults || 1,
            children: children || 0,
            class_type,
            who_posted: 'CUSTOMER',
            contact,
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
                ? "A new multi-city flight enquiry has been submitted. Please review the travel segments and passenger details before responding."
                : `A new flight enquiry has been submitted from ${from_location || "N/A"} to ${to_location || "N/A"} for ${departure_date || "N/A"}. Please review the travel details and respond soon.`;

        await queueEnquiryToAllVendors({
            senderToken: null,
            type: "NEW_FLIGHT_ENQUIRY",
            title: "New Flight Enquiry",
            message: flightMessage,
            payload: {
                module: "flight_enquiry",
                enquiry: {
                    id: enquiry.id,
                    token: enquiry.token,
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

router.post("/cab/enquiry", [customerValidation.validate('post-cab-enquiry')], async (req, res) => {
    try {
        const {
            trip_type,
            from_location,
            to_location = null,
            departure_date,
            return_date = null,
            car_type = null,
            contact = null,
            from_web = false
        } = req.body;

        await registerCustomerIfNotExists(req, {
            contact,
            location: from_location || null
        });

        const cabEnquiry = await CabEnquiry.create({
            token: randomstring(64),
            vendor_token: contact,
            trip_type,
            from_location,
            to_location: ['oneway', 'round_trip'].includes(trip_type) ? to_location : null,
            departure_date,
            return_date: trip_type === 'round_trip' ? return_date : null,
            car_type,
            contact,
            who_posted: 'CUSTOMER',
            from_web
        });

        await queueEnquiryToAllVendors({
            senderToken: null,
            type: "NEW_CAB_ENQUIRY",
            title: "New Cab Enquiry",
            message: `A new cab enquiry has been submitted from ${from_location || "N/A"} to ${to_location || "N/A"} for ${departure_date || "N/A"}. Please review the travel details and respond soon.`,
            payload: {
                module: "cab_enquiry",
                enquiry: {
                    id: cabEnquiry.id,
                    token: cabEnquiry.token,
                    trip_type: cabEnquiry.trip_type,
                    from_location: cabEnquiry.from_location,
                    to_location: cabEnquiry.to_location,
                    departure_date: cabEnquiry.departure_date,
                    return_date: cabEnquiry.return_date,
                    car_type: cabEnquiry.car_type,
                    contact: cabEnquiry.contact,
                    who_posted: cabEnquiry.who_posted,
                    from_web: cabEnquiry.from_web
                }
            }
        });

        return res.status(201).json(
            responseData("Cab enquiry submitted successfully", {}, req, true)
        );

    } catch (error) {
        console.log("Cab enquiry error", error);
        return res.status(500).json(
            responseData("Internal server error", {}, req, false)
        );
    }
});

router.post('/enquiry', async (req, res) => {
    try {
        const {
            name,
            mobile,
            email = null,
            requirement_type = 'other',
            enquiry_date = null,
            enquiry_time = null,
            location = null,
            adults = 1,
            children = 0,
            comments = null,
            pickup = null,
            drop = null,
        } = req.body;

        if (!name || !name.trim()) {
            return res.status(422).json(responseData('Name is required', {}, req, false));
        }
        if (!mobile || !mobile.trim()) {
            return res.status(422).json(responseData('Mobile number is required', {}, req, false));
        }
        if (!enquiry_date) {
            return res.status(422).json(responseData('Date is required', {}, req, false));
        }
        if (!enquiry_time) {
            return res.status(422).json(responseData('Time is required', {}, req, false));
        }

        let finalComments = comments || null;
        if (requirement_type === 'cab' && (pickup || drop)) {
            const cabInfo = `Pickup: ${pickup || 'N/A'} | Drop: ${drop || 'N/A'}`;
            finalComments = finalComments ? `${cabInfo}\n${finalComments}` : cabInfo;
        }

        await Enquiry.create({
            token: randomstring.generate(64),
            name: name.trim(),
            mobile: mobile.trim(),
            email: email ? email.trim() : null,
            requirement_type,
            enquiry_date,
            enquiry_time,
            location: location ? location.trim() : null,
            adults: adults || 1,
            children: children || 0,
            comments: finalComments,
            status: 'new',
            source: 'app',
            ip_address: req.ip || req.headers['x-forwarded-for'] || null,
            user_agent: req.headers['user-agent'] || null,
        });

        return res.status(201).json(
            responseData('Enquiry submitted successfully', {}, req, true)
        );

    } catch (error) {
        console.error('Customer enquiry error:', error);
        return res.status(500).json(
            responseData('Internal server error', {}, req, false)
        );
    }
});

// personal apis
router.get('/get-profile', [customerMiddleware], async (req, res) => {
    try {
        const { token } = req?.user;
        const result = await Customer.findOne({
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
                // 'verification_status',
                // 'rejectReason',
                [Sequelize.literal(`CONCAT('${admin_url}', profile_image)`), 'profile_image'],
                // [Sequelize.literal(`CONCAT('${admin_url}', aadhaar_front_image)`), 'aadhaar_front_image'],
                // [Sequelize.literal(`CONCAT('${admin_url}', aadhaar_back_image)`), 'aadhaar_back_image'],
                // [Sequelize.literal(`CONCAT('${admin_url}', dl_front_image)`), 'dl_front_image'],
                // [Sequelize.literal(`CONCAT('${admin_url}', dl_back_image)`), 'dl_back_image'],
                // [Sequelize.literal(`CONCAT('${admin_url}', vehicle_image)`), 'vehicle_image']
            ]
        });
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

router.put('/update-basic-details', [customerMiddleware, uploadImages, customerValidation.validate('basic-details')], async (req, res) => {
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
            role: 'customer',
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

        await Customer.update(updateData, {
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


// app enquiry
router.post("/holiday-package-enquiry", [customerMiddleware, customerValidation.validate('post-holiday-package')], async (req, res) => {
    try {
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

        const customerToken = req.user.token

        const enquiry = await HolidayPackageEnquiry.create({
            token: randomstring(64),
            customer_token: customerToken,
            from_city,
            to_city,
            departure_date,
            adults: adults || 1,
            children: children || 0,
            who_posted: 'CUSTOMER',
            from_web: from_web,
            rooms: rooms || 1,
        });

        await queueEnquiryToAllVendors({
            senderToken: null,
            type: "NEW_HOLIDAY_PACKAGE_ENQUIRY",
            title: "New Holiday Package Enquiry",
            message: `A new holiday package enquiry has been submitted from ${from_city || "N/A"} to ${to_city || "N/A"} for ${departure_date || "N/A"}. Please review the traveller details and follow up soon.`,
            payload: {
                module: "holiday_package_enquiry",
                enquiry: {
                    id: enquiry.id,
                    token: enquiry.token,
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

router.post("/insurance-enquiry", [customerMiddleware, customerValidation.validate('post-insurance-enquiry')], async (req, res) => {
    try {
        const {
            car_number,
            name,
            contact,
            agree_policy,
            whatsapp,
            from_web = false
        } = req.body;

        const customerToken = req.user.token

        const enquiry = await InsuranceEnquiry.create({
            token: randomstring(64),
            customer_token: customerToken,
            car_number,
            name,
            contact,
            agree_policy,
            whatsapp,
            from_web: from_web,
            who_posted: 'CUSTOMER'
        });

        await queueEnquiryToAllVendors({
            senderToken: null,
            type: "NEW_INSURANCE_ENQUIRY",
            title: "New Insurance Enquiry",
            message: `A new insurance enquiry has been received for vehicle number ${car_number || "N/A"}. Please review the customer details and contact them soon.`,
            payload: {
                module: "insurance_enquiry",
                enquiry: {
                    id: enquiry.id,
                    token: enquiry.token,
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

router.post("/hotel-enquiry", [customerMiddleware, customerValidation.validate('post-hotel-enquiry')], async (req, res) => {
    try {
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

        const customerToken = req.user.token

        const enquiry = await HotelEnquiry.create({
            token: randomstring(64),
            customer_token: customerToken,
            area,
            check_in,
            check_out,
            adults: adults || 1,
            children: children || 0,
            rooms: rooms || 1,
            who_posted: 'CUSTOMER',
            from_web: from_web
        });

        await queueEnquiryToAllVendors({
            senderToken: null,
            type: "NEW_HOTEL_ENQUIRY",
            title: "New Hotel Enquiry",
            message: `A new hotel enquiry has been submitted for ${area || "N/A"} from ${check_in || "N/A"} to ${check_out || "N/A"}. Please review the stay details and respond quickly.`,
            payload: {
                module: "hotel_enquiry",
                enquiry: {
                    id: enquiry.id,
                    token: enquiry.token,
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
        console.log("Hotel enquiry error", error);
        return res.status(500).json(
            responseData("Internal server error", {}, req, false)
        );
    }
});

router.post("/flight-enquiry", [customerMiddleware, customerValidation.validate('post-flight-enquiry')], async (req, res) => {
    try {
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

        const customerToken = req.user.token

        const payload = {
            token: randomstring(64),
            customer_token: customerToken,
            vendor_token: null,
            trip_type,
            adults: adults || 1,
            children: children || 0,
            class_type,
            who_posted: 'CUSTOMER',
            contact,
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
                ? "A new multi-city flight enquiry has been submitted. Please review the travel segments and passenger details before responding."
                : `A new flight enquiry has been submitted from ${from_location || "N/A"} to ${to_location || "N/A"} for ${departure_date || "N/A"}. Please review the travel details and respond soon.`;

        await queueEnquiryToAllVendors({
            senderToken: null,
            type: "NEW_FLIGHT_ENQUIRY",
            title: "New Flight Enquiry",
            message: flightMessage,
            payload: {
                module: "flight_enquiry",
                enquiry: {
                    id: enquiry.id,
                    token: enquiry.token,
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

router.post("/cab-enquiry", [customerMiddleware, customerValidation.validate('post-cab-enquiry')], async (req, res) => {
    try {
        const {
            trip_type,
            from_location,
            to_location = null,
            departure_date,
            return_date = null,
            car_type = null,
            contact = null,
            from_web = false,
            vehicle_token
        } = req.body;

        const customerToken = req.user.token

        const cabEnquiry = await CabEnquiry.create({
            token: randomstring(64),
            customer_token: customerToken,
            trip_type,
            from_location,
            to_location: ['oneway', 'round_trip'].includes(trip_type) ? to_location : null,
            departure_date,
            return_date: trip_type === 'round_trip' ? return_date : null,
            car_type,
            contact,
            who_posted: 'CUSTOMER',
            vehicle_token: vehicle_token || null,
            from_web
        });

        await queueEnquiryToAllVendors({
            senderToken: null,
            type: "NEW_CAB_ENQUIRY",
            title: "New Cab Enquiry",
            message: `A new cab enquiry has been submitted from ${from_location || "N/A"} to ${to_location || "N/A"} for ${departure_date || "N/A"}. Please review the travel details and respond soon.`,
            payload: {
                module: "cab_enquiry",
                enquiry: {
                    id: cabEnquiry.id,
                    token: cabEnquiry.token,
                    trip_type: cabEnquiry.trip_type,
                    from_location: cabEnquiry.from_location,
                    to_location: cabEnquiry.to_location,
                    departure_date: cabEnquiry.departure_date,
                    return_date: cabEnquiry.return_date,
                    car_type: cabEnquiry.car_type,
                    contact: cabEnquiry.contact,
                    who_posted: cabEnquiry.who_posted,
                    from_web: cabEnquiry.from_web
                }
            }
        });

        return res.status(201).json(
            responseData("Cab enquiry submitted successfully", {}, req, true)
        );

    } catch (error) {
        console.log("Cab enquiry error", error);
        return res.status(500).json(
            responseData("Internal server error", {}, req, false)
        );
    }
});


// enquries
router.get("/enquiries/list", [customerMiddleware, customerValidation.validate("customer-enquiries-list")], async (req, res) => {
    try {
        const {
            number,
            page = 1,
            limit = 10,
            enquiry_type = null,
            search = "",
        } = req.query;

        const token = req.user.token;

        const safePage = Math.max(Number(page) || 1, 1);
        const safeLimit = Math.max(Number(limit) || 10, 1);

        const allEnquiries = await getCustomerEnquiries({
            token,
            number,
            enquiry_type,
            search,
        });

        const total = allEnquiries.length;
        const start = (safePage - 1) * safeLimit;
        const end = start + safeLimit;

        const paginatedData = allEnquiries.slice(start, end);

        return res.status(200).json(
            responseData(
                "Customer enquiries fetched successfully",
                {
                    total,
                    page: safePage,
                    limit: safeLimit,
                    total_pages: Math.ceil(total / safeLimit),
                    data: paginatedData,
                },
                req,
                true
            )
        );
    } catch (error) {
        console.error("customer enquiries list error:", error);
        return res.status(500).json(
            responseData("Something went wrong", {}, req, false)
        );
    }
});

router.get("/enquiries/detail/:enquiry_type/:enquiry_token", [customerMiddleware], async (req, res) => {
    try {
        const { enquiry_type, enquiry_token } = req.params;
        const number = req.query.number;
        const token = req.user.token;

        if (!enquiry_type || !enquiry_token) {
            return res.status(400).json(
                responseData("Enquiry type and token are required", {}, req, false)
            );
        }

        const enquiry = await getCustomerEnquiryByToken({
            token,
            number,
            enquiry_type,
            enquiry_token,
        });

        if (!enquiry) {
            return res.status(404).json(
                responseData("Enquiry not found", {}, req, false)
            );
        }

        return res.status(200).json(
            responseData(
                "Customer enquiry fetched successfully",
                enquiry,
                req,
                true
            )
        );
    } catch (error) {
        console.error("customer enquiry detail error:", error);
        return res.status(500).json(
            responseData("Something went wrong", {}, req, false)
        );
    }
});

// call enquries
router.get("/call-enquiries/list", [customerMiddleware], async (req, res) => {
    try {
        let {
            page = 1,
            limit = 10,
            enquiry_type = null,
            search = ""
        } = req.query;

        console.log("Received call enquiries list request with query:", req.query);

        // process.exit(1)

        const customerToken = req.user.token;

        page = parseInt(page, 10) || 1;
        limit = parseInt(limit, 10) || 10;
        const offset = (page - 1) * limit;

        const normalizedType = enquiry_type
            ? String(enquiry_type).toLowerCase().trim()
            : null;

        const whereCondition = {
            customer_token: customerToken
        };

        if (normalizedType) {
            whereCondition.enquiry_type = normalizedType;
        }

        const callRows = await db.EnquiryCalls.findAll({
            where: whereCondition,
            attributes: [
                "id",
                "token",
                "enquiry_token",
                "enquiry_type",
                "customer_token",
                "called_by",
                "call_type",
                "call_time",
                "status",
                "created_at",
                "updated_at"
            ],
            order: [["call_time", "DESC"]],
            raw: true
        });

        const groupedMap = new Map();

        for (const item of callRows) {
            const key = `${item.enquiry_type}__${item.enquiry_token}`;

            if (!groupedMap.has(key)) {
                groupedMap.set(key, {
                    enquiry_type: item.enquiry_type,
                    enquiry_token: item.enquiry_token,
                    customer_token: item.customer_token || null,
                    contact: item.contact || null,
                    latest_call: item,
                    total_calls: 1
                });
            } else {
                const existing = groupedMap.get(key);
                existing.total_calls += 1;

                const existingTime = existing.latest_call?.call_time
                    ? new Date(existing.latest_call.call_time).getTime()
                    : 0;
                const currentTime = item.call_time
                    ? new Date(item.call_time).getTime()
                    : 0;

                if (currentTime > existingTime) {
                    existing.latest_call = item;
                }

                groupedMap.set(key, existing);
            }
        }

        const groupedRows = Array.from(groupedMap.values());

        const tokenBuckets = {
            cab: [],
            flight: [],
            hotel: [],
            holiday_package: [],
            insurance: []
        };

        groupedRows.forEach((row) => {
            if (row.enquiry_type && row.enquiry_token && tokenBuckets[row.enquiry_type]) {
                tokenBuckets[row.enquiry_type].push(row.enquiry_token);
            }
        });

        const uniqueTokens = {
            cab: [...new Set(tokenBuckets.cab)],
            flight: [...new Set(tokenBuckets.flight)],
            hotel: [...new Set(tokenBuckets.hotel)],
            holiday_package: [...new Set(tokenBuckets.holiday_package)],
            insurance: [...new Set(tokenBuckets.insurance)]
        };

        const [
            cabLeads,
            flightLeads,
            hotelLeads,
            holidayLeads,
            insuranceLeads
        ] = await Promise.all([
            uniqueTokens.cab.length && db.CabEnquiry
                ? db.CabEnquiry.findAll({
                    where: { token: { [Op.in]: uniqueTokens.cab } },
                    attributes: [
                        "id",
                        "token",
                        "contact",
                        "trip_type",
                        "from_location",
                        "to_location",
                        "departure_date",
                        "return_date",
                        "car_type",
                        "from_web",
                        "create_date"
                    ],
                    raw: true
                })
                : [],

            uniqueTokens.flight.length && db.flightEnquiry
                ? db.flightEnquiry.findAll({
                    where: { token: { [Op.in]: uniqueTokens.flight } },
                    attributes: [
                        "id",
                        "token",
                        "trip_type",
                        "from_location",
                        "to_location",
                        "departure_date",
                        "return_date",
                        "adults",
                        "children",
                        "class_type",
                        "segments",
                        "from_web",
                        "create_date"
                    ],
                    raw: true
                })
                : [],

            uniqueTokens.hotel.length && db.hotelEnquiry
                ? db.hotelEnquiry.findAll({
                    where: { token: { [Op.in]: uniqueTokens.hotel } },
                    attributes: [
                        "id",
                        "token",
                        "contact",
                        "area",
                        "check_in",
                        "check_out",
                        "adults",
                        "children",
                        "room_type",
                        "from_web",
                        "create_date"
                    ],
                    raw: true
                })
                : [],

            uniqueTokens.holiday_package.length && (db.HolidayPackageEnquiry || db.holidayPackageEnquiry)
                ? (db.HolidayPackageEnquiry || db.holidayPackageEnquiry).findAll({
                    where: { token: { [Op.in]: uniqueTokens.holiday_package } },
                    attributes: [
                        "id",
                        "token",
                        "contact",
                        "from_city",
                        "to_city",
                        "departure_date",
                        "adults",
                        "children",
                        "room_type",
                        "from_web",
                        "create_date"
                    ],
                    raw: true
                })
                : [],

            uniqueTokens.insurance.length && (db.InsuranceEnquiry || db.insuranceEnquiry)
                ? (db.InsuranceEnquiry || db.insuranceEnquiry).findAll({
                    where: { token: { [Op.in]: uniqueTokens.insurance } },
                    attributes: [
                        "id",
                        "token",
                        "contact",
                        "car_number",
                        "name",
                        "agree_policy",
                        "whatsapp",
                        "from_web",
                        "create_date"
                    ],
                    raw: true
                })
                : []
        ]);

        const cabMap = Object.fromEntries(cabLeads.map((item) => [item.token, item]));
        const flightMap = Object.fromEntries(flightLeads.map((item) => [item.token, item]));
        const hotelMap = Object.fromEntries(hotelLeads.map((item) => [item.token, item]));
        const holidayMap = Object.fromEntries(holidayLeads.map((item) => [item.token, item]));
        const insuranceMap = Object.fromEntries(insuranceLeads.map((item) => [item.token, item]));

        const vendorTokens = [
            ...new Set(
                groupedRows
                    .map((item) => item.latest_call?.called_by)
                    .filter(Boolean)
            )
        ];

        const VendorModel = db.tbl_vendor || db.Vendor || db.vendor;
        let vendorMap = {};

        if (vendorTokens.length && VendorModel) {
            const vendors = await VendorModel.findAll({
                where: {
                    token: {
                        [Op.in]: vendorTokens
                    }
                },
                attributes: [
                    "token",
                    "first_name",
                    "last_name",
                    "contact",
                    "email",
                    "city",
                    "state",
                    "profile_image"
                ],
                raw: true
            });

            vendorMap = Object.fromEntries(
                vendors.map((item) => [item.token, item])
            );
        }

        let finalRows = groupedRows.map((row) => {
            let enquiry = null;
            let leadTitle = null;
            let leadLocation = null;
            let leadDetails = null;

            if (row.enquiry_type === "cab") {
                enquiry = cabMap[row.enquiry_token] || null;
                if (enquiry) {
                    leadTitle = `${enquiry.from_location || ""} to ${enquiry.to_location || ""}`.trim();
                    leadLocation = enquiry.from_location || null;
                    leadDetails = {
                        trip_type: enquiry.trip_type,
                        from_location: enquiry.from_location,
                        to_location: enquiry.to_location,
                        departure_date: enquiry.departure_date,
                        return_date: enquiry.return_date,
                        car_type: enquiry.car_type
                    };
                }
            }

            if (row.enquiry_type === "flight") {
                enquiry = flightMap[row.enquiry_token] || null;
                if (enquiry) {
                    leadTitle = `${enquiry.from_location || ""} to ${enquiry.to_location || ""}`.trim();
                    leadLocation = enquiry.from_location || null;
                    leadDetails = {
                        trip_type: enquiry.trip_type,
                        from_location: enquiry.from_location,
                        to_location: enquiry.to_location,
                        departure_date: enquiry.departure_date,
                        return_date: enquiry.return_date,
                        adults: enquiry.adults,
                        children: enquiry.children,
                        class_type: enquiry.class_type,
                        segments: enquiry.segments
                    };
                }
            }

            if (row.enquiry_type === "hotel") {
                enquiry = hotelMap[row.enquiry_token] || null;
                if (enquiry) {
                    leadTitle = enquiry.area || "Hotel Enquiry";
                    leadLocation = enquiry.area || null;
                    leadDetails = {
                        area: enquiry.area,
                        check_in: enquiry.check_in,
                        check_out: enquiry.check_out,
                        adults: enquiry.adults,
                        children: enquiry.children,
                        room_type: enquiry.room_type
                    };
                }
            }

            if (row.enquiry_type === "holiday_package") {
                enquiry = holidayMap[row.enquiry_token] || null;
                if (enquiry) {
                    leadTitle = `${enquiry.from_city || ""} to ${enquiry.to_city || ""}`.trim();
                    leadLocation = enquiry.from_city || null;
                    leadDetails = {
                        from_city: enquiry.from_city,
                        to_city: enquiry.to_city,
                        departure_date: enquiry.departure_date,
                        adults: enquiry.adults,
                        children: enquiry.children,
                        room_type: enquiry.room_type
                    };
                }
            }

            if (row.enquiry_type === "insurance") {
                enquiry = insuranceMap[row.enquiry_token] || null;
                if (enquiry) {
                    leadTitle = enquiry.car_number || "Insurance Enquiry";
                    leadLocation = null;
                    leadDetails = {
                        car_number: enquiry.car_number,
                        name: enquiry.name,
                        contact: enquiry.contact,
                        agree_policy: enquiry.agree_policy,
                        whatsapp: enquiry.whatsapp
                    };
                }
            }

            const vendor = row.latest_call?.called_by
                ? vendorMap[row.latest_call.called_by] || null
                : null;

            return {
                enquiry_type: row.enquiry_type,
                enquiry_token: row.enquiry_token,
                total_calls: row.total_calls,
                latest_call_time: row.latest_call?.call_time || null,
                latest_call_status: row.latest_call?.status || null,
                latest_call_type: row.latest_call?.call_type || null,
                latest_called_by: row.latest_call?.called_by || null,
                vendor_info: vendor
                    ? {
                        token: vendor.token,
                        first_name: vendor.first_name,
                        last_name: vendor.last_name,
                        full_name: `${vendor.first_name || ""} ${vendor.last_name || ""}`.trim(),
                        contact: vendor.contact,
                        email: vendor.email,
                        city: vendor.city,
                        state: vendor.state,
                        profile_image: vendor.profile_image
                    }
                    : null,
                lead_title: leadTitle,
                lead_location: leadLocation,
                lead_details: leadDetails
            };
        });

        if (search) {
            const q = String(search).toLowerCase().trim();

            finalRows = finalRows.filter((item) => {
                return (
                    String(item.enquiry_type || "").toLowerCase().includes(q) ||
                    String(item.lead_title || "").toLowerCase().includes(q) ||
                    String(item.lead_location || "").toLowerCase().includes(q) ||
                    String(item.latest_call_status || "").toLowerCase().includes(q) ||
                    String(item.vendor_info?.full_name || "").toLowerCase().includes(q) ||
                    String(item.vendor_info?.contact || "").toLowerCase().includes(q) ||
                    JSON.stringify(item.lead_details || {}).toLowerCase().includes(q)
                );
            });
        }

        finalRows.sort((a, b) => {
            const aTime = a.latest_call_time ? new Date(a.latest_call_time).getTime() : 0;
            const bTime = b.latest_call_time ? new Date(b.latest_call_time).getTime() : 0;
            return bTime - aTime;
        });

        const total = finalRows.length;
        const paginatedRows = finalRows.slice(offset, offset + limit);

        return res.status(200).json(
            responseData(
                "Customer called enquiries fetched successfully",
                {
                    total,
                    page,
                    limit,
                    total_pages: Math.ceil(total / limit),
                    data: paginatedRows
                },
                req,
                true
            )
        );
    } catch (error) {
        console.error("customer call enquiries list error:", error);
        return res.status(500).json(
            responseData(error.message || "Something went wrong", {}, req, false)
        );
    }
});

router.get("/call-enquiries/detail/:enquiry_type/:enquiry_token", [customerMiddleware], async (req, res) => {
    try {
        const customerToken = req.user.token || null;
        const customerContact = req.user.contact || null;
        const matchCustomerTokens = [customerToken, customerContact].filter(Boolean);
        const { enquiry_type, enquiry_token } = req.params;

        const normalizedType = String(enquiry_type).toLowerCase().trim();

        const callHistory = await db.CallsEnquiry.findAll({
            where: {
                enquiry_type: normalizedType,
                enquiry_token,
                customer_token: {
                    [Op.in]: matchCustomerTokens
                }
            },
            attributes: [
                "id",
                "token",
                "enquiry_token",
                "enquiry_type",
                "customer_token",
                "contact",
                "called_by",
                "call_type",
                "call_time",
                "status",
                "created_at",
                "updated_at"
            ],
            order: [["call_time", "DESC"]],
            raw: true
        });

        const enquiryModelMap = {
            cab: db.CabEnquiry,
            flight: db.flightEnquiry,
            hotel: db.hotelEnquiry,
            holiday_package: db.HolidayPackageEnquiry || db.holidayPackageEnquiry,
            insurance: db.InsuranceEnquiry || db.insuranceEnquiry
        };

        const EnquiryModel = enquiryModelMap[normalizedType];

        let enquiryDetails = null;

        if (EnquiryModel) {
            enquiryDetails = await EnquiryModel.findOne({
                where: { token: enquiry_token },
                raw: true
            });
        }

        const vendorTokens = [
            ...new Set(callHistory.map((item) => item.called_by).filter(Boolean))
        ];

        const VendorModel = db.tbl_vendor || db.Vendor || db.vendor;
        let vendorMap = {};

        if (vendorTokens.length && VendorModel) {
            const vendors = await VendorModel.findAll({
                where: {
                    token: {
                        [Op.in]: vendorTokens
                    }
                },
                attributes: [
                    "token",
                    "first_name",
                    "last_name",
                    "contact",
                    "email",
                    "city",
                    "state",
                    "address",
                    "profile_image"
                ],
                raw: true
            });

            vendorMap = Object.fromEntries(
                vendors.map((item) => [item.token, item])
            );
        }

        const calls = callHistory.map((item) => {
            const vendor = item.called_by ? vendorMap[item.called_by] || null : null;

            return {
                id: item.id,
                token: item.token,
                enquiry_token: item.enquiry_token,
                enquiry_type: item.enquiry_type,
                customer_token: item.customer_token,
                contact: item.contact,
                called_by: item.called_by,
                call_type: item.call_type,
                call_time: item.call_time,
                status: item.status,
                created_at: item.created_at,
                updated_at: item.updated_at,
                vendor_info: vendor
                    ? {
                        token: vendor.token,
                        first_name: vendor.first_name,
                        last_name: vendor.last_name,
                        full_name: `${vendor.first_name || ""} ${vendor.last_name || ""}`.trim(),
                        contact: vendor.contact,
                        email: vendor.email,
                        city: vendor.city,
                        state: vendor.state,
                        address: vendor.address,
                        profile_image: vendor.profile_image
                    }
                    : null
            };
        });

        return res.status(200).json(
            responseData(
                "Customer called enquiry detail fetched successfully",
                {
                    enquiry_type: normalizedType,
                    enquiry_token,
                    total_calls: calls.length,
                    latest_call: calls.length ? calls[0] : null,
                    enquiry_details: enquiryDetails || null,
                    calls
                },
                req,
                true
            )
        );
    } catch (error) {
        console.error("customer call enquiry detail error:", error);
        return res.status(500).json(
            responseData(error.message || "Something went wrong", {}, req, false)
        );
    }
});

// get vehicles
router.get('/get-vehicles', [customerMiddleware], async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const search = req.query.search || '';
        const type = req.query.type || 'all';
        const seating = req.query.seating || 'all';
        const ac = req.query.ac || 'all';
        const gps = req.query.gps || 'all';
        const minPrice = req.query.minPrice || null;
        const maxPrice = req.query.maxPrice || null;

        const offset = (page - 1) * limit;

        let whereClause = {
            status: 'active',
            availability: 'available'
        };

        if (search && search.trim() !== '') {
            whereClause[Op.or] = [
                { name: { [Op.like]: `%${search}%` } },
                { type: { [Op.like]: `%${search}%` } },
                {
                    [Op.and]: [
                        Sequelize.where(
                            Sequelize.fn('LOWER', Sequelize.col('name')),
                            { [Op.like]: `%${search.toLowerCase()}%` }
                        )
                    ]
                }
            ];
        }

        if (type && type !== 'all') {
            whereClause.type = type;
        }

        if (seating && seating !== 'all') {
            if (seating === '4') {
                whereClause.seater = { [Op.lte]: 4 };
            } else if (seating === '6') {
                whereClause.seater = { [Op.between]: [5, 6] };
            } else if (seating === '7') {
                whereClause.seater = { [Op.between]: [7, 8] };
            } else if (seating === '9') {
                whereClause.seater = { [Op.gte]: 9 };
            } else {
                whereClause.seater = parseInt(seating);
            }
        }

        if (ac && ac !== 'all') {
            whereClause.ac = ac === 'true' || ac === '1';
        }

        if (gps && gps !== 'all') {
            whereClause.gps = gps === 'true' || gps === '1';
        }
        if (minPrice || maxPrice) {
            whereClause.price_per_day = {};
            if (minPrice) whereClause.price_per_day[Op.gte] = parseFloat(minPrice);
            if (maxPrice) whereClause.price_per_day[Op.lte] = parseFloat(maxPrice);
        }

        // Fetch vehicles with pagination
        const { count, rows } = await Vehicle.findAndCountAll({
            where: whereClause,
            limit: limit,
            offset: offset,
            order: [['created_at', 'DESC']],
            attributes: [
                'id',
                'token',
                'name',
                'type',
                'seater',
                'avg_per_km',
                'ac',
                'gps',
                'availability',
                'status',
                'created_at',
                [Sequelize.literal(`CASE WHEN image1 IS NOT NULL AND image1 != '' THEN CONCAT('${admin_url}', image1) ELSE NULL END`), 'image1'],
                [Sequelize.literal(`CASE WHEN image2 IS NOT NULL AND image2 != '' THEN CONCAT('${admin_url}', image2) ELSE NULL END`), 'image2']
            ],
            raw: true
        });

        // Calculate pagination info
        const totalPages = Math.ceil(count / limit);
        const hasNextPage = page < totalPages;
        const hasPrevPage = page > 1;

        // Prepare response data
        const result = {
            vehicles: rows,
            pagination: {
                current_page: page,
                total_pages: totalPages,
                total_records: count,
                records_per_page: limit,
                has_next_page: hasNextPage,
                has_prev_page: hasPrevPage,
                next_page: hasNextPage ? page + 1 : null,
                prev_page: hasPrevPage ? page - 1 : null
            },
            filters_applied: {
                search: search || null,
                type: type,
                seating: seating,
                ac: ac,
                gps: gps,
                min_price: minPrice,
                max_price: maxPrice
            }
        };

        return res.status(200).json(
            responseData('Vehicles fetched successfully', result, req, true)
        );

    } catch (error) {
        console.error('Get vehicles error:', error);
        return res.status(500).json(
            responseData('Error occurred while fetching vehicles', {}, req, false)
        );
    }
});

// wallet apis
router.get('/wallet/summary', [customerMiddleware], async (req, res) => {
    try {
        const customerToken = req.user.token;
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 4;
        const { status } = req.query;

        const wallet = await getOrCreateWallet({
            user_token: customerToken,
            role: 'CUSTOMER'
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

router.post('/wallet/create-order', [customerMiddleware], async (req, res) => {
    try {
        const { amount } = req.body;
        const customerToken = req.user.token;

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
            user_token: customerToken,
            role: 'CUSTOMER'
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
                customer_token: customerToken,
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

router.post('/wallet/verify-payment', [customerMiddleware], async (req, res) => {
    const t = await db.sequelize.transaction();

    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        } = req.body;

        const customerToken = req.user.token;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            await t.rollback();
            return res.status(400).json(
                responseData('razorpay_order_id, razorpay_payment_id and razorpay_signature are required', {}, req, false)
            );
        }

        const wallet = await getOrCreateWallet({
            user_token: customerToken,
            role: 'CUSTOMER',
            transaction: t
        });

        const lockedWallet = await db.wallet.findOne({
            where: {
                id: wallet.id,
                user_token: customerToken,
                role: 'CUSTOMER',
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

module.exports = router;