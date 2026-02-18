module.exports = (sequelize, Sequelize) => {
  const BookingRequestRejection = sequelize.define(
    'booking_rejection',
    {
      id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true
      },

      token: {
        type: Sequelize.STRING(64),
        allowNull: true,
        unique: true
      },

      booking_token: {
        type: Sequelize.STRING(64),
        allowNull: true
      },

      rejected_by_token: {
        type: Sequelize.STRING(64),
        allowNull: true
      },

      rejected_by_role: {
        type: Sequelize.ENUM('VENDOR'),
        allowNull: true
      },

      reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },

      meta: {
        type: Sequelize.JSON,
        allowNull: true
      }
    },
    {
      tableName: 'tbl_booking_rejections',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
      indexes: [
        { fields: ['booking_token'] },
        { fields: ['rejected_by_token'] }
      ]
    }
  );

  return BookingRequestRejection;
};
