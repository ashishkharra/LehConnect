module.exports = (sequelize, Sequelize) => {
    const Customer = sequelize.define("tbl_customer", {
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },

        token: {
            type: Sequelize.STRING,
            allowNull: true,
        },

        first_name: {
            type: Sequelize.STRING,
            allowNull: true,
        },

        last_name: {
            type: Sequelize.STRING,
            allowNull: true,
        },

        contact: {
            type: Sequelize.STRING,
            allowNull: true,
        },

        alt_contact: {
            type: Sequelize.STRING,
            allowNull: true,
        },

        email: {
            type: Sequelize.STRING,
            allowNull: true,
        },

        role: {
            type: Sequelize.ENUM('VENDOR'),
            defaultValue: 'VENDOR'
        },

        location: {
            type: Sequelize.STRING,
            allowNull: true,
        },

        address: {
            type: Sequelize.STRING,
            allowNull: true,
        },

        pincode: {
            type: Sequelize.STRING(10),
            allowNull: true,
        },

        profile_image: {
            type: Sequelize.STRING,
            allowNull: true,
        },

        country: {
            type: Sequelize.STRING(64),
            allowNull: true
        },

        city: {
            type: Sequelize.STRING(64),
            allowNull: true
        },

        // vi. State
        state: {
            type: Sequelize.STRING(64),
            allowNull: true
        },

        preferred_state: {
            type: Sequelize.STRING(64),
            allowNull: true,
            comment: 'Preferred state for vendor notifications'
        },

        preferred_cities: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: 'Up to 5 preferred cities for the selected state'
        },

        ip: {
            type: Sequelize.STRING,
            allowNull: true,
        },

        user_agent: {
            type: Sequelize.STRING,
            allowNull: true,
        },

        feedback: {
            type: Sequelize.STRING,
            allowNull: true,
        },

        image: {
            type: Sequelize.STRING,
            allowNull: true,
        },

        car_alert: {
            type: Sequelize.STRING,
            allowNull: true
        },

        location_alert: {
            type: Sequelize.STRING,
            allowNull: true
        },

        identity_type: {
            type: Sequelize.ENUM(
                'AADHAAR',
                'PAN',
                'DRIVING_LICENSE',
                'VOTER_ID'
            ),
            allowNull: true,
            comment: 'Final identity selected after document upload'
        },

        identity_front_image: {
            type: Sequelize.STRING,
            allowNull: true
        },

        identity_back_image: {
            type: Sequelize.STRING,
            allowNull: true
        },

        identity_rejection_reason: {
            type: Sequelize.STRING,
            allowNull: true
        },

        identity_submitted_at: {
            type: Sequelize.DATE,
            allowNull: true
        },

        aadhaar_front_image: {
            type: Sequelize.STRING,
            allowNull: true
        },

        aadhaar_back_image: {
            type: Sequelize.STRING,
            allowNull: true
        },

        aadhaar_number: {
            type: Sequelize.STRING,
            allowNull: true
        },

        aadhaar_verified: {
            type: Sequelize.BOOLEAN,
            defaultValue: false
        },

        aadhaar_verified_at: {
            type: Sequelize.DATE,
            allowNull: true
        },

        dl_front_image: {
            type: Sequelize.STRING,
            allowNull: true
        },

        dl_back_image: {
            type: Sequelize.STRING,
            allowNull: true
        },

        dl_number: {
            type: Sequelize.STRING,
            allowNull: true
        },

        dl_dob: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: 'DOB used for DL verification'
        },

        dl_verified: {
            type: Sequelize.BOOLEAN,
            defaultValue: false
        },

        dl_verified_at: {
            type: Sequelize.DATE,
            allowNull: true
        },

        vehicle_image: {
            type: Sequelize.STRING,
            allowNull: true
        },

        submitted_on: {
            type: Sequelize.DATE,
            allowNull: true,
        },

        verification_status: {
            type: Sequelize.ENUM(
                'NOT_STARTED',
                'PARTIAL',
                'SUBMITTED',
                'ALMOST_COMPLETED',
                'VERIFIED',
                'REJECTED',
                'UNDER_REVIEW'
            ),
            defaultValue: 'NOT_STARTED'
        },

        verification_percentage: {
            type: Sequelize.INTEGER,
            defaultValue: 0,
            comment: 'Overall vendor verification completion (0–100)'
        },

        rejectReason: {
            type: Sequelize.TEXT,
            allowNull: true
        },

        reject_reason_meta: {
            type: Sequelize.JSON,
            allowNull: true
        },

        status: {
            type: Sequelize.ENUM('active', 'inactive'),
            defaultValue: 'active',
            allowNull: false,
        },

        flag: {
            type: Sequelize.INTEGER,
            defaultValue: 0,
            allowNull: false,
        },

        ref_code: {
            type: Sequelize.STRING,
            allowNull: true
        },

        referer_code_used: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: "vendor.id who referred this vendor"
        },

        about_me: {
            type: Sequelize.STRING,
            allowNull: true
        },

        booking_notification_enabled: {
            type: Sequelize.BOOLEAN,
            defaultValue: true
        },

        notification_trip_type: {
            type: Sequelize.ENUM('ONE_WAY', 'ROUND_TRIP', 'ALL'),
            defaultValue: 'ALL'
        },

        notification_vehicle_type: {
            type: Sequelize.STRING,
            allowNull: true,
            comment: 'Comma separated or JSON based vehicle types'
        },

        notification_city: {
            type: Sequelize.STRING,
            allowNull: true
        },

        notification_state: {
            type: Sequelize.STRING,
            allowNull: true
        },

        customer_notification_enabled: {
            type: Sequelize.BOOLEAN,
            defaultValue: true
        },

        create_date: {
            type: Sequelize.DATE,
            allowNull: true,
            defaultValue: Sequelize.NOW,
        },

        update_date: {
            type: Sequelize.DATE,
            allowNull: true,
            defaultValue: Sequelize.NOW,
        }

    }, {
        tableName: 'tbl_customer',
        freezeTableName: true,
        timestamps: true,
        createdAt: 'create_date',
        updatedAt: 'update_date',
        indexes: [
            { fields: ["contact"] },

            { unique: true, fields: ["token"] },
            { unique: true, fields: ["ref_code"] },

            { fields: ["referer_code_used"] },

            { fields: ["state"] },
            { fields: ["city"] },
            { fields: ["state", "city"] },

            { fields: ["verification_status"] },
            { fields: ["verification_percentage"] },

            { fields: ["preferred_state"] },
            { fields: ["notification_state"] },
            { fields: ["notification_city"] },

            { fields: ["create_date"] },
            { fields: ["update_date"] },

            { fields: ["status", "flag"] },
        ]

    });

    return Customer;
};