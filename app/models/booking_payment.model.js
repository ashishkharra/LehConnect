module.exports = (sequelize, Sequelize) => {
    const BookingPayment = sequelize.define(
        'tbl_booking_payments',
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
                allowNull: true
            },

            payer_token: {
                type: Sequelize.STRING,
                allowNull: true,
                comment: 'Booking owner/vendor who pays advance to platform'
            },

            payee_vendor_token: {
                type: Sequelize.STRING,
                allowNull: true,
                comment: 'Assigned vendor who will later receive payout from platform'
            },

            payment_for: {
                type: Sequelize.ENUM('BOOKING_ADVANCE'),
                allowNull: true,
                defaultValue: 'BOOKING_ADVANCE'
            },

            amount: {
                type: Sequelize.DECIMAL(14, 2),
                allowNull: false
            },

            currency: {
                type: Sequelize.STRING(10),
                allowNull: true,
                defaultValue: 'INR'
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

            razorpay_receipt: {
                type: Sequelize.STRING,
                allowNull: true
            },

            order_status: {
                type: Sequelize.ENUM('CREATED', 'ATTEMPTED', 'PAID', 'FAILED'),
                allowNull: true,
                defaultValue: 'CREATED'
            },

            refund_status: {
                type: Sequelize.ENUM('NONE', 'PENDING', 'REFUNDED', 'PARTIALLY_REFUNDED', 'FAILED'),
                allowNull: true,
                defaultValue: 'NONE'
            },

            paid_at: {
                type: Sequelize.DATE,
                allowNull: true
            },

            refunded_at: {
                type: Sequelize.DATE,
                allowNull: true
            },

            flag: {
                type: Sequelize.BOOLEAN,
                defaultValue: false
            },

            meta: {
                type: Sequelize.JSON,
                allowNull: true
            }
        },
        {
            timestamps: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            indexes: [
                { fields: ['token'], unique: true },
                { fields: ['booking_token'] },
                { fields: ['payer_token'] },
                { fields: ['payee_vendor_token'] },
                { fields: ['razorpay_order_id'], unique: true },
                { fields: ['razorpay_payment_id'], unique: true },
                { fields: ['order_status'] }
            ]
        }
    );

    return BookingPayment;
};