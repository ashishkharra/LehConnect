module.exports = (sequelize, Sequelize) => {
  const Vehicle = sequelize.define(
    "Vehicle",
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
        unique: true,
      },

      name: {
        type: Sequelize.STRING(100),
        allowNull: true,
        validate: {
          notEmpty: true,
          len: [2, 100],
        },
      },

      type: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },

      seater: {
        type: Sequelize.INTEGER,
        allowNull: true,
        validate: {
          min: 1,
          max: 20,
          isInt: true,
        },
      },

      avg_per_km: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true,
        validate: {
          min: 1,
          max: 50,
        },
      },

      ac: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        allowNull: true,
      },

      gps: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: true,
      },

      availability: {
        type: Sequelize.ENUM("available", "booked", "maintenance"),
        defaultValue: "available",
        allowNull: true,
      },

      image1: {
        type: Sequelize.STRING(500),
        allowNull: true,
        defaultValue: null,
        field: "image1",
      },

      image2: {
        type: Sequelize.STRING(500),
        allowNull: true,
        defaultValue: null,
        field: "image2",
      },

      status: {
        type: Sequelize.ENUM("active", "inactive"),
        defaultValue: "active",
        allowNull: true,
      },
    },
    {
      tableName: "tbl_vehicles",
      freezeTableName: true,
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        { unique: true, fields: ["token"] },
        { fields: ["name"] },
        { fields: ["type"] },
        { fields: ["availability"] },
        { fields: ["status"] },
        { fields: ["type", "availability"] },
        { fields: ["seater"] },
      ],
    }
  );

  return Vehicle;
};