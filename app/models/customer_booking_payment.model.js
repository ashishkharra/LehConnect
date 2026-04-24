module.exports = (sequelize, Sequelize) => {
    const CustomerBookingPayment = sequelize.define(
        "CustomerBookingPayment",
        {
            id: {
                type: Sequelize.BIGINT,
                primaryKey: true,
                autoIncrement: true
            },

            token: {
                type: Sequelize.STRING,
                allowNull: true
            },

            booking_token: {
                type: Sequelize.STRING,
                allowNull: false
            },

            customer_token: {
                type: Sequelize.STRING,
                allowNull: false
            },

            payment_type: {
                type: Sequelize.ENUM("WALLET", "RAZORPAY"),
                allowNull: false
            },

            amount: {
                type: Sequelize.DECIMAL(14, 2),
                allowNull: false,
                defaultValue: 300.00
            },

            payment_status: {
                type: Sequelize.ENUM(
                    "PENDING",
                    "SUCCESS",
                    "FAILED",
                    "REFUNDED"
                ),
                allowNull: false,
                defaultValue: "PENDING"
            },

            wallet_id: {
                type: Sequelize.BIGINT,
                allowNull: true
            },

            wallet_transaction_id: {
                type: Sequelize.BIGINT,
                allowNull: true
            },

            razorpay_order_id: {
                type: Sequelize.STRING,
                allowNull: true
            },

            razorpay_payment_id: {
                type: Sequelize.STRING,
                allowNull: true
            },

            razorpay_signature: {
                type: Sequelize.STRING,
                allowNull: true
            },

            failure_reason: {
                type: Sequelize.STRING(255),
                allowNull: true
            },

            meta: {
                type: Sequelize.JSON,
                allowNull: true
            },

            flag: {
                type: Sequelize.BOOLEAN,
                defaultValue: false
            }
        },
        {
            tableName: "tbl_customer_booking_payments",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            indexes: [
                { fields: ["booking_token"] },
                { fields: ["customer_token"] },
                { fields: ["payment_type"] },
                { fields: ["payment_status"] },
                { fields: ["razorpay_order_id"] },
                { fields: ["razorpay_payment_id"] }
            ]
        }
    );

    return CustomerBookingPayment;
};