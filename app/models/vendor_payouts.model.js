module.exports = (sequelize, Sequelize) => {
    const VendorPayout = sequelize.define(
        'tbl_vendor_payouts',
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

            vendor_token: {
                type: Sequelize.STRING,
                allowNull: false,
                comment: 'Assigned vendor who will receive payout'
            },

            payer_token: {
                type: Sequelize.STRING,
                allowNull: true,
                comment: 'Original booking owner who paid platform'
            },

            gross_amount: {
                type: Sequelize.DECIMAL(14, 2),
                allowNull: false
            },

            commission_amount: {
                type: Sequelize.DECIMAL(14, 2),
                allowNull: false,
                defaultValue: 0.00
            },

            net_amount: {
                type: Sequelize.DECIMAL(14, 2),
                allowNull: false
            },

            currency: {
                type: Sequelize.STRING(10),
                allowNull: false,
                defaultValue: 'INR'
            },

            payout_status: {
                type: Sequelize.ENUM('PENDING', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED'),
                allowNull: false,
                defaultValue: 'PENDING'
            },

            payout_method: {
                type: Sequelize.STRING(50),
                allowNull: true,
                comment: 'BANK, UPI, CASH, MANUAL'
            },

            payout_reference_id: {
                type: Sequelize.STRING,
                allowNull: true
            },

            paid_at: {
                type: Sequelize.DATE,
                allowNull: true
            },

            remarks: {
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
                { fields: ['vendor_token'] },
                { fields: ['payout_status'] }
            ]
        }
    );

    return VendorPayout;
};