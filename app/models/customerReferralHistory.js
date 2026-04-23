module.exports = (sequelize, Sequelize) => {
  const CustomerReferralHistory = sequelize.define(
    "CustomerReferralHistory",
    {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
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
        defaultValue: 0.0
      },
      referee_amount: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0.0
      },
      status: {
        type: Sequelize.ENUM("PENDING", "PAID"),
        defaultValue: "PENDING"
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false
      }
    },
    {
      tableName: "customer_referral_history",
      timestamps: true
    }
  );

  return CustomerReferralHistory;
};