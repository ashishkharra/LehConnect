module.exports = (sequelize, Sequelize) => {
    const ReferralSetting = sequelize.define('tbl_referralSetting', {
        referrer_bonus: {
            type: Sequelize.DECIMAL(10, 2),
            defaultValue: 500.00
        },
        referee_bonus: {
            type: Sequelize.DECIMAL(10, 2),
            defaultValue: 100.00
        }
    });
    return ReferralSetting;
};