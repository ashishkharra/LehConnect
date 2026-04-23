module.exports = (sequelize, Sequelize) => {
  const BookingAdvanceRequestHistory = sequelize.define(
    'booking_advance_request_history',
    {
      id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true
      },

      token: {
        type: Sequelize.STRING(64),
        allowNull: false,
        unique: true
      },

      advance_request_token: {
        type: Sequelize.STRING(64),
        allowNull: false
      },

      booking_token: {
        type: Sequelize.STRING(64),
        allowNull: false
      },

      booking_request_token: {
        type: Sequelize.STRING(64),
        allowNull: false
      },

      actor_token: {
        type: Sequelize.STRING(64),
        allowNull: false
      },

      actor_role: {
        type: Sequelize.ENUM('OWNER', 'BIDDER', 'SYSTEM'),
        allowNull: false
      },

      action: {
        type: Sequelize.ENUM(
          'OWNER_REQUESTED_ADVANCE',
          'BIDDER_ACCEPTED_ADVANCE',
          'BIDDER_COUNTERED_ADVANCE',
          'BIDDER_REJECTED_ADVANCE',
          'OWNER_ACCEPTED_COUNTER',
          'OWNER_REJECTED_COUNTER',
          'OWNER_CANCELLED_REQUEST',
          'PAYMENT_INITIATED',
          'PAYMENT_SUCCESS',
          'PAYMENT_FAILED',
          'REQUEST_EXPIRED'
        ),
        allowNull: false
      },

      previous_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },

      amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },

      message: {
        type: Sequelize.TEXT,
        allowNull: true
      },

      meta: {
        type: Sequelize.JSON,
        allowNull: true
      },

      flag: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      }
    },
    {
      tableName: 'tbl_booking_advance_request_history',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
      indexes: [
        { fields: ['token'] },
        { fields: ['advance_request_token'] },
        { fields: ['booking_token'] },
        { fields: ['booking_request_token'] },
        { fields: ['actor_token'] },
        { fields: ['action'] }
      ]
    }
  );

  return BookingAdvanceRequestHistory;
};