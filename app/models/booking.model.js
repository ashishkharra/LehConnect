module.exports = (sequelize, Sequelize) => {
  const Booking = sequelize.define(
    'booking',
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

      vendor_token: {
        type: Sequelize.STRING(64),
        allowNull: true
      },

      assigned_vendor_token: {
        type: Sequelize.STRING(64),
        allowNull: true
      },

      trip_type: {
        type: Sequelize.ENUM('ONE_WAY', 'ROUND_TRIP'),
        allowNull: true
      },

      vehicle_type: {
        type: Sequelize.STRING(50),
        allowNull: true
      },

      vehicle_name: {
        type: Sequelize.STRING,
        allowNull: true
      },

      pickup_datetime: {
        type: Sequelize.DATE,
        allowNull: true
      },

      return_datetime: {
        type: Sequelize.DATE,
        allowNull: true
      },

      pickup_location: {
        type: Sequelize.STRING,
        allowNull: true
      },

      drop_location: {
        type: Sequelize.STRING,
        allowNull: true
      },

      city: {
        type: Sequelize.STRING(50),
        allowNull: true
      },

      state: {
        type: Sequelize.STRING(50),
        allowNull: true
      },

      accept_type: {
        type: Sequelize.ENUM('INSTANT', 'APPROVAL', 'BID'),
        allowNull: true
      },

      booking_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },

      commission: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0
      },

      total_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },

      is_negotiable: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },

      visibility: {
        type: Sequelize.ENUM('PUBLIC', 'MY_NETWORK'),
        defaultValue: 'PUBLIC'
      },

      secure_booking: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },

      payment_status: {
        type: Sequelize.ENUM('PAID', 'UNPAID'),
        allowNull: true
      },

      completion_requested_by: {
        type: Sequelize.STRING(64),
        allowNull: true
      },

      completion_requested_at: {
        type: Sequelize.DATE,
        allowNull: true
      },

      completion_confirmed_by: {
        type: Sequelize.STRING(64),
        allowNull: true
      },

      completion_confirmed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },

      completion_rejected_at: {
        type: Sequelize.DATE,
        allowNull: true
      },

      completion_rejection_reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },

      auto_complete_at: {
        type: Sequelize.DATE,
        allowNull: true
      },

      completion_proof: {
        type: Sequelize.JSON,
        allowNull: true
      },

      completed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },

      extra_requirements: {
        type: Sequelize.JSON,
        allowNull: true
      },

      status: {
        type: Sequelize.ENUM(
          'OPEN',
          'ACCEPTED',
          'IN_PROGRESS',
          'COMPLETED',
          'CANCELLED',
          'EXPIRED',
          'REJECTED'
        ),
        defaultValue: 'OPEN'
      },

      flag: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      }
    },
    {
      tableName: 'tbl_booking',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      indexes: [
        { fields: ['token'] },
        { fields: ['vendor_token'] },
        { fields: ['assigned_vendor_token'] },
        { fields: ['status'] },
        { fields: ['trip_type'] },
        { fields: ['pickup_datetime'] }
      ]
    }
  );

  return Booking;
};