module.exports = (sequelize, Sequelize) => {
  const ReferralHistory = sequelize.define(
    "ReferralHistory",
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
        defaultValue: "PENDING",
        allowNull: true
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: true
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: true
      }
    },
    {
      tableName: "referralhistories",
      timestamps: true
    }
  );

  return ReferralHistory;
};