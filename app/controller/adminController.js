const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { admin_url } = require('../config/globals.js')
const { Op, Sequelize } = require('sequelize');
const { getSequelizePagination, responseData_, getIconForCounter, getSuffixForCounter, getCategoryForCounter, getPositionForCounter, codeGenerator, verifyPassword, hashPassword, randomstring, buildPaymentLedgerWhere, getLedgerBaseSubquery, buildOrderClause, getTypeName, getMethodName, getStatusColor, getTypeColor, getMethodIcon, safeJsonParse, toArray, responseData, getDateRangeFromQuickRange } = require('../shared/utils/helper.js')
const { validateEmail, validatePhone } = require('../shared/utils/validation')
const { queuePartialVendorReminder, asyncHandler } = require('../shared/utils/helper.js')
const { QueryTypes } = require('sequelize');
const admin = require('../config/firebase.js')

const db = require('../models/index');
const sequelize = db.sequelize
const { getIO } = require("../sockets/index.js");
const Vendor = db.vendor
const Admin = db.admin
const SiteSlider = db.sliderSeting
const BookingSlider = db.bookingSlider
const Video = db.helpVideo
const Booking = db.booking
const BookingRequest = db.bookingRequest
const BookingReject = db.bookingRejection
const FreeVehicle = db.freeVehicle
const Counter = db.counter
const Review = db.review
const Service = db.service
const VendorAccDelReq = db.vendor_acc_delete_req
const Faq = db.faqs
const About = db.about
const Notification = db.notification
const VendorHelp = db.vendor_help
const VendorHelpAnswer = db.vendor_help_answer
const ReferralSetting = db.referral_setting
const ReferralHistory = db.referral_history
const SiteSetting = db.siteSettings
const HotelEnquiry = db.hotelEnquiry
const VendorDeviceFcm = db.vendor_device_fcm
const VendorPayout = db.vendorPayout
const BookingRefund = db.bookingRefund
const BookingPayment = db.bookingPayment
const Vehicle = db.AddVehicle


const vendorDeleteQueue = require('../queues/vendor/vendor_delete.queue.js');
const message = require('../sockets/message.js');


