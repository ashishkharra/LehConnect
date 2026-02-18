module.exports = (sequelize, Sequelize) => {
    const WalletHold = sequelize.define(
        'tbl_wallet_holds',
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
                allowNull: false
            },

            amount: {
                type: Sequelize.DECIMAL(14, 2),
                allowNull: false
            },

            reason: {
                type: Sequelize.STRING(255),
                allowNull: true,
                comment: 'ORDER_PLACED, BOOKING'
            },

            reference_id: {
                type: Sequelize.STRING(255),
                allowNull: true
            },

            status: {
                type: Sequelize.ENUM('HELD', 'RELEASED', 'CONSUMED'),
                allowNull: true,
                defaultValue: 'HELD'
            },

            flag: {
                type: Sequelize.BOOLEAN,
                defaultValue: false
            },

            expires_at: {
                type: Sequelize.DATE,
                allowNull: true
            }
        },
        {
            timestamps: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            indexes: [
                { fields: ['wallet_id'] },
                { fields: ['status'] }
            ]
        }
    );

    return WalletHold;
};
