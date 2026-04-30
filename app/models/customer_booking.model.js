module.exports = (sequelize, Sequelize) => {
    const CustomerBooking = sequelize.define(
        "CustomerBooking",
        {
            id: {
                type: Sequelize.INTEGER,
                autoIncrement: true,
                primaryKey: true
            },

            token: {
                type: Sequelize.STRING,
                defaultValue: null
            },

            vehicle_token: {
                type: Sequelize.STRING,
                allowNull: true,
                defaultValue: null
            },

            vendor_token: {
                type: Sequelize.STRING,
                allowNull: true,
                defaultValue: null
            },

            customer_token: {
                type: Sequelize.STRING,
                allowNull: true,
                defaultValue: null
            },

            who_posted: {
                type: Sequelize.STRING,
                allowNull: true,
                defaultValue: null
            },

            from_web: {
                type: Sequelize.BOOLEAN,
                defaultValue: false
            },

            trip_type: {
                type: Sequelize.ENUM("oneway", "round_trip", "local"),
                allowNull: false
            },

            from_location: {
                type: Sequelize.STRING,
                allowNull: true,
                defaultValue: null
            },

            to_location: {
                type: Sequelize.STRING,
                allowNull: true,
                defaultValue: null
            },

            departure_date: {
                type: Sequelize.DATE,
                allowNull: true,
                defaultValue: null
            },

            return_date: {
                type: Sequelize.DATE,
                allowNull: true,
                defaultValue: null
            },

            car_type: {
                type: Sequelize.STRING,
                allowNull: true,
                defaultValue: null
            },

            contact: {
                type: Sequelize.STRING,
                allowNull: true,
                defaultValue: null
            },

            /* ================= PAYMENT SECTION ================= */

            total_distance: {
                type: Sequelize.DECIMAL(10, 2),
                allowNull: true,
                defaultValue: null,
                comment: "Distance from frontend in KM"
            },

            total_amount: {
                type: Sequelize.DECIMAL(14, 2),
                allowNull: false,
                defaultValue: 0.00,
                comment: "Total booking amount"
            },

            wallet_amount_used: {
                type: Sequelize.DECIMAL(14, 2),
                allowNull: false,
                defaultValue: 0.00,
                comment: "Amount reserved/used from referral wallet"
            },

            razorpay_amount: {
                type: Sequelize.DECIMAL(14, 2),
                allowNull: false,
                defaultValue: 0.00,
                comment: "Amount to be paid via Razorpay"
            },

            payment_type: {
                type: Sequelize.ENUM("WALLET", "RAZORPAY", "MIXED"),
                allowNull: true,
                defaultValue: null
            },

            payment_status: {
                type: Sequelize.ENUM(
                    "PENDING",
                    "PARTIAL",
                    "PAID",
                    "FAILED",
                    "REFUNDED"
                ),
                allowNull: false,
                defaultValue: "PENDING"
            },

            wallet_status: {
                type: Sequelize.ENUM(
                    "NONE",
                    "RESERVED",
                    "USED",
                    "REFUNDED"
                ),
                allowNull: false,
                defaultValue: "NONE"
            },

            razorpay_order_id: {
                type: Sequelize.STRING,
                allowNull: true,
                defaultValue: null
            },

            razorpay_payment_id: {
                type: Sequelize.STRING,
                allowNull: true,
                defaultValue: null
            },

            /* ================= BOOKING STATUS ================= */

            status: {
                type: Sequelize.ENUM(
                    "PENDING",
                    "CONFIRMED",
                    "ONGOING",
                    "COMPLETED",
                    "CANCELLED",
                    "REJECTED",
                    "EXPIRED"
                ),
                defaultValue: "PENDING"
            },

            flag: {
                type: Sequelize.INTEGER,
                defaultValue: 0
            }
        },
        {
            tableName: "tbl_customer_booking",
            timestamps: true,
            createdAt: "create_date",
            updatedAt: "update_date",

            indexes: [
                {
                    name: "idx_booking_token",
                    fields: ["token"]
                },
                {
                    name: "idx_booking_vendor",
                    fields: ["vendor_token"]
                },
                {
                    name: "idx_booking_customer",
                    fields: ["customer_token"]
                },
                {
                    name: "idx_booking_vehicle",
                    fields: ["vehicle_token"]
                },
                {
                    name: "idx_booking_status",
                    fields: ["status"]
                },
                {
                    name: "idx_booking_payment_status",
                    fields: ["payment_status"]
                },
                {
                    name: "idx_booking_flag",
                    fields: ["flag"]
                },
                {
                    name: "idx_booking_created",
                    fields: ["create_date"]
                },
                {
                    name: "idx_vendor_status_flag",
                    fields: ["vendor_token", "status", "flag"]
                },
                {
                    name: "idx_customer_status_flag",
                    fields: ["customer_token", "status", "flag"]
                },
                {
                    name: "idx_status_flag_created",
                    fields: ["status", "flag", "create_date"]
                },
                {
                    name: "idx_payment_flag",
                    fields: ["payment_status", "flag"]
                }
            ]
        }
    );

    return CustomerBooking;
};