const adminController = {

    // auth
    logout: async (req, res) => {
        req.session.destroy(err => {
            if (err) {
                console.error('Session destruction error:', err);
                return next(err);
            }
            res.clearCookie('connect.sid', { path: '/' });
            res.redirect('/');
        });
    },

    login: async (req, res) => {
        const { email, password } = req.body;

        try {
            const admin = await Admin.findOne({
                attributes: ['token', 'email', 'password', 'salt', 'username', 'profile_image'],
                where: { email }
            });

            if (!admin) {
                req.setFlash('error', 'Email does not exist');
                return res.redirect('/login');
            }

            const isValidPassword = verifyPassword(password, admin.password, admin.salt);
            if (!isValidPassword) {
                req.setFlash('error', 'Password does not match');
                return res.redirect('/login');
            }

            req.session.user = {
                username: admin.username,
                email: admin.email,
                token: admin.token,
                profile_image: admin.profile_image,
            };

            req.setFlash('success', `Welcome back, ${admin.username}`);
            return res.redirect('/');

        } catch (err) {
            console.log('Login Controller Error:', err);
            req.setFlash('error', 'Something went wrong');
            return res.redirect('/login');
        }
    },

    register: async (req, res) => {
        try {
            const { username, email, password } = req.body;

            const { hash, salt } = hashPassword(password);

            const token = randomstring(64);

            await Admin.create({
                username,
                email,
                password: hash,
                salt: salt,
                token
            });
            req.setFlash('success', 'Admin created')
            res.redirect('/');

        } catch (err) {
            console.log('Register Controller Error:', err);
            req.setFlash('error', 'Admin creation failed')
            res.redirect('/');
        }

    },

    // profile
    editProfile: async (req, res) => {
        try {
            const updates = req.body;
            const token = req?.session?.user?.token;

            if (!updates || Object.keys(updates).length === 0) {
                req.setFlash('error', 'Nothing to update');
                return res.redirect('/profile');
            }

            // if (updates?.email && !validateEmail(updates?.email.trim())) {
            //     req.setFlash('error', 'Enter a valid Email');
            //     return res.redirect('/profile');
            // }

            // if (updates?.phone && !validatePhone(updates?.phone.trim())) {
            //     req.setFlash('error', 'Enter a valid Phone number');
            //     return res.redirect('/profile');
            // }

            const cleanData = {};
            for (const key in updates) {
                if (updates[key] && updates[key].trim() !== "") {
                    cleanData[key] = updates[key].trim();
                }
            }

            await await Admin.update(
                data,
                { where: { token } }
            );

            for (const key in cleanData) {
                req.session.user[key] = cleanData[key];
            }

            req.setFlash('success', 'Profile updated successfully');
            return res.redirect('/profile');
        } catch (error) {
            console.log('Profile update Controller Error:', err);
            req.setFlash('error', 'Profile update failed');
            return res.redirect('/profile');
        }
    },

    updateProfilePic: async (req, res) => {
        try {
            const token = req?.session?.user?.token;

            const updates = {};

            if (req.file) {
                updates.profile_image = "/uploads/" + req?.file?.filename;
            } else {
                req.setFlash("error", "No file uploaded");
                return res.redirect("/profile");
            }

            await await Admin.update(
                data,
                { where: { token } }
            );

            req.session.user.profile_image = updates.profile_image;

            req.setFlash("success", "Profile picture updated successfully");
            return res.redirect("/profile");

        } catch (error) {
            console.log("Profile pic update Controller Error:", error);
            req.setFlash("error", "Profile picture update failed");
            return res.redirect("/profile");
        }
    },

    editPassword: async (req, res) => {
        try {
            const { currentPassword, newPassword, confirmPassword } = req.body;
            const token = req?.session?.user?.token;

            if (!currentPassword || !newPassword || !confirmPassword) {
                req.setFlash('error', 'All fields are required');
                return res.redirect('/profile');
            }

            if (newPassword !== confirmPassword) {
                req.setFlash('error', 'New password and confirm password do not match');
                return res.redirect('/profile');
            }

            const email = req?.session?.user?.email;
            const admin = await findByEmail(email);

            if (!admin || !admin.password) {
                req.setFlash('error', 'User password not found');
                return res.redirect('/profile');
            }

            const encryptedPassword = typeof admin.password === 'string'
                ? JSON.parse(admin.password)
                : admin.password;

            const decryptedPassword = decrypt(encryptedPassword);

            if (currentPassword !== decryptedPassword) {
                req.setFlash('error', 'Old password is incorrect');
                return res.redirect('/profile');
            }

            const encryptedNewPassword = JSON.stringify(encrypt(newPassword));

            await Admin.update(
                { password: encryptedNewPassword },
                { where: { token } }
            );

            req.setFlash('success', 'Password updated successfully');
            setTimeout(() => {
                return res.redirect('/logout');
            }, 2000)

        } catch (error) {
            console.log('Password update Controller Error:', error);
            req.setFlash('error', 'Password update failed');
            return res.redirect('/profile');
        }
    },

    // vendor
    getVendor: async (token) => {
        try {
            const filters = {
                // verification_status: 'SUBMITTED',
                token: token
            };

            const result = await getSequelizePagination({
                model: Vendor,
                page: 1,
                limit: 1,
                include: [],
                where: filters,
                attributes: [
                    'id',
                    'token',
                    'first_name', 'last_name',
                    'status',
                    'verification_status',
                    'contact',
                    'submitted_on',
                    'country',
                    'state',
                    'city',
                    'about_me',
                    'create_date',
                    [
                        Sequelize.literal(`
                        CASE
                            WHEN profile_image IS NOT NULL
                            THEN CONCAT('${admin_url}', profile_image)
                            ELSE NULL
                        END
                    `),
                        'profile_image'
                    ],
                    [
                        Sequelize.literal(`
                        CASE
                            WHEN aadhaar_front_image IS NOT NULL
                            THEN CONCAT('${admin_url}', aadhaar_front_image)
                            ELSE NULL
                        END
                    `),
                        'aadhaar_front_image'
                    ],
                    [
                        Sequelize.literal(`
                        CASE
                            WHEN aadhaar_back_image IS NOT NULL
                            THEN CONCAT('${admin_url}', aadhaar_back_image)
                            ELSE NULL
                        END
                    `),
                        'aadhaar_back_image'
                    ],
                    [
                        Sequelize.literal(`
                        CASE
                            WHEN dl_front_image IS NOT NULL
                            THEN CONCAT('${admin_url}', dl_front_image)
                            ELSE NULL
                        END
                    `),
                        'dl_front_image'
                    ],
                    [
                        Sequelize.literal(`
                        CASE
                            WHEN dl_back_image IS NOT NULL
                            THEN CONCAT('${admin_url}', dl_back_image)
                            ELSE NULL
                        END
                    `),
                        'dl_back_image'
                    ],
                    [
                        Sequelize.literal(`
                        CASE
                            WHEN vehicle_image IS NOT NULL
                            THEN CONCAT('${admin_url}', vehicle_image)
                            ELSE NULL
                        END
                    `),
                        'vehicle_image'

                    ],

                    'create_date'
                ],
                order: [['create_date', 'DESC']]
            });

            if (result?.docs.length <= 0) {
                return responseData_(
                    'Vendor not found',
                    {},
                    false
                );
            }

            return responseData_(
                'Vendor fetched successfully',
                result,
                true
            );

        } catch (err) {
            console.error('get vendor error : ', err);
            return responseData_('Internal server error', {}, false);
        }
    },

    getVendorRequests: async (page, limit, status, search) => {
        try {
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);

            const endOfToday = new Date();
            endOfToday.setHours(23, 59, 59, 999);

            const searchWhere = { flag: 0 };

            if (search) {
                searchWhere[Op.or] = [
                    { first_name: { [Op.like]: `%${search}%` } },
                    { last_name: { [Op.like]: `%${search}%` } },
                    { contact: { [Op.like]: `%${search}%` } }
                ];
            }

            const listWhere = { ...searchWhere };

            if (status && status !== 'all') {
                listWhere.verification_status = status.toUpperCase();
            }

            const result = await getSequelizePagination({
                model: Vendor,
                page,
                limit,
                where: listWhere,
                attributes: [
                    'token',
                    'first_name',
                    'last_name',
                    'status',
                    'verification_status',
                    'contact',
                    'submitted_on',
                    'create_date',
                ],
                order: [['create_date', 'DESC']]
            });

            const [
                totalCount,
                partialCount,
                notStartedCount,
                verifiedCount,
                submittedCount,
                rejectCount,
                todayRequests,
                resolvedVendors
            ] = await Promise.all([
                Vendor.count({ where: { flag: 0 } }),
                Vendor.count({
                    where: { flag: 0, verification_status: 'PARTIAL' }
                }),
                Vendor.count({
                    where: { flag: 0, verification_status: 'NOT_STARTED' }
                }),

                Vendor.count({
                    where: { flag: 0, verification_status: 'VERIFIED' }
                }),

                Vendor.count({
                    where: { flag: 0, verification_status: 'SUBMITTED' }
                }),

                Vendor.count({
                    where: { flag: 0, verification_status: 'REJECTED' }
                }),

                Vendor.count({
                    where: {
                        flag: 0,
                        submitted_on: { [Op.between]: [startOfToday, endOfToday] }
                    }
                }),

                Vendor.findAll({
                    attributes: ['submitted_on', 'update_date'],
                    where: {
                        flag: 0,
                        verification_status: {
                            [Op.in]: ['VERIFIED', 'REJECTED']
                        },
                        submitted_on: { [Op.between]: [startOfToday, endOfToday] }
                    },
                    raw: true
                })
            ]);

            const totalProcessed = verifiedCount + rejectCount;

            const approvalRate = totalProcessed
                ? Number(((verifiedCount / totalProcessed) * 100).toFixed(2))
                : 0;

            let totalMinutes = 0;
            let responseCount = 0;

            for (const vendor of resolvedVendors) {
                const submittedAt = new Date(vendor.submitted_on);
                const respondedAt = new Date(vendor.updatedAt);

                if (!isNaN(submittedAt) && !isNaN(respondedAt)) {
                    const diffMinutes = (respondedAt - submittedAt) / (1000 * 60);
                    if (diffMinutes >= 0) {
                        totalMinutes += diffMinutes;
                        responseCount++;
                    }
                }
            }

            const averageResponseTime = responseCount
                ? Number((totalMinutes / responseCount).toFixed(2))
                : 0;

            return responseData_(
                'Vendors fetched successfully',
                {
                    ...result,
                    statusCounts: {
                        total: totalCount,
                        partialCount: partialCount,
                        notStartedCount,
                        verifiedCount,
                        submittedCount,
                        rejectCount,
                        todayRequests,
                        approvalRatePercentage: approvalRate,
                        averageResponseTimeMinutes: averageResponseTime
                    }
                },
                true
            );

        } catch (err) {
            console.error('get vendor error:', err);
            return responseData_('Internal server error', {}, false);
        }
    },

    // socket added new
    remindPartialVendors: async (req, res) => {
        try {
            await queuePartialVendorReminder({
                triggeredBy: 'MANUAL',
                requestedBy: req.user?.token || 'SYSTEM'
            });

            req.setFlash('success', 'Vendor reminder job queued');
            return res.redirect('/vendor-requests');
        } catch (err) {
            console.error('[REMINDER] Queue error:', err);
            req.setFlash('error', 'Failed to queue reminder job');
            return res.redirect('/vendor-requests');
        }
    },

    // socket added new
    remindVendor: async (req, res) => {
        try {
            const vendorToken = req.params.token
            if (!vendorToken) {
                req.setFlash('error', 'Vendor not found')
                return res.redirect(`/view-vendor/${vendorToken}`)
            }

            setImmediate(async () => {
                try {
                    const io = getIO();

                    const vendor = await Vendor.findOne({
                        where: {
                            token: vendorToken,
                            flag: 0,
                            verification_status: 'PARTIAL'
                        },
                        attributes: ['token', 'first_name', 'last_name'],
                        raw: true
                    });

                    if (!vendor) {
                        return;
                    }

                    await Notification.create({
                        sender_token: null,
                        receiver_token: vendor.token,
                        receiver_role: 'vendor',
                        type: 'SYSTEM_ALERT',
                        title: 'Verification Incomplete',
                        message: `Hi ${vendor.first_name || ''} ${vendor.last_name || ''}, your verification is partially completed. Please complete it to continue.`,
                        payload: {
                            reason: 'PARTIAL_VERIFICATION',
                            action: 'COMPLETE_VERIFICATION'
                        }
                    });

                    io.to(`vendor:${vendor.token}`).emit(
                        'verification:incomplete',
                        {
                            type: 'SYSTEM_ALERT',
                            from: triggeredBy === 'CRON' ? 'SYSTEM' : 'ADMIN',
                            title: 'Verification Incomplete',
                            message: 'Please complete your verification'
                        }
                    );

                } catch (bgError) {
                    console.error(
                        '[REMIND_VENDOR] Background error:',
                        bgError
                    );
                    req.setFlash('error', '[REMIND_VENDOR] Background error')
                }
            });

        } catch (err) {
            console.error('[REMIND_VENDOR] API error:', err);
            req.setFlash('error', 'Internal server error')
            return res.redirect(`/view-vendor/${vendorToken}`)
        }
    },


    getAllVendorsInfo: async (req) => {
        try {
            const page = Number(req.query.page) || 1;
            const limit = Number(req.query.limit) || 12;

            const filters = {
                flag: 0,
                verification_status: 'VERIFIED'
            };

            // STATUS filter
            if (req.query.status) {
                if (req.query.status === 'inactive') {
                    filters.status = 'inactive';
                } else if (req.query.status === 'pending') {
                    filters.verification_status = 'NOT_STARTED';
                } else {
                    filters.status = req.query.status;
                }
            }

            // SEARCH filter
            if (req.query.search) {
                filters[Op.or] = [
                    { first_name: { [Op.like]: `%${req.query.search}%` } },
                    { last_name: { [Op.like]: `%${req.query.search}%` } },
                    { contact: { [Op.like]: `%${req.query.search}%` } }
                ];
            }

            const result = await getSequelizePagination({
                model: Vendor,
                page,
                limit,
                where: filters,
                attributes: [
                    'token',
                    'first_name', 'last_name',
                    'status',
                    'address',
                    'contact',
                    'profile_image',
                    [
                        Sequelize.literal(`
                        CASE
                            WHEN profile_image IS NOT NULL
                            THEN CONCAT('${admin_url}', profile_image)
                            ELSE NULL
                        END
                    `),
                        'profile_image'
                    ],
                    'create_date'
                ],
                order: [['create_date', 'DESC']]
            });

            // counts SHOULD NOT use filtered where
            const baseWhere = { flag: 0 };

            const [totalCount, activeCount, notVerifiedCount, softDeletedCount] = await Promise.all([
                Vendor.count({ where: baseWhere }),
                Vendor.count({ where: { ...baseWhere, status: 'active' } }),
                Vendor.count({ where: { ...baseWhere, verification_status: 'NOT_STARTED' } }),
                Vendor.count({ where: { flag: 1 } })
            ]);

            return responseData_('Vendor requests fetched successfully', {
                ...result,
                statusCounts: {
                    total: totalCount,
                    active: activeCount,
                    not_verified: notVerifiedCount,
                    soft_deleted: softDeletedCount
                }
            }, true);

        } catch (err) {
            console.error('get vendor error : ', err);
            return responseData_('Internal server error', {}, false);
        }
    },

    exportVendors: async (req, res) => {
        try {
            const { search, status } = req.query;

            const where = {};

            if (status) {
                where.status = status;
            }

            if (search) {
                where[Op.or] = [
                    { first_name: { [Op.like]: `%${search}%` } },
                    { last_name: { [Op.like]: `%${search}%` } },
                    { contact: { [Op.like]: `%${search}%` } }
                ];
            }

            const vendors = await Vendor.findAll({
                where,
                attributes: [
                    'first_name',
                    'last_name',
                    'contact',
                    'status',
                    'verification_status',
                    'submitted_on'
                ],
                raw: true
            });

            let csv = 'First Name,Last Name,Contact,Status,Verification,Submitted On\n';

            vendors.forEach(v => {
                csv += `"${v.first_name}","${v.last_name}","${v.contact}","${v.status}","${v.verification_status}","${v.submitted_on}"\n`;
            });

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader(
                'Content-Disposition',
                'attachment; filename="vendors.csv"'
            );

            return res.status(200).send(csv);

        } catch (err) {
            console.error(err);
            return res.status(500).send('Export failed');
        }
    },

    // socket added new
    vendorAcceptProfile: async (req, res) => {
        const { token } = req.body;
        const io = getIO()
        try {
            if (!token) {
                req.setFlash("error", "Vendor token is required");
                return res.redirect("/vendor-requests");
            }

            const [updated] = await Vendor.update(
                {
                    verification_status: "VERIFIED",
                    rejectReason: null,
                    reject_reason_meta: null,
                },
                { where: { token } }
            );

            if (!updated) {
                req.setFlash("error", "Vendor not found");
                return res.redirect("/vendor-requests");
            }

            io.to(`vendor:${token}`).emit('SYSTEM_NOTIFICATION', {
                type: 'SYSTEM_ALERT',
                title: 'Profile accepted',
                message: 'Your account profile has been accepted.',
                is_read: false,
            });

            req.setFlash("success", "Vendor approved successfully");
            return res.redirect(`/view-vendor/${token}`);

        } catch (error) {
            console.error("Approve vendor error:", error);
            req.setFlash("error", "Vendor approval failed");
            return res.redirect("/vendor-requests");
        }
    },

    // socket added new
    vendorRejectProfile: async (req, res) => {
        const {
            token,
            reject_reason_code,
            reject_notes,
        } = req.body;
        const io = getIO()

        try {
            if (!token) {
                req.setFlash("error", "Vendor token is required");
                return res.redirect("/vendor-requests");
            }

            if (!reject_reason_code) {
                req.setFlash("error", "Reject reason is required");
                return res.redirect(`/view-vendor/${token}`);
            }

            const REASON_LABELS = {
                INVALID_DOCUMENTS: "Invalid documents",
                BLURRED_IMAGES: "Blurred or unclear images",
                INCOMPLETE_DOCUMENTS: "Incomplete documents",
                DOCUMENT_MISMATCH: "Document information mismatch",
                OTHER: "Other reason",
            };

            const rejectReason =
                reject_notes || REASON_LABELS[reject_reason_code];

            const rejectMeta = {
                rejected_by: "ADMIN",
                rejected_at: new Date(),
                reasons: [reject_reason_code],
                comments: reject_notes || null,
                ip: req.ip,
                user_agent: req.headers["user-agent"],
            };

            const [updated] = await Vendor.update(
                {
                    verification_status: "REJECTED",
                    rejectReason,
                    reject_reason_meta: rejectMeta,
                },
                { where: { token } }
            );

            if (!updated) {
                req.setFlash("error", "Vendor not found");
                return res.redirect("/vendor-requests");
            }

            io.to(`vendor:${token}`).emit('SYSTEM_NOTIFICATION', {
                type: 'SYSTEM_ALERT',
                title: 'Profile rejected',
                message: 'Your account profile has been rejected.',
                is_read: false,
            });

            req.setFlash("success", "Vendor rejected successfully");
            return res.redirect(`/view-vendor/${token}`);

        } catch (error) {
            console.error("Reject vendor error:", error);
            req.setFlash("error", "Vendor rejection failed");
            return res.redirect(`/view-vendor/${token}`);
        }
    },

    reviewVendor: async (req, res) => {
        const { token } = req.body
        try {
            await Vendor.update(
                {
                    verification_status: 'UNDER_REVIEW',
                    rejectReason: null,
                    reject_reason_meta: null
                },
                {
                    where: { token }
                }
            );

            req.setFlash('success', 'Vendor is under review')
        } catch (error) {
            console.log('Review vendor error ', error)
            req.setFlash('error', error.message)
        } finally {
            return res.redirect(`/view-vendor/${token}`)
            // return res.redirect('/vendor-requests')
        }
    },

    getOpenDuties: async ({ duty_type = 'BOOKING', accept_type, trip_type, search, range, page = 1, limit = 12 }) => {
        try {
            page = parseInt(page);
            limit = parseInt(limit);

            const offset = (page - 1) * limit;

            let dateCondition = {};

            if (!range) {
                dateCondition = {
                    [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000)
                };
            } else {
                const [from, to] = range.split(',');
                if (from && to) {
                    dateCondition = {
                        [Op.between]: [
                            new Date(`${from} 00:00:00`),
                            new Date(`${to} 23:59:59`)
                        ]
                    };
                }
            }


            const vendorInclude = {
                model: Vendor,
                as: 'vendor',
                attributes: [
                    'token',
                    [Sequelize.literal(`CONCAT(first_name,' ',last_name)`), 'vendor_name']
                ],
                required: !!search,
                where: search
                    ? {
                        [Op.or]: [
                            { first_name: { [Op.like]: `%${search}%` } },
                            { last_name: { [Op.like]: `%${search}%` } }
                        ]
                    }
                    : undefined
            };

            const bookingWhere = {
                status: 'OPEN',
                created_at: dateCondition
            };

            if (accept_type) {
                bookingWhere.accept_type = accept_type;
            }

            if (trip_type) {
                bookingWhere.trip_type = trip_type;
            }

            const freeVehicleWhere = {
                status: 'AVAILABLE',
                created_at: dateCondition
            };

            if (accept_type) {
                freeVehicleWhere.accept_type = accept_type;
            }

            const [bookings, freeVehicles] = await Promise.all([

                duty_type !== 'FREE_VEHICLE'
                    ? Booking.findAll({
                        where: bookingWhere,
                        attributes: [
                            'token',
                            'accept_type',
                            'created_at',
                            'trip_type',
                            'status',
                            'pickup_datetime',
                            'return_datetime'
                        ],
                        include: [vendorInclude],
                        order: [['created_at', 'DESC']]
                    })
                    : Promise.resolve([]),

                duty_type !== 'BOOKING'
                    ? FreeVehicle.findAll({
                        where: freeVehicleWhere,
                        attributes: [
                            'token',
                            'accept_type',
                            'created_at',
                            'status',
                            'free_start_time',
                            'free_end_time'
                        ],
                        include: [vendorInclude],
                        order: [['created_at', 'DESC']]
                    })
                    : Promise.resolve([])

            ]);

            const duties = [
                ...bookings.map(b => ({
                    duty_type: 'BOOKING',
                    token: b.token,
                    vendor_name: b.vendor?.vendor_name || '-',
                    accept_type: b.accept_type,
                    posted_at: b.created_at,
                    trip_type: b.trip_type,
                    status: b.status,
                    pickup_datetime: b.pickup_datetime,
                    return_date: b.return_datetime
                })),

                ...freeVehicles.map(v => ({
                    duty_type: 'FREE_VEHICLE',
                    token: v.token,
                    vendor_name: v.vendor?.vendor_name || '-',
                    accept_type: v.accept_type,
                    posted_at: v.created_at,
                    status: v.status,
                    free_start_time: v.free_start_time,
                    free_end_time: v.free_end_time
                }))
            ];

            duties.sort((a, b) => new Date(b.posted_at) - new Date(a.posted_at));

            const paginatedDuties = duties.slice(offset, offset + limit);

            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);

            const endOfToday = new Date();
            endOfToday.setHours(23, 59, 59, 999);

            const [
                totalBookingsToday,
                totalFreeVehiclesToday,
                pendingBookingsToday,
                availableFreeVehiclesToday
            ] = await Promise.all([
                Booking.count({
                    where: {
                        created_at: { [Op.between]: [startOfToday, endOfToday] }
                    }
                }),

                FreeVehicle.count({
                    where: {
                        created_at: { [Op.between]: [startOfToday, endOfToday] }
                    }
                }),

                Booking.count({
                    where: {
                        status: 'OPEN',
                        created_at: { [Op.between]: [startOfToday, endOfToday] }
                    }
                }),

                FreeVehicle.count({
                    where: {
                        status: 'AVAILABLE',
                        free_start_time: { [Op.lte]: endOfToday },
                        free_end_time: { [Op.gte]: startOfToday }
                    }
                })
            ]);

            return {
                stats: {
                    totalBookingsToday,
                    totalFreeVehiclesToday,
                    pendingBookingsToday,
                    availableFreeVehiclesToday
                },
                results: paginatedDuties,
                pagination: {
                    page,
                    limit,
                    totalDocs: duties.length,
                    totalPages: Math.ceil(duties.length / limit)
                }
            };

        } catch (error) {
            console.error('Get duties error:', error);
            return {
                stats: {},
                results: [],
                pagination: {},
                error: true
            };
        }
    },

    showDuty: async ({ duty_type, token }) => {
        try {
            if (
                !duty_type ||
                !token ||
                !['BOOKING', 'FREE_VEHICLE'].includes(duty_type)
            ) {
                return responseData_('Invalid parameters', {}, false)
            }

            if (duty_type === 'BOOKING') {
                const booking = await Booking.findOne({
                    where: { token },
                    include: [
                        {
                            model: Vendor,
                            as: 'vendor',
                            attributes: [
                                'email',
                                [
                                    Sequelize.literal(`
                CASE
                    WHEN vendor.first_name IS NOT NULL
                     AND vendor.last_name IS NOT NULL
                    THEN CONCAT(vendor.first_name, ' ', vendor.last_name)
                    ELSE NULL
                END
            `),
                                    'full_name'
                                ],
                                'verification_status',
                                'create_date'
                            ]
                        }
                        ,
                        {
                            model: BookingRequest,
                            as: 'booking_requests',
                            required: false,
                            include: [
                                {
                                    model: Vendor,
                                    as: 'requester',
                                    attributes: [
                                        'email',
                                        'verification_status',
                                        'first_name',
                                        'last_name'
                                    ]

                                }
                            ]
                        },
                        {
                            model: BookingReject,
                            as: 'booking_rejections',
                            required: false,
                            include: [
                                {
                                    model: Vendor,
                                    as: 'rejecter',
                                    attributes: [
                                        'email',
                                        'first_name',
                                        'last_name',
                                        'verification_status'
                                    ]
                                }
                            ]
                        }
                    ]
                });

                if (!booking) {
                    return responseData_('Booking not found', {}, false)
                }

                // Get counts
                const totalRequests = booking.booking_requests?.length || 0;
                const totalRejections = booking.booking_rejections?.length || 0;

                return {
                    success: true,
                    message: 'BOOKING_FETCHED',
                    results: {
                        duty_type: 'BOOKING',
                        booking,
                        stats: {
                            totalRequests,
                            totalRejections
                        }
                    }
                }
            }

            if (duty_type === 'FREE_VEHICLE') {
                const freeVehicle = await FreeVehicle.findOne({
                    where: { token },
                    include: [
                        {
                            model: Vendor,
                            as: 'vendor',
                            attributes: ['token', 'vendor_name', 'verification_status', 'create_date']
                        },
                        {
                            model: FreeVehicleRequest,
                            as: 'requests',
                            required: false,
                            include: [
                                {
                                    model: Vendor,
                                    as: 'requester',
                                    attributes: ['token', 'vendor_name', 'verification_status']
                                }
                            ]
                        }
                    ]
                });


                if (!freeVehicle) {
                    return responseData_('Free vehicle not found', {}, false)
                }

                // Get counts for free vehicle
                const totalRequests = freeVehicle.requests?.length || 0;

                return {
                    success: true,
                    message: 'FREE_VEHICLE_FETCHED',
                    results: {
                        duty_type: 'FREE_VEHICLE',
                        freeVehicle,
                        stats: {
                            totalRequests
                        }
                    }
                }
            }

            return responseData_('Invalid duty type', {}, false)

        } catch (error) {
            console.error('showDuty error:', error)
            return responseData_('Internal server error', {}, false)
        }
    },

    getDeleteRequests: async (req) => {
        try {
            const { query } = req;
            const page = parseInt(query.page) || 1;
            const limit = parseInt(query.limit) || 10;
            const offset = (page - 1) * limit;

            const whereCondition = {};

            if (query.status) {
                whereCondition.status = query.status;
            }

            if (query.search) {
                const searchVal = `%${query.search}%`;
                whereCondition[Sequelize.Op.or] = [
                    { vendor_token: { [Sequelize.Op.like]: searchVal } },
                    { '$tbl_vendor.first_name$': { [Sequelize.Op.like]: searchVal } },
                    { '$tbl_vendor.last_name$': { [Sequelize.Op.like]: searchVal } },
                    { '$tbl_vendor.email$': { [Sequelize.Op.like]: searchVal } }
                ];
            }
            const { count, rows } = await VendorAccDelReq.findAndCountAll({
                where: whereCondition,
                order: [['create_date', 'DESC']],
                limit: limit,
                offset: offset,
                include: [{
                    model: Vendor,
                    attributes: ['first_name', 'last_name', 'email', 'contact']
                }]
            });

            const result = {
                docs: rows,
                totalDocs: count,
                totalPages: Math.ceil(count / limit),
                page: page,
                query: query
            };

            return responseData_("Delete requests fetched successfully", result, true);
        } catch (error) {
            console.log('getting delete account request error ', error);
            return responseData_("Internal server error", {}, false);
        }
    },

    processDeleteRequest: async (req, res) => {
        const t = await sequelize.transaction();
        try {
            const { action, remark, token } = req.body;
            const io = getIO();

            const delRequest = await VendorAccDelReq.findOne({
                where: { vendor_token: token },
                transaction: t,
                lock: t.LOCK.UPDATE
            });

            if (!delRequest) {
                await t.rollback();
                return res.status(404).json(responseData_('Request not found', {}, false));
            }

            if (action === 'APPROVE') {
                await delRequest.update({
                    status: 'APPROVED',
                    admin_remark: remark,
                    processed_at: new Date()
                }, { transaction: t });

                await Vendor.update({
                    status: 'inactive',
                    flag: 1
                }, {
                    where: { token },
                    transaction: t
                });

                await Session.destroy({
                    where: {
                        user_token: token,
                        role: 'VENDOR'
                    },
                    transaction: t
                });

                await t.commit();

                io.to(`vendor:${token}`).emit('SYSTEM_NOTIFICATION', {
                    type: 'SYSTEM_ALERT',
                    title: 'Account Deleted',
                    message: 'Your account deletion request has been approved and your account has been deactivated.',
                    is_read: false,
                    is_delete: true,
                    admin_remark: remark
                });

                // QUEUE
                await vendorDeleteQueue.add('DELETE_APPROVED', {
                    vendor_token: token,
                    type: 'SYSTEM_ALERT',
                    title: 'Account Deleted',
                    message: 'Your account deletion request has been approved and your account has been deactivated.',
                    admin_remark: remark,
                    is_delete: true
                });

            } else {
                await delRequest.update({
                    status: 'REJECTED',
                    admin_remark: remark,
                    processed_at: new Date()
                }, { transaction: t });

                await t.commit();

                io.to(`vendor:${token}`).emit('SYSTEM_NOTIFICATION', {
                    type: 'SYSTEM_ALERT',
                    title: 'Request Rejected',
                    message: 'Your account delete request is rejected by admin.',
                    is_read: false,
                    is_delete: false,
                    admin_remark: remark
                });

                // QUEUE
                await vendorDeleteQueue.add('DELETE_REJECTED', {
                    vendor_token: token,
                    type: 'SYSTEM_ALERT',
                    title: 'Request Rejected',
                    message: 'Your account delete request is rejected by admin.',
                    admin_remark: remark,
                    is_delete: false
                });
            }

            req.setFlash('success', `Request ${action === 'APPROVE' ? 'approved' : 'rejected'}`)

        } catch (error) {
            if (t && !t.finished) {
                await t.rollback();
            }
            console.log('Process delete request error : ', error);
            req.setFlash('error', `Request action failed`)
        } finally {
            res.redirect('/vendor-delete/request')
        }
    },

    /* ------------------- App Management --------------------*/

    //counter
    setCounter: async (req, res) => {
        try {
            const {
                happy_customers,
                verified_vendors,
                app_rating,
                total_cities,
                total_bookings,
                active_users,
                support_rating,
                app_downloads,
                show_counters,
                auto_update,
                bulk_update,
                counter_keys
            } = req.body;

            if (bulk_update === 'true' || bulk_update === true) {
                const requiredFields = {
                    happy_customers: 'Happy Customers',
                    verified_vendors: 'Verified Vendors',
                    app_rating: 'App Rating',
                    total_cities: 'Total Cities'
                };

                const missingFields = [];
                Object.entries(requiredFields).forEach(([key, label]) => {
                    if (!req.body[key] && req.body[key] !== 0) {
                        missingFields.push(label);
                    }
                });

                if (missingFields.length > 0) {
                    req.setFlash("error", `Missing required fields: ${missingFields.join(', ')}`);
                    return res.redirect("/counter");
                }

                // Validate app rating
                const appRatingValue = parseFloat(app_rating);
                if (appRatingValue < 0 || appRatingValue > 5) {
                    req.setFlash("error", "App rating must be between 0 and 5");
                    return res.redirect("/counter");
                }

                // Validate support rating
                const supportRatingValue = parseFloat(support_rating || 0);
                if (supportRatingValue < 0 || supportRatingValue > 100) {
                    req.setFlash("error", "Support rating must be between 0 and 100");
                    return res.redirect("/counter");
                }

                // Prepare counters data for bulk update
                const countersData = [
                    { key: 'happy_customers', value: parseFloat(happy_customers) },
                    { key: 'verified_vendors', value: parseFloat(verified_vendors) },
                    { key: 'app_rating', value: appRatingValue },
                    { key: 'total_cities', value: parseFloat(total_cities) },
                    { key: 'total_bookings', value: parseFloat(total_bookings || 0) },
                    { key: 'active_users', value: parseFloat(active_users || 0) },
                    { key: 'support_rating', value: supportRatingValue },
                    { key: 'app_downloads', value: parseFloat(app_downloads || 0) },
                    { key: 'show_counters', value: show_counters ? 1 : 0 },
                    { key: 'auto_update', value: auto_update ? 1 : 0 }
                ];

                for (const counterData of countersData) {
                    let counter = await Counter.findOne({ where: { key: counterData.key } });

                    if (counter) {
                        await counter.update({
                            value: counterData.value,
                            last_updated_by: req.admin?.token || null,
                            updated_at: new Date()
                        });
                    } else {
                        await Counter.create({
                            token: randomstring(64),
                            key: counterData.key,
                            value: counterData.value,
                            display_name: counterData.key.split('_').map(word =>
                                word.charAt(0).toUpperCase() + word.slice(1)
                            ).join(' '),
                            icon: getIconForCounter(counterData.key),
                            suffix: getSuffixForCounter(counterData.key),
                            category: getCategoryForCounter(counterData.key),
                            position: getPositionForCounter(counterData.key),
                            last_updated_by: req.admin?.token || null
                        });
                    }
                }

                req.setFlash("success", "All counters updated successfully");
                return res.redirect("/counter");

            } else {
                // Handle single counter update (if needed)
                const { key, value } = req.body;

                if (!key || value === undefined) {
                    req.setFlash("error", "Counter key and value are required");
                    return res.redirect("/counter");
                }

                const parsedValue = parseFloat(value);
                if (isNaN(parsedValue)) {
                    req.setFlash("error", "Value must be a valid number");
                    return res.redirect("/counter");
                }

                let counter = await Counter.findOne({ where: { key } });

                if (counter) {
                    await counter.update({
                        value: parsedValue,
                        last_updated_by: req.admin?.id || null,
                        updated_at: new Date()
                    });
                    req.setFlash("success", `Counter "${key}" updated successfully`);
                } else {
                    await Counter.create({
                        token: randomstring(64),
                        key,
                        value: parsedValue,
                        display_name: key.split('_').map(word =>
                            word.charAt(0).toUpperCase() + word.slice(1)
                        ).join(' '),
                        last_updated_by: req.admin?.token || null
                    });
                    req.setFlash("success", `Counter "${key}" created successfully`);
                }

                return res.redirect("/counter");
            }

        } catch (err) {
            console.error("SET COUNTER ERROR:", err);

            if (err.name === 'SequelizeUniqueConstraintError') {
                req.setFlash("error", "Counter with this key already exists");
            } else if (err.name === 'SequelizeValidationError') {
                const errors = err.errors.map(e => e.message).join(', ');
                req.setFlash("error", `Validation error: ${errors}`);
            } else {
                req.setFlash("error", err.message || "Failed to update counters");
            }

            return res.redirect("/counter");
        }
    },

    getCounterList: async (req, res) => {
        try {
            const counters = await Counter.findAll({
                order: [
                    ['category', 'ASC'],
                    ['position', 'ASC']
                ]
            });

            const formattedCounters = counters.reduce((acc, counter) => {
                acc[counter.key] = {
                    value: counter.value,
                    display_name: counter.display_name,
                    icon: counter.icon,
                    prefix: counter.prefix,
                    suffix: counter.suffix,
                    category: counter.category,
                    position: counter.position,
                    is_active: counter.is_active,
                    auto_update: counter.auto_update,
                    last_updated: counter.updated_at
                };
                return acc;
            }, {});

            const defaultCounters = {
                happy_customers: formattedCounters.happy_customers?.value || 0,
                verified_vendors: formattedCounters.verified_vendors?.value || 0,
                app_rating: formattedCounters.app_rating?.value || 0,
                total_cities: formattedCounters.total_cities?.value || 0,
                total_bookings: formattedCounters.total_bookings?.value || 0,
                active_users: formattedCounters.active_users?.value || 0,
                support_rating: formattedCounters.support_rating?.value || 0,
                app_downloads: formattedCounters.app_downloads?.value || 0,
                show_counters: formattedCounters.show_counters?.value == 1,
                auto_update: formattedCounters.auto_update?.value == 1
            };
            req.setFlash('success', 'Counter fetched successfully')
            return responseData_('Counter fetched successfully', defaultCounters, true)

        } catch (err) {
            console.error("GET COUNTER LIST ERROR:", err);
            req.setFlash('error', 'Counter not found')
            return responseData_('Counter fetched successfully', {
                happy_customers: 0,
                verified_vendors: 0,
                app_rating: 0,
                total_cities: 0,
                total_bookings: 0,
                active_users: 0,
                support_rating: 0,
                app_downloads: 0,
                show_counters: true,
                auto_update: false
            }, true)
        }
    },

    deleteCounter: async (req, res) => {
        try {
            const { token } = req.params;

            if (!token) {
                req.setFlash("error", "Counter token is required");
                return res.redirect("/counter");
            }

            const counter = await Counter.findOne({
                where: { token }
            });

            if (!counter) {
                req.setFlash("error", "Counter not found");
                return res.redirect("/counter");
            }

            if (counter.category === 'system') {
                req.setFlash("error", "System counters cannot be deleted");
                return res.redirect("/counter");
            }

            await counter.destroy();

            req.setFlash("success", "Counter deleted successfully");
            return res.redirect("/counter");

        } catch (err) {
            console.error("DELETE COUNTER ERROR:", err);
            req.setFlash("error", err.message || "Failed to delete counter");
            return res.redirect("/counter");
        }
    },

    toggleCounterStatus: async (req, res) => {
        try {
            const { token } = req.params;

            if (!token) {
                req.setFlash("error", "Counter ID is required");
                return res.redirect("/counter");
            }

            const counter = await Counter.findOne({
                where: { token }
            });

            if (!counter) {
                req.setFlash("error", "Counter not found");
                return res.redirect("/counter");
            }

            await counter.update({
                is_active: !counter.is_active,
                updated_at: new Date()
            });

            req.setFlash("success", `Counter ${counter.is_active ? 'enabled' : 'disabled'} successfully`);
            return res.redirect("/counter");

        } catch (err) {
            console.error("TOGGLE COUNTER ERROR:", err);
            req.setFlash("error", err.message || "Failed to toggle counter status");
            return res.redirect("/counter");
        }
    },

    //slider
    siteSliderCreate: async (req, res) => {
        try {
            const {
                position = [],
                isActive = [],
                token = [],
                title = [],
                subtitle = [],
                description = [],
                button_text = [],
                button_link = []
            } = req.body;

            // ✅ WITH .array(), req.files is already an array
            const files = Array.isArray(req.files) ? req.files : [];

            if (files.length === 0 && token.every(t => !t)) {
                req.setFlash("error", "No images provided");
                return res.redirect("/slider");
            }

            let fileIndex = 0;

            for (let i = 0; i < position.length; i++) {
                const currentToken = token[i];
                const pos = Number(position[i]) || i + 1;

                // pick file only when one exists
                const currentFile = files[fileIndex] || null;
                if (currentFile) fileIndex++;

                if (currentToken) {
                    // ===== UPDATE EXISTING SLIDE =====
                    const existingSlider = await SiteSlider.findOne({
                        where: { token: currentToken }
                    });

                    if (!existingSlider) continue;

                    // delete old image if replaced
                    if (currentFile && existingSlider.image) {
                        const oldPath = path.join(
                            __dirname,
                            "../public",
                            existingSlider.image
                        );

                        if (fs.existsSync(oldPath)) {
                            try {
                                await fs.promises.unlink(oldPath);
                            } catch (err) {
                                console.warn("Old image delete failed:", oldPath);
                            }
                        }
                    }

                    await existingSlider.update({
                        image: currentFile
                            ? `/uploads/${currentFile.filename}`
                            : existingSlider.image,
                        title: title[i] || existingSlider.title,
                        subtitle: subtitle[i] || existingSlider.subtitle,
                        description: description[i] || existingSlider.description,
                        button_text: button_text[i] || existingSlider.button_text,
                        button_link: button_link[i] || existingSlider.button_link,
                        position: pos,
                        is_active: Number(isActive[i]) === 1 ? 1 : 0,
                        updated_at: new Date()
                    });

                } else if (currentFile) {
                    // ===== CREATE NEW SLIDE =====
                    const newToken = randomstring(64);

                    await SiteSlider.create({
                        token: newToken,
                        image: `/uploads/${currentFile.filename}`,
                        title: title[i] || null,
                        subtitle: subtitle[i] || null,
                        description: description[i] || null,
                        button_text: button_text[i] || null,
                        button_link: button_link[i] || null,
                        position: pos,
                        is_active: Number(isActive[i]) === 1 ? 1 : 0,
                        created_at: new Date(),
                        updated_at: new Date()
                    });
                }
            }

            req.setFlash("success", "Slider saved successfully");
            return res.redirect("/slider");

        } catch (err) {
            console.error("Site slider save error:", err);
            req.setFlash("error", "Internal server error");
            return res.redirect("/slider");
        }
    },

    siteSliderList: async (req, res) => {
        try {
            const result = await SiteSlider.findAll({
                attributes: [
                    'title',
                    'subtitle',
                    'description',
                    'button_text',
                    'button_link',
                    [
                        Sequelize.literal(`CONCAT('${admin_url}', image)`),
                        'image'
                    ],
                    'position',
                    'token',
                    'is_active',
                    'created_at',
                    'id'
                ],
                where: {
                    image: {
                        [Sequelize.Op.ne]: null
                    }
                },
                order: [['position', 'ASC']]
            });

            return responseData_('Images fetched success', result, true)

        } catch (error) {
            console.error('Slider list error:', error);
            return responseData_('Error fetching images', {}, false)
        }
    },

    siteSliderToggleStatus: async (req, res) => {
        try {
            const slider = await SiteSlider.findOne({
                where: { token: req.params.token }
            });

            if (!slider) {
                req.setFlash('error', 'Slider not found');
                return res.redirect('/slider');
            }

            await SiteSlider.update(
                { is_active: !slider.is_active },
                { where: { token: slider.token } }
            );

            req.setFlash('success', 'Slider status updated');
            return res.redirect('/slider');

        } catch (err) {
            console.error('Slider status error:', err);
            req.setFlash('error', 'Error updating slider status');
            return res.redirect('/slider');
        }
    },

    siteSliderReorder: async (req, res) => {
        try {
            const { order } = req.body;
            // order = [{ token, position }]

            for (const item of order) {
                await SiteSlider.update(
                    { position: item.position },
                    { where: { token: item.token } }
                );
            }

            return res.status(200).json({
                success: true,
                message: 'Slider order updated'
            });

        } catch (err) {
            console.error(err);
            return res.status(500).json({
                success: false,
                message: 'Error reordering slider'
            });
        }
    },

    siteSliderUpdate: async (req, res) => {
        try {
            const { token } = req.params;
            const body = req.body || {};
            const file = req.file;

            const slider = await SiteSlider.findOne({ where: { token } });
            if (!slider) {
                req.setFlash('error', 'Slider not found');
                return res.redirect('/slider');
            }

            const updateData = {};

            if (file) {
                if (slider.image) {
                    const oldPath = path.join(__dirname, '../public', slider.image);
                    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
                }
                updateData.image = `/uploads/${file.filename}`;
            }

            if ('title' in body) updateData.title = body.title || null;
            if ('subtitle' in body) updateData.subtitle = body.subtitle || null;
            if ('description' in body) updateData.description = body.description || null;
            if ('button_text' in body) updateData.button_text = body.button_text || null;
            if ('button_link' in body) updateData.button_link = body.button_link || null;

            if (!Object.keys(updateData).length) {
                req.setFlash('error', 'No data to update');
                return res.redirect('/slider');
            }

            await slider.update(updateData);

            req.setFlash('success', 'Slider updated successfully');
            return res.redirect('/slider');

        } catch (err) {
            console.error('Slider update error:', err);
            req.setFlash('error', 'Internal server error');
            return res.redirect('/slider');
        }
    },

    siteSliderEnableAll: async (req, res) => {
        try {
            await SiteSlider.update(
                { is_active: 1 },
                { where: {} }
            );
            req.setFlash('success', 'All sliders enabled');
            return res.redirect('/slider');
        } catch (err) {
            console.error('Enable all sliders error:', err);
            req.setFlash('error', 'Error enabling all sliders');
            return res.redirect('/slider');
        }
    },

    siteSliderDisableAll: async (req, res) => {
        try {
            await SiteSlider.update(
                { is_active: 0 },
                { where: {} }
            );
            req.setFlash('success', 'All sliders disabled');
            return res.redirect('/slider');
        } catch (err) {
            console.error('Disable all sliders error:', err);
            req.setFlash('error', 'Error disabling all sliders');
            return res.redirect('/slider');
        }
    },

    siteSliderClearAll: async (req, res) => {
        try {
            const sliders = await SiteSlider.findAll();

            for (const slider of sliders) {
                if (slider.image) {
                    // Build path relative to your project root 'public' folder
                    const filePath = path.join(process.cwd(), 'public', slider.image);

                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                }

                await slider.destroy();
            }

            req.setFlash('success', 'All sliders cleared');
            return res.redirect('/slider');
        } catch (err) {
            console.error('Clear all sliders error:', err);
            req.setFlash('error', 'Error clearing all sliders');
            return res.redirect('/slider');
        }
    },

    bookingSliderList: async (req, res) => {
        try {
            const result = await BookingSlider.findAll({
                attributes: [
                    'title',
                    'subtitle',
                    'description',
                    'button_text',
                    'button_link',
                    [
                        Sequelize.literal(`CONCAT('${admin_url}', image)`),
                        'image'
                    ],
                    'position',
                    'token',
                    'is_active',
                    'created_at',
                    'id'
                ],
                where: {
                    image: {
                        [Sequelize.Op.ne]: null
                    }
                },
                order: [['position', 'ASC']]
            });

            return responseData_('Images fetched success', result, true)

        } catch (error) {
            console.error('Slider list error:', error);
            return responseData_('Error fetching images', {}, false)
        }
    },

    bookingSliderCreate: async (req, res) => {
        try {
            const {
                position = [],
                isActive = [],
                token = [],
                title = [],
                subtitle = [],
                description = [],
                button_text = [],
                button_link = []
            } = req.body;

            const files = Array.isArray(req.files) ? req.files : [];

            if (files.length === 0 && token.every(t => !t)) {
                req.setFlash('error', 'No images provided');
                return res.redirect('/booking-slider');
            }

            let fileIndex = 0;
            let maxPosition = (await BookingSlider.max('position')) || 0;
            const results = [];

            for (let i = 0; i < position.length; i++) {
                const currentToken = token[i];
                const pos = Number(position[i]) || i + 1;

                // ✅ Pick file only if user selected one
                const currentFile = files[fileIndex] || null;
                if (currentFile) fileIndex++;

                if (currentToken) {
                    // ===== UPDATE EXISTING SLIDE =====
                    const existingSlider = await BookingSlider.findOne({
                        where: { token: currentToken }
                    });

                    if (!existingSlider) continue;

                    // Delete old image if replaced
                    if (currentFile && existingSlider.image) {
                        const oldPath = path.join(__dirname, '../public', existingSlider.image);
                        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
                    }

                    await existingSlider.update({
                        image: currentFile ? `/uploads/${currentFile.filename}` : existingSlider.image,
                        title: title[i] || existingSlider.title,
                        subtitle: subtitle[i] || existingSlider.subtitle,
                        description: description[i] || existingSlider.description,
                        button_text: button_text[i] || existingSlider.button_text,
                        button_link: button_link[i] || existingSlider.button_link,
                        position: pos,
                        is_active: Number(isActive[i]) === 1 ? 1 : 0,
                        updated_at: new Date()
                    });

                    results.push({
                        token: existingSlider.token,
                        action: currentFile ? 'updated' : 'text_updated'
                    });

                } else if (currentFile) {
                    // ===== CREATE NEW SLIDE =====
                    const newToken = randomstring(64);

                    await BookingSlider.create({
                        token: newToken,
                        image: `/uploads/${currentFile.filename}`,
                        title: title[i] || null,
                        subtitle: subtitle[i] || null,
                        description: description[i] || null,
                        button_text: button_text[i] || null,
                        button_link: button_link[i] || null,
                        position: pos,
                        is_active: Number(isActive[i]) === 1 ? 1 : 0,
                        created_at: new Date(),
                        updated_at: new Date()
                    });

                    results.push({ token: newToken, action: 'created' });
                    maxPosition = Math.max(maxPosition, pos);
                }
            }

            req.setFlash('success', 'Slider saved successfully');
            return res.redirect('/booking-slider');

        } catch (err) {
            console.error('Site slider save error:', err);
            req.setFlash('error', 'Internal server error');
            return res.redirect('/booking-slider');
        }
    },

    bookingSliderToggleStatus: async (req, res) => {
        try {
            const slider = await BookingSlider.findOne({
                where: { token: req.params.token }
            });

            if (!slider) {
                req.setFlash('error', 'Slider not found');
                return res.redirect('/booking-slider');
            }

            await BookingSlider.update(
                { is_active: !slider.is_active },
                { where: { token: slider.token } }
            );

            req.setFlash('success', 'Slider status updated');
            return res.redirect('/booking-slider');

        } catch (err) {
            console.error('Slider status error:', err);
            req.setFlash('error', 'Error updating slider status');
            return res.redirect('/booking-slider');
        }
    },

    bookingSliderReorder: async (req, res) => {
        try {
            const { order } = req.body;

            for (const item of order) {
                await BookingSlider.update(
                    { position: item.position },
                    { where: { token: item.token } }
                );
            }

            req.setFlash('success', 'Slider order updated');
            return res.redirect('/booking-slider');

        } catch (err) {
            console.error(err);
            req.setFlash('error', 'Error reordering slider');
            return res.redirect('/booking-slider');
        }
    },

    bookingSliderUpdate: async (req, res) => {
        try {
            const { token } = req.params;
            const body = req.body || {};
            const file = req.file;

            const slider = await BookingSlider.findOne({ where: { token } });
            if (!slider) {
                req.setFlash('error', 'Slider not found');
                return res.redirect('/booking-slider');
            }

            const updateData = {};

            if (file) {
                if (slider.image) {
                    const oldPath = path.join(__dirname, '../public', slider.image);
                    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
                }
                updateData.image = `/uploads/${file.filename}`;
            }

            if ('title' in body) updateData.title = body.title || null;
            if ('subtitle' in body) updateData.subtitle = body.subtitle || null;
            if ('description' in body) updateData.description = body.description || null;
            if ('button_text' in body) updateData.button_text = body.button_text || null;
            if ('button_link' in body) updateData.button_link = body.button_link || null;

            if (!Object.keys(updateData).length) {
                req.setFlash('error', 'No data to update');
                return res.redirect('/booking-slider');
            }

            await slider.update(updateData);

            req.setFlash('success', 'Slider updated successfully');
            return res.redirect('/booking-slider');

        } catch (err) {
            console.error('Slider update error:', err);
            req.setFlash('error', 'Internal server error');
            return res.redirect('/booking-slider');
        }
    },

    bookingSliderEnableAll: async (req, res) => {
        try {
            await BookingSlider.update(
                { is_active: 1 },
                { where: {} }
            );
            req.setFlash('success', 'All sliders enabled');
            return res.redirect('/booking-slider');
        } catch (err) {
            console.error('Enable all sliders error:', err);
            req.setFlash('error', 'Error enabling all sliders');
            return res.redirect('/booking-slider');
        }
    },

    bookingSliderDisableAll: async (req, res) => {
        try {
            await BookingSlider.update(
                { is_active: 0 },
                { where: {} }
            );
            req.setFlash('success', 'All sliders disabled');
            return res.redirect('/booking-slider');
        } catch (err) {
            console.error('Disable all sliders error:', err);
            req.setFlash('error', 'Error disabling all sliders');
            return res.redirect('/booking-slider');
        }
    },

    bookingSliderClearAll: async (req, res) => {
        try {
            const sliders = await BookingSlider.findAll();

            for (const slider of sliders) {
                if (slider.image) {
                    // Build path relative to your project root 'public' folder
                    const filePath = path.join(process.cwd(), 'public', slider.image);

                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                }

                await slider.destroy();
            }

            req.setFlash('success', 'All sliders cleared');
            return res.redirect('/booking-slider');
        } catch (err) {
            console.error('Clear all sliders error:', err);
            req.setFlash('error', 'Error clearing all sliders');
            return res.redirect('/booking-slider');
        }
    },
    // videos
    createVideo: async (req, res) => {
        try {
            const {
                source_type,
                video_url,
                title,
                description,
                category
            } = req.body;

            let finalVideoUrl = null;
            let thumbnail = null;

            if (source_type === "youtube") {
                if (!video_url) {
                    req.setFlash("error", "Video URL is required");
                    return res.redirect("/videos");
                }

                if (!req.files?.thumbnail) {
                    req.setFlash("error", "Video thumbnail is required");
                    return res.redirect("/videos");
                }

                finalVideoUrl = video_url;
                thumbnail = `/uploads/${req.files.thumbnail[0].filename}`;
            }

            if (source_type === "upload") {
                if (!req.files?.video_file) {
                    req.setFlash("error", "Video file is required");
                    return res.redirect("/videos");
                }

                if (!req.files?.thumbnail) {
                    req.setFlash("error", "Video thumbnail is required");
                    return res.redirect("/videos");
                }

                finalVideoUrl = `/uploads/${req.files.video_file[0].filename}`;
                thumbnail = `/uploads/${req.files.thumbnail[0].filename}`;
            }

            await Video.create({
                token: randomstring(64),
                source_type: source_type.toUpperCase(),
                video_url: finalVideoUrl,
                thumbnail,
                title,
                description,
                category,
                status: true
            });

            req.setFlash("success", "Video creation success");
            return res.redirect("/videos");

        } catch (err) {
            console.error("CREATE VIDEO ERROR:", err);
            req.setFlash("error", err.message);
            return res.redirect("/videos");
        }
    },

    // updateVideo: async (req, res) => {
    //     try {
    //         const id = req.params.id;
    //         await Video.update(req.body, { where: { id } });
    //         res.json({ success: true });
    //     } catch (err) {
    //         res.status(500).json({ success: false, message: err.message });
    //     }
    // },

    removeVideo: async (req, res) => {
        try {
            const video = await Video.findOne(req.params.token);
            if (!video) {
                return res.status(404).json(responseData_("Video not found", {}, req, false));
            }

            if (video.source_type === "UPLOAD" && video.video_url) {
                const filePath = path.join(__dirname, "../public", video.video_url);
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            }

            await video.destroy();

            res.status(200).json(responseData_("Video deleted successfully", {}, true));

        } catch (err) {
            res.status(500).json(responseData_('Internal server error', {}, false));
        }
    },

    listVideo: async (req, res) => {
        try {
            const page = Number(req.query.page) || 1;
            const limit = Number(req.query.limit) || 10;

            const filters = {
                flag: 0
            };

            console.log('re -....', req.query.category)

            if (req.query.status) {
                if (req.query.status === 'inactive') {
                    filters.status = false;
                } else if (req.query.status === 'active') {
                    filters.status = true;
                }
            }

            if (req.query.category) {
                filters.category = req.query.category;
            }

            if (req.query.source_type) {
                filters.source_type = req.query.source_type.toUpperCase();
            }
            if (req.query.search) {
                filters[Op.or] = [
                    { title: { [Op.like]: `%${req.query.search}%` } },
                    { description: { [Op.like]: `%${req.query.search}%` } }
                ];
            }

            const result = await getSequelizePagination({
                model: Video,
                page,
                limit,
                where: filters,
                attributes: [
                    'id',
                    'token',
                    'source_type',
                    [
                        Sequelize.literal(`
                        CASE 
                            WHEN thumbnail IS NOT NULL 
                            THEN CONCAT('${admin_url}', thumbnail) 
                            ELSE NULL 
                        END
                    `),
                        'thumbnail'
                    ],
                    'title',
                    'description',
                    'category',
                    'status',
                    'created_at'
                ],
                order: [['created_at', 'DESC']]
            });

            const baseWhere = { flag: 0 };

            const [
                totalCount,
                activeCount,
                inactiveCount
            ] = await Promise.all([
                Video.count({ where: baseWhere }),
                Video.count({ where: { ...baseWhere, status: true } }),
                Video.count({ where: { ...baseWhere, status: false } })
            ]);

            return responseData_(
                'Videos fetched successfully',
                {
                    ...result,
                    statusCounts: {
                        total: totalCount,
                        active: activeCount,
                        inactive: inactiveCount
                    }
                },
                true
            );

        } catch (err) {
            console.error('get video error : ', err);
            return responseData_('Internal server error', {}, false);
        }
    },

    toggleStatusVideo: async (req, res) => {
        try {
            const { token, status } = req.body
            const video = await Video.findOne({
                where: { token }
            });
            if (!video) {
                req.setFlash('error', 'Video not found')
                res.redirect('/videos')
            }

            await Video.update(
                { status: status === 'true' ? 0 : 1 },
                { where: { token } }
            );

            req.setFlash('success', 'Video unpublished successfully')
            res.redirect('/videos')

        } catch (err) {
            console.log(err)
            req.setFlash('error', 'Internal server error')
            res.redirect('/videos')
        }
    },

    streamVideo: async (req, res) => {
        try {
            const video = await Video.findOne({
                where: { token: req.params.token, status: true },
                attributes: ['video_url']
            });

            if (!video) return res.status(404).end();

            const videoUrl = `${admin_url}${video.video_url}`;

            const axiosRes = await axios.get(videoUrl, {
                responseType: 'stream',
                headers: {
                    Range: req.headers.range || undefined
                }
            });

            res.status(axiosRes.status);

            res.set({
                'Content-Type': axiosRes.headers['content-type'],
                'Content-Length': axiosRes.headers['content-length'],
                'Accept-Ranges': axiosRes.headers['accept-ranges'],
                'Content-Range': axiosRes.headers['content-range'],
                'Cache-Control': axiosRes.headers['cache-control']
            });

            axiosRes.data.pipe(res);

        } catch (err) {
            console.error('Video proxy stream error:', err.message);
            res.status(500).end();
        }
    },

    // services
    getAllServices: async (query) => {
        try {
            const page = parseInt(query.page) || 1;
            const limit = parseInt(query.limit) || 12;
            const offset = (page - 1) * limit;

            let whereCondition = {};
            if (query.search) {
                whereCondition[Op.or] = [
                    { name: { [Op.regexp]: query.search } },
                    { code: { [Op.regexp]: query.search } }
                ];
            }
            if (query.status && ['active', 'inactive'].includes(query.status)) {
                whereCondition.status = query.status;
            }

            const { count, rows } = await Service.findAndCountAll({
                where: whereCondition,
                order: [['create_date', 'DESC']],
                limit: limit,
                offset: offset
            });

            return responseData_(
                'Services fetched successfully',
                {
                    docs: rows,
                    totalItems: count,
                    totalPages: Math.ceil(count / limit),
                    currentPage: page,
                    limit: limit
                },
                true
            );

        } catch (error) {
            console.error('Get All Services Error:', error);
            return responseData_('Internal server error', { error: error.message }, false);
        }
    },

    addService: async (req, res) => {
        try {
            const {
                token,
                name,
                description
            } = req.body;

            const code = codeGenerator(name)

            const duplicateWhere = {
                [Op.or]: [
                    { name },
                    { code: code }
                ]
            };

            if (token) {
                duplicateWhere.token = { [Op.ne]: token };
            }

            const existingService = await Service.findOne({
                where: duplicateWhere
            });

            if (existingService) {
                return res.status(409).json(responseData_('Service name or code already exists', {}, false));
            }

            if (token) {
                await Service.update(
                    {
                        name,
                        code: code,
                        description
                    },
                    {
                        where: { token }
                    }
                );

                req.setFlash('success', 'Service is updated successfully')
                return res.redirect('/services')
            }

            await Service.create({
                token: randomstring(64),
                name,
                code: code,
                description,
                status: 'active'
            });

            req.setFlash('success', "Service added successfully")
            return res.redirect('/services')

        } catch (error) {
            console.error('Add Service Error:', error);
            req.setFlash('error', 'Service not added')
            return res.redirect('/services')
        }
    },

    toggleServiceStatus: async (req, res) => {
        try {
            const { token } = req.params;
            const service = await Service.findOne({ where: { token } });
            if (!service) {
                req.setFlash('error', 'Service not found');
                return res.redirect('back');
            }
            const newStatus = service.status === 'active' ? 'inactive' : 'active';
            await service.update({ status: newStatus });
            req.setFlash('success', `Service marked as ${newStatus}`);
            return res.redirect('/services');
        } catch (error) {
            console.error('Toggle Status Error:', error);
            req.setFlash('error', 'Failed to update status');
            return res.redirect('/services');
        }
    },

    // reviews
    reviewCreate: async (req, res) => {
        try {
            const {
                name,
                rating,
                comment,
                review_by,
                review_for,
            } = req.body;

            const parsedRating = parseInt(rating);

            if (isNaN(parsedRating) || parsedRating < 1 || parsedRating > 5) {
                req.setFlash('error', 'Rating must be between 1 and 5');
                return res.redirect('/feedback');
            }

            if (!comment || comment.trim().length < 5) {
                req.setFlash('error', 'Review comment must be at least 5 characters long');
                return res.redirect('/feedback');
            }

            const reviewPayload = {
                token: randomstring(64),
                review_by,
                review_for,
                reviewer_token: randomstring(64),
                reviewer_name: name,
                reviewer_email: null,
                reviewer_avatar: null,
                rating: parsedRating,
                comment: comment.trim(),
                status: 'APPROVED',
                is_active: true,
                created_at: new Date(),
                updated_at: new Date()
            };

            await Review.create(reviewPayload);

            req.setFlash('success', 'Review added successfully');
            return res.redirect('/feedback');

        } catch (err) {
            console.error('REVIEW CREATE ERROR:', err);

            if (err.name === 'SequelizeValidationError') {
                const errors = err.errors.map(e => e.message).join(', ');
                req.setFlash('error', `Validation error: ${errors}`);
            } else {
                req.setFlash('error', err.message || 'Failed to create review');
            }

            return res.redirect('/feedback');
        }
    },

    getReviews: async (query = {}) => {
        try {
            const {
                customer_page = 1,
                vendor_page = 1,
                limit = 10,

                customer_status,
                customer_rating,
                customer_search,

                vendor_status,
                vendor_rating,
                vendor_search
            } = query;

            const customerWhere = {
                review_by: 'CUSTOMER'
            };

            if (customer_status && customer_status !== 'all') {
                customerWhere.status = customer_status.toUpperCase();
            }

            if (customer_rating && customer_rating !== 'all') {
                customerWhere.rating = Number(customer_rating);
            }

            if (customer_search) {
                customerWhere[Op.or] = [
                    { reviewer_name: { [Op.like]: `%${customer_search}%` } },
                    { reviewer_email: { [Op.like]: `%${customer_search}%` } },
                    { vendor_name: { [Op.like]: `%${customer_search}%` } },
                    { comment: { [Op.like]: `%${customer_search}%` } }
                ];
            }

            const customerReviews = await getSequelizePagination({
                model: Review,
                page: customer_page,
                limit,
                where: customerWhere,
                order: [['created_at', 'DESC']]
            });

            const vendorWhere = {
                review_by: 'VENDOR'
            };

            if (vendor_status && vendor_status !== 'all') {
                vendorWhere.status = vendor_status
            }

            if (vendor_rating && vendor_rating !== 'all') {
                vendorWhere.rating = Number(vendor_rating);
            }

            if (vendor_search) {
                vendorWhere[Op.or] = [
                    { vendor_name: { [Op.like]: `%${vendor_search}%` } },
                    { vendor_email: { [Op.like]: `%${vendor_search}%` } },
                    { comment: { [Op.like]: `%${vendor_search}%` } }
                ];
            }

            const vendorReviews = await getSequelizePagination({
                model: Review,
                page: vendor_page,
                limit,
                where: vendorWhere,
                order: [['created_at', 'DESC']]
            });

            const statsWhere = {};

            const [
                totalCustomerReviews,
                totalVendorReviews,
                pendingReviews,
                averageRatingResult
            ] = await Promise.all([

                Review.count({
                    where: { review_by: 'CUSTOMER' }
                }),

                Review.count({
                    where: { review_by: 'VENDOR' }
                }),

                Review.count({
                    where: { status: 'PENDING' }
                }),

                Review.findOne({
                    attributes: [
                        [Sequelize.fn('AVG', Sequelize.col('rating')), 'avg_rating']
                    ],
                    raw: true
                })
            ]);

            const stats = {
                total_customer_reviews: totalCustomerReviews,
                total_vendor_reviews: totalVendorReviews,
                pending_reviews: pendingReviews,
                average_rating: Number(averageRatingResult?.avg_rating || 0).toFixed(1)
            };

            return responseData_(
                'Reviews fetched successfully',
                {
                    customer: customerReviews,
                    vendor: vendorReviews,
                    stats,
                    filters: query
                },
                true
            );

        } catch (error) {
            console.error('GET REVIEWS SERVICE ERROR:', error);

            return responseData_(
                error.message || 'Failed to fetch reviews',
                {},
                false
            );
        }
    },

    getFaqs: async (req) => {
        try {
            const page = req.query.page || 1;

            const result = await getSequelizePagination({
                model: Faq,
                page,
                limit: 10,
                order: [['id', 'DESC']],
                attributes: ['id', 'question', 'answer', 'status', 'created_at', 'token']
            });

            return responseData_(
                'Faq fetched successfully',
                result,
                true
            );

        } catch (error) {
            console.log('Get faqs error ', error);
            return responseData_('Internal server error', {}, false);
        }
    },

    addFaq: async (req, res) => {
        try {
            const {
                question,
                answer,
                status = 'active',
                position = 0
            } = req.body;

            await Faq.create({
                token: randomstring(64),
                question,
                answer,
                status,
                position
            });

            req.setFlash('success', 'FAQ added successfully');
            return res.redirect('/faqs');

        } catch (error) {
            console.error('Add FAQ error:', error);
            req.setFlash('error', 'Internal server error');
            return res.redirect('back');
        }
    },

    editFaqPage: async (req, res) => {
        try {
            const admin = req?.session?.user;
            const { token } = req.params;

            const faq = await Faq.findOne({ where: { token } });

            if (!faq) {
                req.setFlash('error', 'FAQ not found');
                return res.redirect('/faqs');
            }

            res.render('app_management/edit_faq', {
                title: 'Edit FAQ',
                admin,
                faq,
                currentPage: 'faqs'
            });

        } catch (error) {
            console.error('Edit FAQ page error:', error);
            req.setFlash('error', 'Server error');
            return res.redirect('/faqs');
        }
    },

    updateFaq: async (req, res) => {
        try {
            const { token } = req.params;

            const position = Number.isInteger(Number(req.body.position))
                ? Number(req.body.position)
                : 0;

            const updated = await Faq.update(
                {
                    question: req.body.question,
                    answer: req.body.answer,
                    status: req.body.status,
                    position
                },
                { where: { token } }
            );

            if (!updated[0]) {
                req.setFlash('error', 'FAQ not updated');
                return res.redirect('/faqs');
            }

            req.setFlash('success', 'FAQ updated successfully');
            return res.redirect('/faqs');

        } catch (error) {
            console.error('Update FAQ error:', error);
            req.setFlash('error', 'Server error');
            return res.redirect('back');
        }
    },

    deleteFaq: async (req, res) => {
        try {
            const { token } = req.params;

            const deleted = await Faq.destroy({
                where: { token }
            });

            if (!deleted) {
                req.setFlash('error', 'FAQ not found');
                return res.redirect('/faqs');
            }

            req.setFlash('success', 'FAQ deleted successfully');
            return res.redirect('/faqs');

        } catch (error) {
            console.error('Delete FAQ error:', error);
            req.setFlash('error', 'Server error');
            return res.redirect('/faqs');
        }
    },

    getAboutData: async () => {
        try {
            const result = await About.findOne()
            return responseData_("About data fetched", result, true)
        } catch (error) {
            console.log('Getting about error : ', error)
            return responseData_('Internal sever error', {}, false)
        }
    },

    updateAbout: async (req, res) => {
        try {
            const { heading, title, description, status } = req.body;

            let about = await About.findOne();

            const image = req.file
                ? `/uploads/${req.file.filename}`
                : about?.image;

            if (!about) {
                about = await About.create({
                    token: randomstring(64),
                    heading,
                    title,
                    description,
                    status,
                    image
                });
            } else {
                await about.update({
                    heading,
                    title,
                    description,
                    status,
                    image
                });
            }
            req.setFlash('success', about ? 'About section updated' : 'About section created')
            return res.redirect('/about')
        } catch (error) {
            console.error('Update about error:', error);
            req.setFlash('error', 'Internal server error')
            return res.redirect('/about')
        }
    },

    getHelpData: async (page) => {
        try {
            const result = await getSequelizePagination({
                model: VendorHelp,
                page,
                limit: 10,
                order: [['id', 'DESC']],
                attributes: [
                    'id',
                    'token',
                    'title',
                    'description',
                    'category',
                    'status',
                    'create_date'
                ],
                include: [
                    {
                        model: VendorHelpAnswer,
                        as: 'help_answers',
                        required: false,
                        attributes: ['message', 'create_date'],
                        separate: true,              // 🔥 REQUIRED
                        limit: 1,
                        order: [['id', 'DESC']]
                    }
                ]
            });

            // console.log('result ->>>> ', result.docs)

            return responseData_(
                'Help fetched successfully',
                result,
                true
            );

        } catch (error) {
            console.log('Get help error ', error);
            return responseData_('Internal server error', {}, false);
        }
    },


    getHelpByToken: async (token) => {
        try {
            console.log('token _>>>> ', token);

            const help = await VendorHelp.findOne({
                where: { token },
                include: [{
                    model: VendorHelpAnswer,
                    as: 'help_answers',
                    required: false,
                    separate: true,
                    limit: 10,
                    order: [['id', 'DESC']],
                    attributes: ['id', 'token', 'help_token', 'message', 'create_date']
                }]
            });

            console.log('help >>>> ', JSON.stringify(help, null, 2));

            return responseData_('Help fetched', help, true);

        } catch (error) {
            console.log('Get help error ', error);
            return responseData_('Internal server error', {}, false);
        }
    },

    replyToHelp: async (req, res) => {
        try {
            console.log('parmas ->>>> ', req.params)
            const helpToken = req.params.token;
            const { message } = req.body;



            if (!message || message.trim() === '') {
                req.setFlash('error', 'Message is required')
                return res.redirect('/vendor/help')
            }

            const help = await VendorHelp.findOne({
                where: {
                    token: helpToken
                }
            });

            if (!help) {
                req.setFlash('error', 'Help not found')
                return res.redirect('/vendor/help')
            }

            await VendorHelpAnswer.create({
                token: randomstring(32),
                help_token: help.token,
                vendor_token: help.vendor_token,
                message: message
            });

            await VendorHelp.update(
                { status: 'ANSWERED' },
                { where: { token: helpToken } }
            );
            req.setFlash('success', 'Help replied successfully')
            return res.redirect('/vendor/help')
        } catch (error) {
            console.error('Reply help error:', error);
            req.setFlash('error', 'Internal server error')
            return res.redirect('/vendor/help')
        }
    },

    deleteHelp: async (req, res) => {
        try {
            const { token } = req.params;
            if (!token) {
                req.setFlash('Invalid help token', 'error')
                res.redirect(`/vendor/help/${token}`)
            }
            const help = await VendorHelp.findOne({ where: { token } });
            if (!help) {
                req.setFlash('Invalid help token', 'error')
                res.redirect(`/vendor/help/${token}`)
            }
            await VendorHelpAnswer.destroy({
                where: { help_token: token }
            });
            await VendorHelp.destroy({
                where: { token }
            });
            req.setFlash('Help deleted successfully', 'success')
            res.redirect('/vendor/help', 'success')
        } catch (error) {
            console.error('Delete help error:', error);
            req.setFlash('Internal server error', 'error')
            res.redirect(`/vendor/help/${req.params.token}`)
        }
    },

    getReferralPage: async (page = 1, limit) => {
        try {
            const offset = (page - 1) * limit;

            const [
                [settings],
                totalReferredVendors,
                activeReferrersCount,
                { rows: referralList, count: totalCount }
            ] = await Promise.all([

                ReferralSetting.findOrCreate({
                    where: { id: 1 },
                    defaults: { referrer_bonus: 500, referee_bonus: 100 }
                }),

                Vendor.count({
                    where: { referer_code_used: { [Op.ne]: null } }
                }),

                Vendor.count({
                    col: 'referer_code_used',
                    distinct: true
                }),

                ReferralHistory.findAndCountAll({
                    limit,
                    offset,
                    order: [['createdAt', 'DESC']],
                    include: [
                        {
                            model: Vendor,
                            as: 'Referrer',
                            attributes: ['id', 'first_name', 'last_name', 'contact', 'profile_image']
                        },
                        {
                            model: Vendor,
                            as: 'Referee',
                            attributes: ['id', 'first_name', 'last_name', 'contact', 'profile_image']
                        }
                    ]
                })
            ]);

            // console.log('history ->>>> ', referralList)

            return responseData_('Referral fetched success', {
                settings,
                stats: {
                    vendorReferrals: totalReferredVendors,
                    activeVendors: activeReferrersCount
                },
                history: referralList,
                pagination: {
                    page,
                    limit,
                    total: totalCount,
                    totalPages: Math.ceil(totalCount / limit)
                }
            }, true);

        } catch (error) {
            console.error('Error fetching referral page:', error);
            return responseData_('Internal server error', {}, false);
        }
    },

    getReferralDetailsPage: async (id) => {
        try {
            const referral = await ReferralHistory.findOne({
                where: {
                    id: Number(id)
                },
                include: [
                    {
                        model: Vendor,
                        as: 'Referrer',
                        required: false,
                        attributes: [
                            'id',
                            'token',
                            'first_name',
                            'last_name',
                            'contact',
                            'alt_contact',
                            'email',
                            'location',
                            'address',
                            'pincode',
                            'profile_image',
                            'country',
                            'city',
                            'state',
                            'about_me',
                            'status',
                            'verification_status',
                            'verification_percentage',
                            'ref_code',
                            'referer_code_used',
                            'create_date',
                            'update_date'
                        ]
                    },
                    {
                        model: Vendor,
                        as: 'Referee',
                        required: false,
                        attributes: [
                            'id',
                            'token',
                            'first_name',
                            'last_name',
                            'contact',
                            'alt_contact',
                            'email',
                            'location',
                            'address',
                            'pincode',
                            'profile_image',
                            'country',
                            'city',
                            'state',
                            'about_me',
                            'status',
                            'verification_status',
                            'verification_percentage',
                            'ref_code',
                            'referer_code_used',
                            'create_date',
                            'update_date'
                        ]
                    }
                ]
            });

            if (!referral) {
                return responseData_('Referral history not found', {}, false);
            }

            const allHistory = await ReferralHistory.findAll({
                where: {
                    referrer_id: referral.referrer_id
                },
                order: [['createdAt', 'DESC']],
                include: [
                    {
                        model: Vendor,
                        as: 'Referee',
                        required: false,
                        attributes: [
                            'id',
                            'first_name',
                            'last_name',
                            'contact',
                            'alt_contact',
                            'email',
                            'profile_image',
                            'city',
                            'state',
                            'location',
                            'address',
                            'pincode',
                            'status',
                            'verification_status',
                            'verification_percentage',
                            'create_date'
                        ]
                    }
                ]
            });

            const stats = {
                totalReferred: allHistory.length,
                totalReferrerAmount: allHistory.reduce(
                    (sum, item) => sum + Number(item.referrer_amount || 0),
                    0
                ),
                totalRefereeAmount: allHistory.reduce(
                    (sum, item) => sum + Number(item.referee_amount || 0),
                    0
                ),
                paidCount: allHistory.filter(item => item.status === 'PAID').length,
                pendingCount: allHistory.filter(item => item.status === 'PENDING').length
            };

            return responseData_(
                'Referral details fetched successfully',
                {
                    history: referral,
                    vendor: referral.Referrer,
                    referee: referral.Referee,
                    stats,
                    allHistory
                },
                true
            );

        } catch (error) {
            console.error('Error fetching referral details page:', error);
            return responseData_('Internal server error', {}, false);
        }
    },

    updateReferralSettings: async (req, res) => {
        try {
            const { referrer_bonus, referee_bonus } = req.body;
            const [setting] = await ReferralSetting.findOrCreate({ where: { id: 1 } });

            await setting.update({
                referrer_bonus: parseFloat(referrer_bonus),
                referee_bonus: parseFloat(referee_bonus)
            });

            req.setFlash('success', "Referral setting updated")
            return res.redirect('/vendor-referral');

        } catch (error) {
            console.error('Error updating settings:', error);
            req.flash('error', 'Internal Server Error while saving settings.');
            return res.redirect('/vendor-referral');
        }
    },

    getNotificationSettings: async () => {

        let settings = await SiteSetting.findOne({
            attributes: [
                'send_to_all_cities',
                'city_filter_enabled',
                'selected_cities',
                'notification_type',
                'instant_dispatch'
            ]
        });

        if (!settings) {
            settings = await SiteSetting.create({});
        }

        settings = settings.get({ plain: true });

        settings.selected_cities = settings.selected_cities
            ? JSON.parse(settings.selected_cities)
            : [];

        return settings;
    },

    toggleBookingNotification: async (req, res) => {
        try {

            let settings = await SiteSetting.findOne();

            if (!settings) {
                settings = await SiteSetting.create({});
            }

            // Checkboxes
            settings.send_to_all_cities = !!req.body.send_to_all_cities;
            settings.city_filter_enabled = !!req.body.city_filter_enabled;
            settings.instant_dispatch = !!req.body.instant_dispatch;

            // Dropdown
            settings.notification_type = req.body.notification_type;

            // Multiple select (city names)
            let selectedCities = req.body.selected_cities || [];

            if (!Array.isArray(selectedCities)) {
                selectedCities = [selectedCities];
            }

            selectedCities = selectedCities
                .map(city => city.trim())
                .filter(city => city.length > 0);

            settings.selected_cities = JSON.stringify(selectedCities);

            await settings.save();

            req.setFlash('success', 'Notification settings updated successfully');
            return res.redirect('/manage-notifications');

        } catch (error) {
            console.error(error);
            req.setFlash('error', 'Notification update failed');
            return res.redirect('/manage-notifications');
        }
    },

    getAllHotelEnquiries: async (req, res) => {
        try {
            const hotelEnquiries = await HotelEnquiry.findAll({
                where: {
                    flag: 0
                },
                attributes: [
                    'id',
                    'token',
                    'vendor_token',
                    'area',
                    'check_in',
                    'check_out',
                    'rooms',
                    'status',
                    'create_date',
                    [sequelize.literal(`(
                    SELECT CONCAT(v.first_name, ' ', v.last_name) 
                    FROM tbl_vendor v 
                    WHERE v.token = HotelEnquiry.vendor_token
                )`), 'vendor_name'],
                    [sequelize.literal(`(
                    SELECT v.profile_image 
                    FROM tbl_vendor v 
                    WHERE v.token = HotelEnquiry.vendor_token
                )`), 'vendor_profile_image'],
                    [sequelize.literal(`(
                    SELECT 
                        CASE 
                            WHEN v.profile_image IS NOT NULL AND v.profile_image != '' 
                            THEN CONCAT('${admin_url}/', v.profile_image) 
                            ELSE CONCAT('${admin_url}/assets/img/profiles/avatar-02.jpg') 
                        END
                    FROM tbl_vendor v 
                    WHERE v.token = HotelEnquiry.vendor_token
                )`), 'vendor_profile_image_url']
                ],
                order: [['create_date', 'DESC']]
            });

            const formattedEnquiries = hotelEnquiries.map(enquiry => ({
                id: enquiry.id,
                token: enquiry.token,
                vendor_token: enquiry.vendor_token,
                area: enquiry.area,
                checkInDate: enquiry.check_in ? new Date(enquiry.check_in).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                }) : 'N/A',
                checkOutDate: enquiry.check_out ? new Date(enquiry.check_out).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                }) : 'N/A',
                rooms: enquiry.rooms,
                status: enquiry.status,
                createdDate: enquiry.create_date ? new Date(enquiry.create_date).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                }) : 'N/A',
                vendor: {
                    name: enquiry.dataValues.vendor_name || 'N/A',
                    profileImage: enquiry.dataValues.vendor_profile_image,
                    profileImageUrl: enquiry.dataValues.vendor_profile_image_url
                }
            }));

            return responseData_('Fetched hotel enquiries', formattedEnquiries, true);

        } catch (error) {
            console.error('Error fetching hotel enquiries:', error);
            return responseData_('Internal server error', { error: error.message }, false);
        }
    },

    getAllPaymentsPage: async (req) => {
        try {
            const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
            const pageSize = Math.max(parseInt(req.query.size, 10) || 10, 1);
            const offset = (page - 1) * pageSize;
            const sort = req.query.sort || 'newest';

            const { whereClause, replacements, resolvedFrom, resolvedTo } = buildPaymentLedgerWhere(req.query);
            const baseSubquery = getLedgerBaseSubquery();
            const orderClause = buildOrderClause(sort);

            const ledgerSql = `
                SELECT ledger.*
                FROM ${baseSubquery}
                ${whereClause}
                ${orderClause}
                LIMIT :limit OFFSET :offset
            `;

            const totalCountSql = `
                SELECT COUNT(*) AS totalCount
                FROM ${baseSubquery}
                ${whereClause}
            `;

            const summarySql = `
                SELECT
                    COUNT(*) AS totalCount,
                    COALESCE(SUM(ABS(ledger.amount)), 0) AS totalAmount,
                    COALESCE(SUM(
                        CASE
                            WHEN MONTH(ledger.created_at) = MONTH(CURDATE())
                             AND YEAR(ledger.created_at) = YEAR(CURDATE())
                            THEN ABS(ledger.amount)
                            ELSE 0
                        END
                    ), 0) AS monthlyAmount,
                    COALESCE(SUM(CASE WHEN ledger.status = 'pending' THEN ABS(ledger.amount) ELSE 0 END), 0) AS pendingAmount,
                    COALESCE(SUM(CASE WHEN ledger.status = 'refunded' THEN ABS(ledger.amount) ELSE 0 END), 0) AS refundAmount,
                    COALESCE(SUM(
                        CASE
                            WHEN MONTH(ledger.created_at) = MONTH(CURDATE())
                             AND YEAR(ledger.created_at) = YEAR(CURDATE())
                            THEN 1 ELSE 0
                        END
                    ), 0) AS monthlyCount,
                    COALESCE(SUM(CASE WHEN ledger.status = 'pending' THEN 1 ELSE 0 END), 0) AS pendingCount,
                    COALESCE(SUM(CASE WHEN ledger.status = 'refunded' THEN 1 ELSE 0 END), 0) AS refundCount
                FROM ${baseSubquery}
                ${whereClause}
            `;

            const analyticsSql = `
                SELECT
                    COALESCE(SUM(CASE WHEN ledger.amount > 0 THEN ledger.amount ELSE 0 END), 0) AS income,
                    COALESCE(SUM(CASE WHEN ledger.amount < 0 THEN ABS(ledger.amount) ELSE 0 END), 0) AS expense
                FROM ${baseSubquery}
                ${whereClause}
            `;

            const statusOverviewSql = `
                SELECT
                    ledger.status,
                    COUNT(*) AS count,
                    COALESCE(SUM(ABS(ledger.amount)), 0) AS amount
                FROM ${baseSubquery}
                ${whereClause}
                GROUP BY ledger.status
                ORDER BY count DESC
            `;

            const methodOverviewSql = `
                SELECT
                    ledger.payment_method,
                    COUNT(*) AS count,
                    COALESCE(SUM(ABS(ledger.amount)), 0) AS amount
                FROM ${baseSubquery}
                ${whereClause}
                GROUP BY ledger.payment_method
                ORDER BY amount DESC, count DESC
            `;

            const monthlyTrendSql = `
                SELECT
                    DATE_FORMAT(ledger.created_at, '%Y-%m') AS month_key,
                    DATE_FORMAT(ledger.created_at, '%b %Y') AS month_label,
                    COALESCE(SUM(CASE WHEN ledger.amount > 0 THEN ledger.amount ELSE 0 END), 0) AS income,
                    COALESCE(SUM(CASE WHEN ledger.amount < 0 THEN ABS(ledger.amount) ELSE 0 END), 0) AS expense
                FROM ${baseSubquery}
                WHERE ledger.created_at >= DATE_SUB(CURDATE(), INTERVAL 11 MONTH)
                ${whereClause ? `AND ${whereClause.replace(/^WHERE\s+/i, '')}` : ''}
                GROUP BY DATE_FORMAT(ledger.created_at, '%Y-%m'), DATE_FORMAT(ledger.created_at, '%b %Y')
                ORDER BY month_key ASC
            `;

            const [
                transactions,
                totalCountRows,
                summaryRows,
                analyticsRows,
                statusRows,
                methodRows,
                monthRows
            ] = await Promise.all([
                sequelize.query(ledgerSql, {
                    type: QueryTypes.SELECT,
                    replacements: {
                        ...replacements,
                        limit: pageSize,
                        offset
                    }
                }),
                sequelize.query(totalCountSql, {
                    type: QueryTypes.SELECT,
                    replacements
                }),
                sequelize.query(summarySql, {
                    type: QueryTypes.SELECT,
                    replacements
                }),
                sequelize.query(analyticsSql, {
                    type: QueryTypes.SELECT,
                    replacements
                }),
                sequelize.query(statusOverviewSql, {
                    type: QueryTypes.SELECT,
                    replacements
                }),
                sequelize.query(methodOverviewSql, {
                    type: QueryTypes.SELECT,
                    replacements
                }),
                sequelize.query(monthlyTrendSql, {
                    type: QueryTypes.SELECT,
                    replacements
                })
            ]);

            const totalCount = Number(totalCountRows?.[0]?.totalCount || 0);
            const totalPages = Math.max(Math.ceil(totalCount / pageSize), 1);
            const startIndex = totalCount === 0 ? 0 : offset + 1;
            const endIndex = Math.min(offset + pageSize, totalCount);

            const summaryRow = summaryRows?.[0] || {};
            const analyticsRow = analyticsRows?.[0] || {};

            const formattedTransactions = transactions.map((txn) => ({
                id: txn.id,
                transaction_id: txn.transaction_id,
                gateway_transaction_id: txn.gateway_transaction_id,
                booking_id: txn.booking_id,
                booking_token: txn.booking_token,
                user_token: txn.user_token,
                user_name: txn.user_name || 'Unknown User',
                user_email: txn.user_email || null,
                user_phone: txn.user_phone || null,
                user_avatar: txn.user_avatar || null,
                user_type: txn.user_type || 'vendor',
                transaction_type: txn.transaction_type,
                transaction_type_label: getTypeName(txn.transaction_type),
                amount: Number(txn.amount || 0),
                currency: txn.currency || 'INR',
                payment_method: txn.payment_method || 'wallet',
                payment_method_label: getMethodName(txn.payment_method),
                status: txn.status || 'pending',
                status_color: getStatusColor(txn.status),
                type_color: getTypeColor(txn.transaction_type),
                method_icon: getMethodIcon(txn.payment_method),
                settled_at: txn.settled_at || null,
                paid_at: txn.paid_at || null,
                refunded_at: txn.refunded_at || null,
                created_at: txn.created_at,
                updated_at: txn.updated_at,
                extra_meta: typeof txn.extra_meta === 'string'
                    ? safeJsonParse(txn.extra_meta)
                    : (txn.extra_meta || {})
            }));

            const totalAmountForPercentage = statusRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);

            const statusOverview = statusRows.map((row) => {
                const amount = Number(row.amount || 0);
                return {
                    status: row.status,
                    count: Number(row.count || 0),
                    amount,
                    percentage: totalAmountForPercentage > 0
                        ? Number(((amount / totalAmountForPercentage) * 100).toFixed(2))
                        : 0
                };
            });

            const methodLabels = methodRows.map((row) => getMethodName(row.payment_method));
            const methodData = methodRows.map((row) => Number(row.amount || 0));

            const monthMap = new Map();
            const now = new Date();

            for (let i = 11; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                const label = d.toLocaleString('en-IN', { month: 'short', year: 'numeric' });

                monthMap.set(key, {
                    label,
                    income: 0,
                    expense: 0
                });
            }

            for (const row of monthRows) {
                if (monthMap.has(row.month_key)) {
                    monthMap.set(row.month_key, {
                        label: row.month_label,
                        income: Number(row.income || 0),
                        expense: Number(row.expense || 0)
                    });
                }
            }

            const monthlyLabels = [];
            const monthlyIncome = [];
            const monthlyExpense = [];

            for (const [, value] of monthMap) {
                monthlyLabels.push(value.label);
                monthlyIncome.push(value.income);
                monthlyExpense.push(value.expense);
            }

            return {
                title: 'LehConnect | All Payments',
                transactions: formattedTransactions,
                summary: {
                    totalAmount: Number(summaryRow.totalAmount || 0),
                    totalCount: Number(summaryRow.totalCount || 0),
                    monthlyAmount: Number(summaryRow.monthlyAmount || 0),
                    monthlyCount: Number(summaryRow.monthlyCount || 0),
                    pendingAmount: Number(summaryRow.pendingAmount || 0),
                    pendingCount: Number(summaryRow.pendingCount || 0),
                    refundAmount: Number(summaryRow.refundAmount || 0),
                    refundCount: Number(summaryRow.refundCount || 0)
                },
                analytics: {
                    income: Number(analyticsRow.income || 0),
                    expense: Number(analyticsRow.expense || 0),
                    net: Number(analyticsRow.income || 0) - Number(analyticsRow.expense || 0)
                },
                statusOverview,
                methodLabels,
                methodData,
                monthlyLabels,
                monthlyIncome,
                monthlyExpense,
                currentPage: page,
                pageSize,
                totalCount,
                totalPages,
                startIndex,
                endIndex,
                defaultFromDate: resolvedFrom,
                defaultToDate: resolvedTo,
                currentRoute: 'payment-all',
                getStatusColor,
                getMethodIcon,
                getMethodName,
                getTypeColor,
                getTypeName,
                appliedFilters: {
                    from: resolvedFrom,
                    to: resolvedTo,
                    quickRange: req.query.quickRange || '',
                    types: toArray(req.query.types),
                    methods: toArray(req.query.methods),
                    statuses: toArray(req.query.statuses),
                    min_amount: req.query.min_amount || '',
                    max_amount: req.query.max_amount || '',
                    user: req.query.user || '',
                    transaction_id: req.query.transaction_id || '',
                    unsettled: req.query.unsettled || '',
                    sort
                }
            };
        } catch (error) {
            console.error('Error fetching payment page data:', error);
            throw error;
        }
    },

    adminProcessBookingRefund: async (req, res) => {
        const t = await db.sequelize.transaction();

        try {
            const adminUser = req.user;
            const { bookingToken } = req.params;
            const { refund_token, reason } = req.body;

            if (!bookingToken) {
                await t.rollback();
                req.setFlash('Invalid booking', 'error')
                return res.redirect('/payment-all')
            }

            const booking = await Booking.findOne({
                where: { token: bookingToken },
                attributes: [
                    'token',
                    'vendor_token',
                    'assigned_vendor_token',
                    'secure_booking',
                    'payment_status',
                    'status'
                ],
                transaction: t,
                lock: t.LOCK.UPDATE
            });

            if (!booking) {
                await t.rollback();
                req.setFlash('Booking not found', 'error')
                return res.redirect('/payment-all')
            }

            if (!booking.secure_booking) {
                await t.rollback();
                req.setFlash('This is not secure booking', 'error')
                return res.redirect('/payment-all')
            }

            const paymentRow = await BookingPayment.findOne({
                where: {
                    booking_token: booking.token,
                    order_status: 'PAID',
                    flag: false
                },
                transaction: t,
                lock: t.LOCK.UPDATE
            });

            if (!paymentRow) {
                await t.rollback();
                req.setFlash('Paid booking payment not found', 'error')
                return res.redirect('/payment-all')
            }

            const refundWhere = {
                booking_token: booking.token,
                payment_token: paymentRow.token,
                refund_status: 'PENDING',
                flag: false
            };

            if (refund_token) {
                refundWhere.token = refund_token;
            }

            const refundRow = await BookingRefund.findOne({
                where: refundWhere,
                transaction: t,
                lock: t.LOCK.UPDATE
            });

            if (!refundRow) {
                await t.rollback();
                req.setFlash('Pending refund request not found', 'error')
                return res.redirect('/payment-all')
            }

            if (paymentRow.refund_status === 'REFUNDED') {
                await t.rollback();
                req.setFlash('Refund already processed', 'error')
                return res.redirect('/payment-all')
            }

            // manual refund processed by admin
            await refundRow.update(
                {
                    refund_status: 'PROCESSED',
                    reason: reason || refundRow.reason || 'Manual refund processed by admin',
                    meta: {
                        ...(refundRow.meta || {}),
                        processed_by_token: adminUser.token || null,
                        processed_by_id: adminUser.id || null,
                        processed_at: new Date().toISOString(),
                        processed_mode: 'MANUAL_ADMIN'
                    }
                },
                { transaction: t }
            );

            await paymentRow.update(
                {
                    refund_status: 'REFUNDED',
                    refunded_at: new Date(),
                    meta: {
                        ...(paymentRow.meta || {}),
                        manual_refund_processed: true,
                        manual_refund_ref: refundRow.token
                    }
                },
                { transaction: t }
            );

            await booking.update(
                {
                    payment_status: 'REFUNDED'
                },
                { transaction: t }
            );

            await VendorPayout.update(
                {
                    payout_status: 'CANCELLED',
                    remarks: 'Cancelled because manual refund processed by admin'
                },
                {
                    where: {
                        payment_token: paymentRow.token,
                        flag: false
                    },
                    transaction: t
                }
            );

            const payerVendor = await Vendor.findOne({
                where: { token: paymentRow.payer_token },
                attributes: ['token', 'first_name', 'last_name'],
                transaction: t
            });

            const refundReceiverToken = paymentRow.payer_token;

            const refundReceiverName =
                [payerVendor?.first_name, payerVendor?.last_name].filter(Boolean).join(' ').trim() || 'Vendor';

            await Notification.create(
                {
                    token: randomstring(64),
                    sender_token: adminUser.token || null,
                    receiver_token: refundReceiverToken,
                    receiver_role: 'vendor',
                    booking_token: booking.token,
                    type: 'BOOKING_REFUND_PROCESSED',
                    title: 'Refund Processed',
                    message: `Your refund for booking ${booking.token} has been processed successfully.`,
                    visibility: 'private',
                    payload: {
                        booking_token: booking.token,
                        payment_token: paymentRow.token,
                        refund_token: refundRow.token,
                        refund_amount: refundRow.refund_amount,
                        refund_status: 'PROCESSED'
                    }
                },
                { transaction: t }
            );

            const fcmDevices = await VendorDeviceFcm.findAll({
                where: {
                    vendor_token: refundReceiverToken,
                    flag: false
                },
                attributes: ['fcm_token'],
                transaction: t
            });

            await t.commit();

            try {
                const io = getIO();
                io?.to(`vendor:${refundReceiverToken}`).emit('booking:refund-processed', {
                    booking_token: booking.token,
                    payment_token: paymentRow.token,
                    refund_token: refundRow.token,
                    refund_amount: refundRow.refund_amount,
                    refund_status: 'PROCESSED',
                    title: 'Refund Processed',
                    message: `Your refund for booking ${booking.token} has been processed successfully.`
                });
            } catch (socketError) {
                console.error('[REFUND SOCKET ERROR]', socketError);
            }

            try {
                const tokens = (fcmDevices || [])
                    .map(item => item.fcm_token)
                    .filter(Boolean);

                if (tokens.length) {
                    await admin.messaging().sendEachForMulticast({
                        tokens,
                        notification: {
                            title: 'Refund Processed',
                            body: `Your refund for booking ${booking.token} has been processed successfully.`
                        },
                        data: {
                            type: 'BOOKING_REFUND_PROCESSED',
                            booking_token: String(booking.token),
                            payment_token: String(paymentRow.token),
                            refund_token: String(refundRow.token),
                            refund_status: 'PROCESSED',
                            refund_amount: String(refundRow.refund_amount)
                        },
                        android: {
                            priority: 'high',
                            notification: {
                                channelId: 'refunds'
                            }
                        }
                    });
                }
            } catch (firebaseError) {
                console.error('[REFUND FIREBASE ERROR]', firebaseError);
            }

            return res.status(200).json(
                responseData(
                    'Refund processed successfully',
                    {
                        booking_token: booking.token,
                        payment_token: paymentRow.token,
                        refund_token: refundRow.token,
                        refund_amount: refundRow.refund_amount,
                        refund_status: 'PROCESSED',
                        refunded_to_token: refundReceiverToken,
                        refunded_to_name: refundReceiverName
                    },
                    req,
                    true
                )
            );
        } catch (error) {
            if (!t.finished) {
                await t.rollback();
            }

            console.error('[ADMIN BOOKING REFUND ERROR]', error);

            return res.status(500).json(
                responseData(error.message || 'Something went wrong', {}, req, false)
            );
        }
    },

    getAdminLedgerDashboardData: async (query = {}) => {
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
        } = query;

        page = parseInt(page, 10) || 1;
        limit = parseInt(limit, 10) || 10;

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

        const totalCount = toNumber(countRows?.[0]?.totalCount, 0);
        const totalPages = Math.max(1, Math.ceil(totalCount / limit));

        return {
            summary: {
                overall: {
                    total_entries: toNumber(summaryRows?.[0]?.total_entries),
                    total_paid_amount: toNumber(summaryRows?.[0]?.total_paid_amount),
                    total_refund_amount: toNumber(summaryRows?.[0]?.total_refund_amount),
                    total_deduction_amount: toNumber(summaryRows?.[0]?.total_deduction_amount),
                    net_amount: toNumber(summaryRows?.[0]?.net_amount)
                },
                today: {
                    total_entries: toNumber(todayRows?.[0]?.total_entries),
                    total_paid_amount: toNumber(todayRows?.[0]?.total_paid_amount),
                    total_refund_amount: toNumber(todayRows?.[0]?.total_refund_amount),
                    total_deduction_amount: toNumber(todayRows?.[0]?.total_deduction_amount),
                    net_amount: toNumber(todayRows?.[0]?.net_amount)
                },
                current_week: {
                    total_entries: toNumber(currentWeekRows?.[0]?.total_entries),
                    total_paid_amount: toNumber(currentWeekRows?.[0]?.total_paid_amount),
                    total_refund_amount: toNumber(currentWeekRows?.[0]?.total_refund_amount),
                    total_deduction_amount: toNumber(currentWeekRows?.[0]?.total_deduction_amount),
                    net_amount: toNumber(currentWeekRows?.[0]?.net_amount)
                },
                current_month: {
                    total_entries: toNumber(currentMonthRows?.[0]?.total_entries),
                    total_paid_amount: toNumber(currentMonthRows?.[0]?.total_paid_amount),
                    total_refund_amount: toNumber(currentMonthRows?.[0]?.total_refund_amount),
                    total_deduction_amount: toNumber(currentMonthRows?.[0]?.total_deduction_amount),
                    net_amount: toNumber(currentMonthRows?.[0]?.net_amount)
                }
            },
            analytics: {
                daily: (dailyRows || []).map((row) => ({
                    date: row.date,
                    label: row.label,
                    total_entries: toNumber(row.total_entries),
                    total_paid_amount: toNumber(row.total_paid_amount),
                    total_refund_amount: toNumber(row.total_refund_amount),
                    total_deduction_amount: toNumber(row.total_deduction_amount),
                    net_amount: toNumber(row.net_amount)
                })),
                weekly: (weeklyRows || []).map((row) => ({
                    year: toNumber(row.year),
                    week_number: toNumber(row.week_number),
                    week_start_date: row.week_start_date,
                    week_end_date: row.week_end_date,
                    total_entries: toNumber(row.total_entries),
                    total_paid_amount: toNumber(row.total_paid_amount),
                    total_refund_amount: toNumber(row.total_refund_amount),
                    total_deduction_amount: toNumber(row.total_deduction_amount),
                    net_amount: toNumber(row.net_amount)
                })),
                monthly: (monthlyRows || []).map((row) => ({
                    month_key: row.month_key,
                    month_label: row.month_label,
                    total_entries: toNumber(row.total_entries),
                    total_paid_amount: toNumber(row.total_paid_amount),
                    total_refund_amount: toNumber(row.total_refund_amount),
                    total_deduction_amount: toNumber(row.total_deduction_amount),
                    net_amount: toNumber(row.net_amount)
                }))
            },
            transactions: (ledgerRows || []).map((row) => ({
                ...row,
                amount: toNumber(row.amount),
                deduction_amount: toNumber(row.deduction_amount),
                net_refundable_amount: toNumber(row.net_refundable_amount)
            })),
            pagination: {
                page,
                limit,
                totalCount,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            },
            filters: {
                from: from || '',
                to: to || '',
                quickRange: quickRange || '',
                booking_token: booking_token || '',
                payment_status: payment_status || '',
                refund_status: refund_status || '',
                ledger_type: ledger_type || '',
                search: search || '',
                sort: sort || 'newest'
            }
        };
    },

    getVehiclesWithFilters: async (page, limit, status, search, type = null, availability = null) => {
        try {
            let whereClause = {};

            // Status filter
            if (status !== 'all') {
                whereClause.status = status;
            }

            // Type filter
            if (type && type !== 'all') {
                whereClause.type = type;
            }

            // Availability filter
            if (availability && availability !== 'all') {
                whereClause.availability = availability;
            }

            // Search filter
            if (search && search.trim() !== '') {
                whereClause[Op.or] = [
                    { name: { [Op.like]: `%${search}%` } },
                    { type: { [Op.like]: `%${search}%` } },
                    { token: { [Op.like]: `%${search}%` } }
                ];
            }

            const offset = (page - 1) * limit;

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
                    'updated_at',
                    [Sequelize.literal(`CONCAT('${admin_url}', image1)`), 'image1'],
                    [Sequelize.literal(`CONCAT('${admin_url}', image2)`), 'image2']
                ],
                raw: true
            });

            return {
                message: 'Vehicles fetched successfully',
                success: true,
                data: rows,
                currentPage: page,
                totalPages: Math.ceil(count / limit),
                totalRecords: count,
                recordsPerPage: limit,
                filters: { status, search, type, availability }
            };

        } catch (error) {
            console.error('Error in getVehiclesWithFilters:', error);
            return {
                success: false,
                error: error.message,
                message: 'Error fetching vehicles',
                data: []
            };
        }
    },

    addVehicle: async (req, res) => {
        try {
            const vehicleData = {
                name: req.body.name,
                type: req.body.type,
                seater: parseInt(req.body.seater),
                avg_per_km: parseFloat(req.body.avg_per_km),
                availability: req.body.availability,
                ac: req.body.ac === 'true' || req.body.ac === true || req.body.ac === '1',
                gps: req.body.gps === 'true' || req.body.gps === true || req.body.gps === '1',
                status: req.body.status || 'active',
                token: randomstring(64)
            };

            if (req.files && req.files['image1'] && req.files['image1'][0]) {
                vehicleData.image1 = '/uploads/' + req.files['image1'][0].filename;
            }

            if (req.files && req.files['image2'] && req.files['image2'][0]) {
                vehicleData.image2 = '/uploads/' + req.files['image2'][0].filename;
            }

            if (!vehicleData.image1 || !vehicleData.image2) {
                req.setFlash('Please upload both image1 and image2 for the vehicle', 'error');
                return res.redirect('/manage-vehicles');
            }

            const newVehicle = await Vehicle.create(vehicleData);

            if (!newVehicle) {
                req.setFlash('error', 'Failed to add vehicle');
                return res.redirect('/manage-vehicles');
            }

            req.setFlash('success', 'Vehicle added successfully');
            return res.redirect('/manage-vehicles');

        } catch (error) {
            console.error('Error in addVehicle:', error);
            req.setFlash('error', 'Error adding vehicle: ' + error.message);
            return res.redirect('/manage-vehicles');
        }
    },

    updateVehicle: async (req, res) => {
        try {
            const { token } = req.params;

            const vehicle = await Vehicle.findOne({ where: { token: token } });

            if (!vehicle) {
                req.setFlash('error', 'Vehicle not found');
                return res.redirect('/manage-vehicles');
            }

            const updateData = {};

            if (req.body.name) updateData.name = req.body.name;
            if (req.body.type) updateData.type = req.body.type;
            if (req.body.seater) updateData.seater = parseInt(req.body.seater);
            if (req.body.avg_per_km) updateData.avg_per_km = parseFloat(req.body.avg_per_km);
            if (req.body.availability) updateData.availability = req.body.availability;
            if (req.body.status) updateData.status = req.body.status;

            if (req.body.ac !== undefined) {
                updateData.ac = req.body.ac === 'true' || req.body.ac === true || req.body.ac === '1';
            }
            if (req.body.gps !== undefined) {
                updateData.gps = req.body.gps === 'true' || req.body.gps === true || req.body.gps === '1';
            }

            if (req.files && req.files['image1'] && req.files['image1'][0]) {
                if (vehicle.image1 && vehicle.image1 !== '/images/default-car.jpg') {
                    const oldImagePath = path.join(__dirname, '../public', vehicle.image1);
                    if (fs.existsSync(oldImagePath)) {
                        fs.unlinkSync(oldImagePath);
                    }
                }
                updateData.image1 = '/uploads/vehicles/' + req.files['image1'][0].filename;
            }

            if (req.files && req.files['image2'] && req.files['image2'][0]) {
                // Delete old image if exists (optional)
                if (vehicle.image2 && vehicle.image2 !== '/images/default-car.jpg') {
                    const oldImagePath = path.join(__dirname, '../public', vehicle.image2);
                    if (fs.existsSync(oldImagePath)) {
                        fs.unlinkSync(oldImagePath);
                    }
                }
                updateData.image2 = '/uploads/vehicles/' + req.files['image2'][0].filename;
            }

            if (!updateData.image1 && req.body.existingImage1) {
                updateData.image1 = req.body.existingImage1;
            }
            if (!updateData.image2 && req.body.existingImage2) {
                updateData.image2 = req.body.existingImage2;
            }

            await vehicle.update(updateData);

            req.setFlash('success', 'Vehicle updated successfully');
            return res.redirect('/manage-vehicles');

        } catch (error) {
            console.error('Error in updateVehicle:', error);
            req.setFlash('error', 'Error updating vehicle: ' + error.message);
            return res.redirect('/manage-vehicles');
        }
    },

    deleteVehicle: async (req, res) => {
        try {
            const { token } = req.params;
            const deleted = await Vehicle.destroy({ where: { token } });
            if (deleted === 0) {
                req.setFlash('Vehicle not found', 'error');
                return res.redirect('/manage-vehicles');
            }
            req.setFlash('Vehicle deleted successfully', 'success');
            return res.redirect('/manage-vehicles');
        } catch (error) {
            console.error('Error in deleteVehicle:', error);
            req.setFlash('Error deleting vehicle', 'error');
            return res.redirect('/manage-vehicles');
        }
    },

    toggleVehicleStatus: async (req, res) => {
        try {
            const { token } = req.params;
            const vehicle = await Vehicle.findOne({ where: { token } });
            if (!vehicle) {
                req.setFlash('Vehicle not found', 'error');
                return res.redirect('/manage-vehicles');
            }
            const newStatus = vehicle.status === 'active' ? 'inactive' : 'active';
            await vehicle.update({ status: newStatus });
            req.setFlash(`Vehicle ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`, 'success');
            return res.redirect('/manage-vehicles');
        } catch (error) {
            console.error('Error in toggleVehicleStatus:', error);
            req.setFlash('Error toggling vehicle status', 'error');
            return res.redirect('/manage-vehicles');
        }
    }
}


module.exports = adminController
