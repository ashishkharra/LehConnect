module.exports = (sequelize, Sequelize) => {
  const VendorFreeVehicleRequest = sequelize.define(
    "vendor_free_vehicle_request",
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

      free_vehicle_token: {
        type: Sequelize.STRING(64),
        allowNull: true
      },

      requested_by_vendor_token: {
        type: Sequelize.STRING(64),
        allowNull: true
      },

      requested_start_time: {
        type: Sequelize.DATE,
        allowNull: true
      },

      requested_end_time: {
        type: Sequelize.DATE,
        allowNull: true
      },

      status: {
        type: Sequelize.ENUM(
          'PENDING',
          'ACCEPTED',
          'REJECTED',
          'CANCELLED',
          'EXPIRED'
        ),
        defaultValue: 'PENDING'
      },

      accepted_at: Sequelize.DATE,

      accepted_by_vendor_token: {
        type: Sequelize.STRING(64),
        allowNull: true
      },

      rejection_reason: {
        type: Sequelize.TEXT,
        allowNull: true
      }
    },
    {
      tableName: "tbl_vendor_free_vehicle_requests",
      timestamps: true,
      underscored: true,

      indexes: [
        {
          name: 'idx_fv_status',
          fields: ['free_vehicle_token', 'status']
        },
        {
          name: 'idx_requester_status',
          fields: ['requested_by_vendor_token', 'status']
        }
      ]
    }
  );

  return VendorFreeVehicleRequest;
};