module.exports = (sequelize, Sequelize) => {
    const BookingRefund = sequelize.define(
        'tbl_booking_refunds',
        {
            id: {
                type: Sequelize.BIGINT,
                primaryKey: true,
                autoIncrement: true
            },

            token: {
                type: Sequelize.STRING,
                allowNull: false
            },

            booking_token: {
                type: Sequelize.STRING,
                allowNull: false
            },

            payment_token: {
                type: Sequelize.STRING,
                allowNull: false
            },

            refunded_by_token: {
                type: Sequelize.STRING,
                allowNull: true,
                comment: 'Who initiated refund'
            },

            refund_to_token: {
                type: Sequelize.STRING,
                allowNull: true,
                comment: 'Original payer/vendor'
            },

            refund_amount: {
                type: Sequelize.DECIMAL(14, 2),
                allowNull: false
            },

            currency: {
                type: Sequelize.STRING(10),
                allowNull: false,
                defaultValue: 'INR'
            },

            razorpay_payment_id: {
                type: Sequelize.STRING,
                allowNull: true
            },

            razorpay_refund_id: {
                type: Sequelize.STRING,
                allowNull: true
            },

            refund_status: {
                type: Sequelize.ENUM('PENDING', 'PROCESSED', 'FAILED'),
                allowNull: false,
                defaultValue: 'PENDING'
            },

            reason: {
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
            timestamps: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            indexes: [
                { fields: ['token'], unique: true },
                { fields: ['booking_token'] },
                { fields: ['payment_token'] },
                { fields: ['razorpay_refund_id'], unique: true }
            ]
        }
    );

    return BookingRefund;
};