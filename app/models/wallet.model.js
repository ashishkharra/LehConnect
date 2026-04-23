module.exports = (sequelize, Sequelize) => {
  const Wallet = sequelize.define(
    'tbl_wallets',
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

      user_token: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'User unique token (customer/vendor)'
      },

      role: {
        type: Sequelize.ENUM('CUSTOMER', 'VENDOR'),
        allowNull: true
      },

      wallet_balance: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0.00,
        comment: 'Current wallet balance'
      },

      referral_balance: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0.00,
        comment: 'Current referral balance'
      },

      total_balance: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0.00,
        comment: 'Current balance'
      },

      currency: {
        type: Sequelize.STRING(10),
        allowNull: true,
        defaultValue: 'INR'
      },

      status: {
        type: Sequelize.ENUM('ACTIVE', 'FROZEN', 'CLOSED'),
        allowNull: true,
        defaultValue: 'ACTIVE'
      },

      flag: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },

      last_transaction_at: {
        type: Sequelize.DATE,
        allowNull: true
      }
    },
    {
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      indexes: [
        { fields: ['user_token'] },
        { fields: ['status'] }
      ]
    }
  );

  return Wallet;
};
