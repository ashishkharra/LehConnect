module.exports = (sequelize, Sequelize) => {
  return sequelize.define('tbl_vendor_help_answer', {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },

    token: {
      type: Sequelize.STRING(64),
      unique: true
    },

    help_token: {
      type: Sequelize.STRING(64),
      allowNull: true
    },

    message: {
      type: Sequelize.TEXT,
      allowNull: true
    },

    create_date: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW
    }

  }, {
    tableName: 'tbl_vendor_help_answer',
    timestamps: false
  });
};
