module.exports = (sequelize, Sequelize) => {
  const CallsEnquiry = sequelize.define(
    "CallsEnquiry",
    {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },

      token: {
        type: Sequelize.STRING(64),
        allowNull: true,
        defaultValue: null,
      },

      enquiry_token: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      enquiry_type: {
        type: Sequelize.ENUM(
          "cab",
          "hotel",
          "flight",
          "holiday_package",
          "insurance"
        ),
        allowNull: false,
      },

      customer_token: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      called_by: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      call_type: {
        type: Sequelize.ENUM("incoming", "outgoing"),
        defaultValue: "outgoing",
        allowNull: false,
      },

      call_time: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
        allowNull: false,
      },

      status: {
        type: Sequelize.ENUM("success", "missed", "failed"),
        defaultValue: "success",
        allowNull: false,
      },
    },
    {
      tableName: "tbl_calls_enquiry",
      freezeTableName: true,
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        { unique: true, fields: ["token"] },
        { fields: ["enquiry_token"] },
        { fields: ["enquiry_type"] },
        { fields: ["customer_token"] },
        { fields: ["called_by"] },
        { fields: ["call_time"] },
        { fields: ["enquiry_token", "called_by"] },
      ],
    }
  );

  return CallsEnquiry;
};