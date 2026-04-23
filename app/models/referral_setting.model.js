module.exports = (sequelize, Sequelize) => {
  const ReferralSetting = sequelize.define(
    "ReferralSetting",
    {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      referrer_bonus: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 500.0
      },
      referee_bonus: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 100.0
      }
    },
    {
      tableName: "tbl_referralsettings",
      timestamps: true
    }
  );

  return ReferralSetting;
};