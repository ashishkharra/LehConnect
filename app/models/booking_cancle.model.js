module.exports = (sequelize, Sequelize) => {
  return sequelize.define('tbl_booking_cancel', {
    token: {
      type: Sequelize.STRING(64),
      primaryKey: true,
      allowNull: true
    },
    booking_token: {
      type: Sequelize.STRING(64),
      allowNull: true
    },
    cancelled_by_token: {
      type: Sequelize.STRING(64),
      allowNull: true
    },
    cancelled_by_role: {
      type: Sequelize.ENUM('VENDOR', 'CUSTOMER'),
      allowNull: true
    },
    reason: {
      type: Sequelize.TEXT,
      allowNull: true
    }
  });
};
