module.exports = (sequelize, Sequelize) => {
  return sequelize.define('tbl_customer_help', {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },

    token: {
      type: Sequelize.STRING(64),
      unique: true,
      allowNull: true
    },

    customer_token: {
      type: Sequelize.STRING(64),
      allowNull: true
    },

    title: {
      type: Sequelize.STRING(255),
      allowNull: true
    },

    description: {
      type: Sequelize.TEXT,
      allowNull: true
    },

    category: {
      type: Sequelize.ENUM(
        'BOOKING',
        'PAYMENT',
        'VEHICLE',
        'ACCOUNT',
        'OTHER'
      ),
      defaultValue: 'OTHER'
    },

    status: {
      type: Sequelize.ENUM(
        'OPEN',
        'ANSWERED',
        'CLOSED'
      ),
      defaultValue: 'OPEN'
    },

    create_date: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW
    }

  }, {
    tableName: 'tbl_customer_help',
    timestamps: false
  });
};
