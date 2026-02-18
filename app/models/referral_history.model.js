module.exports = (sequelize, Sequelize) => {
    const ReferralHistory = sequelize.define('ReferralHistory', {
        referrer_id: {
            type: Sequelize.INTEGER,
            allowNull: false
        },
        referee_id: {
            type: Sequelize.INTEGER,
            allowNull: false
        },
        referrer_amount: {
            type: Sequelize.DECIMAL(10, 2),
            defaultValue: 0.00
        },
        referee_amount: {
            type: Sequelize.DECIMAL(10, 2),
            defaultValue: 0.00
        },
        status: {
            type: Sequelize.ENUM('PENDING', 'PAID'),
            defaultValue: 'PENDING'
        }
    });
    return ReferralHistory;
};