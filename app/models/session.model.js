module.exports = (sequelize, Sequelize) => {
  const Session = sequelize.define(
    'tbl_sessions',
    {
      id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true
      },

      user_token: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Vendor or Customer token'
      },

      role: {
        type: Sequelize.ENUM('VENDOR', 'CUSTOMER'),
        allowNull: true
      },

      session_token: {
        type: Sequelize.STRING(512),
        allowNull: true,
        comment: 'Encrypted refresh token'
      },

      device_hash: {
        type: Sequelize.STRING(64),
        allowNull: true
      },

      ip: {
        type: Sequelize.STRING,
        allowNull: true
      },

      user_agent: {
        type: Sequelize.STRING,
        allowNull: true
      },

      expires_at: {
        type: Sequelize.DATE,
        allowNull: true
      },

      revoked_at: {
        type: Sequelize.DATE,
        allowNull: true
      },

      last_used_at: {
        type: Sequelize.DATE,
        allowNull: true
      }
    },
    {
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      indexes: [
        { fields: ['user_token'] },
        { fields: ['device_hash'] }
      ]
    }
  );

  return Session;
};
