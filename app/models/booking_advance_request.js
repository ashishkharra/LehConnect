module.exports = (sequelize, Sequelize) => {
  const BookingAdvanceRequest = sequelize.define(
    'booking_advance_request',
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

      booking_token: {
        type: Sequelize.STRING(64),
        allowNull: false
      },

      booking_request_token: {
        type: Sequelize.STRING(64),
        allowNull: false
      },

      owner_vendor_token: {
        type: Sequelize.STRING(64),
        allowNull: false
      },

      bidder_vendor_token: {
        type: Sequelize.STRING(64),
        allowNull: false
      },

      requested_advance_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },

      responded_advance_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },

      final_advance_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },

      currency: {
        type: Sequelize.STRING(10),
        allowNull: false,
        defaultValue: 'INR'
      },

      owner_message: {
        type: Sequelize.TEXT,
        allowNull: true
      },

      bidder_message: {
        type: Sequelize.TEXT,
        allowNull: true
      },

      status: {
        type: Sequelize.ENUM(
          'REQUESTED',
          'COUNTERED',
          'ACCEPTED',
          'REJECTED',
          'EXPIRED',
          'PAYMENT_PENDING',
          'PAID',
          'PAYMENT_FAILED',
          'CANCELLED'
        ),
        allowNull: false,
        defaultValue: 'REQUESTED'
      },

      requested_at: {
        type: Sequelize.DATE,
        allowNull: true
      },

      responded_at: {
        type: Sequelize.DATE,
        allowNull: true
      },

      accepted_at: {
        type: Sequelize.DATE,
        allowNull: true
      },

      expires_at: {
        type: Sequelize.DATE,
        allowNull: true
      },

      payment_status: {
        type: Sequelize.ENUM('UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUNDED'),
        allowNull: false,
        defaultValue: 'UNPAID'
      },

      payment_token: {
        type: Sequelize.STRING(64),
        allowNull: true
      },

      wallet_hold_token: {
        type: Sequelize.STRING(64),
        allowNull: true
      },

      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },

      flag: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      }
    },
    {
      tableName: 'tbl_booking_advance_requests',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      indexes: [
        { fields: ['token'] },
        { fields: ['booking_token'] },
        { fields: ['booking_request_token'] },
        { fields: ['owner_vendor_token'] },
        { fields: ['bidder_vendor_token'] },
        { fields: ['status'] },
        { fields: ['payment_status'] }
      ]
    }
  );

  return BookingAdvanceRequest;
};