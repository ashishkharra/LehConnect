const router = require('express').Router();
const { responseData, formatReadableDate, registerCustomerIfNotExists, fillMissingContactsFromCustomer, generateRefCode } = require("../shared/utils/helper.js");
const { randomstring } = require('../shared/utils/helper.js');
const customerValidation = require('../validation/customer.auth.js');
const db = require('../models/index');
const { Op, Transaction, Sequelize, col, literal, where } = require("sequelize");
const { getIO } = require('../sockets/index.js');

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

const enquiryNotificationQueue = require('../queues/vendor/enquiries/enquiry.queue.js');
const { admin_url } = require('../config/globals.js');


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
                    who_posted: 'CUSTOMER',
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
    flight: {
      model: FlightEnquiry,
      attributes: [
        "id",
        "token",
        "customer_token",
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
        customer_token: row.customer_token || null,
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
        enquiry_table: "tbl_holiday_package_enquiry",
        enquiry_type: "holiday_package",
        enquiry_token: row.token,
        customer_token: row.customer_token || null,
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
        enquiry_table: "tbl_hotel_enquiry",
        enquiry_type: "hotel",
        enquiry_token: row.token,
        customer_token: row.customer_token || null,
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
        "car_number",
        "name",
        "contact",
        "status",
        "create_date",
      ],
      mapRow: (row) => ({
        enquiry_table: "tbl_insurance_enquiry",
        enquiry_type: "insurance",
        enquiry_token: row.token,
        customer_token: row.customer_token || null,
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
        who_posted: 'CUSTOMER',
    },
    attributes: config.attributes,
    raw: true,
  });

  if (!row) return null;

  return config.mapRow(row);
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

router.post('/enquiry', [], async (req, res) => {
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

        customerToken

        const payload = {
            token: randomstring(64),
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
}
);

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
                        "contact",
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
        const customerToken = req.user.token;
        const { enquiry_type, enquiry_token } = req.params;

        const normalizedType = String(enquiry_type).toLowerCase().trim();

        const callHistory = await db.CallsEnquiry.findAll({
            where: {
                customer_token: customerToken,
                enquiry_type: normalizedType,
                enquiry_token
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

module.exports = router;