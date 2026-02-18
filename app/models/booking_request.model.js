module.exports = (sequelize, Sequelize) => {
  const BookingRequest = sequelize.define(
    "booking_request",
    {
      id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },

      token: {
        type: Sequelize.STRING(64),
        allowNull: true,
        unique: true,
      },

      booking_token: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },

      requested_by_vendor_token: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },

      owner_vendor_token: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },

      accept_type: {
        type: Sequelize.ENUM("INSTANT", "APPROVAL", "BID"),
        allowNull: true,
      },

      bid_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      },

      bid_currency: {
        type: Sequelize.STRING(5),
        defaultValue: "INR",
      },

      bid_valid_till: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      status: {
        type: Sequelize.ENUM("PENDING", "ACCEPTED", "REJECTED", "CANCELLED"),
        defaultValue: "PENDING",
      },

      responded_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      remarks: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      created_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null,
      },

      updated_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null,
      },
    },
    {
      tableName: "tbl_booking_requests",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        { fields: ["token"] },
        { fields: ["booking_token"] },
        { fields: ["requested_by_vendor_token"] },
        { fields: ["owner_vendor_token"] },
        { fields: ["status"] },
      ],
    },
  );

  return BookingRequest;
};
