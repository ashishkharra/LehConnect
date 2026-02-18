// models/free_vehicle_cancel.js
module.exports = (sequelize, Sequelize) => {
  return sequelize.define('tbl_free_vehicle_cancel', {
    token: {
      type: Sequelize.STRING(64),
      primaryKey: true
    },
    free_vehicle_token: {
      type: Sequelize.STRING(64),
      allowNull: true
    },
    cancelled_by_vendor_token: {
      type: Sequelize.STRING(64),
      allowNull: true
    },
    reason: {
      type: Sequelize.TEXT,
      allowNull: true
    }
  });
};
