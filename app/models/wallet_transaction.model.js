module.exports = (sequelize, Sequelize) => {
    const WalletTransaction = sequelize.define(
        'tbl_wallet_transactions',
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

            wallet_id: {
                type: Sequelize.BIGINT,
                allowNull: false,
                comment: 'FK to tbl_wallets.id'
            },

            transaction_type: {
                type: Sequelize.ENUM('CREDIT', 'DEBIT'),
                allowNull: true
            },

            amount: {
                type: Sequelize.DECIMAL(14, 2),
                allowNull: false
            },

            opening_balance: {
                type: Sequelize.DECIMAL(14, 2),
                allowNull: false
            },

            closing_balance: {
                type: Sequelize.DECIMAL(14, 2),
                allowNull: false
            },

            wallet_balance: {
                type: Sequelize.DECIMAL(14, 2),
                allowNull: false,
                defaultValue: 0.00,
                comment: 'Wallet balance after transaction'
            },

            referral_balance: {
                type: Sequelize.DECIMAL(14, 2),
                allowNull: false,
                defaultValue: 0.00,
                comment: 'Referral balance after transaction'
            },

            failure_reason: {
                type: Sequelize.STRING(255),
                allowNull: true,
                defaultValue: null
            },

            reason: {
                type: Sequelize.STRING(255),
                allowNull: true,
                comment: 'ADD_MONEY, ORDER_PAYMENT, REFUND, ADMIN_ADJUSTMENT'
            },

            reference_type: {
                type: Sequelize.STRING(50),
                allowNull: true,
                comment: 'ORDER, RAZORPAY_PAYMENT, REFUND'
            },

            reference_id: {
                type: Sequelize.STRING(255),
                allowNull: true,
                comment: 'Order ID / Razorpay payment ID'
            },

            status: {
                type: Sequelize.ENUM('PENDING', 'SUCCESS', 'FAILED', 'REVERSED'),
                allowNull: true,
                defaultValue: 'SUCCESS'
            },

            flag: {
                type: Sequelize.BOOLEAN,
                defaultValue: false
            },

            meta: {
                type: Sequelize.JSON,
                allowNull: true,
                comment: 'Gateway response / debug info'
            }
        },
        {
            timestamps: true,
            createdAt: 'created_at',
            updatedAt: false,
            indexes: [
                { fields: ['wallet_id'] },
                { fields: ['reference_id'] },
                { fields: ['transaction_type'] }
            ]
        }
    );

    return WalletTransaction;
};
