module.exports = (sequelize, Sequelize) => {
  const Admin = sequelize.define("admin", {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    token: {
      type: Sequelize.STRING(64),
      allowNull: true,
      unique: true
    },
    email: {
      type: Sequelize.STRING,
      allowNull: true,
      unique: true
    },
    username: {
      type: Sequelize.STRING,
      allowNull: true,
    },

    password: {
      type: Sequelize.STRING, // storedHash
      allowNull: true
    },

    salt: {
      type: Sequelize.STRING, // storedSalt (hex)
      allowNull: true
    },

    create_date: {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: Sequelize.NOW,
    },
    update_date: {
      type: Sequelize.DATE,
      allowNull: true,
    },
    profile_image: {
      type: Sequelize.STRING,
      allowNull: true,
    },
    status: {
      type: Sequelize.INTEGER,
      defaultValue: 1,
      allowNull: false,
    },
    flag: {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
  }, {
    tableName: 'tbl_admin',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'create_date',
    updatedAt: 'update_date'
  });

  return Admin;
};