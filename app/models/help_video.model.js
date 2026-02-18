module.exports = (sequelize, Sequelize) => {
  const Video = sequelize.define(
    'videos',
    {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },

      token: {
        type: Sequelize.STRING,
        allowNull: true
      },

      source_type: {
        type: Sequelize.ENUM('YOUTUBE', 'UPLOAD'),
        allowNull: true
      },

      video_url: {
        type: Sequelize.TEXT,
        allowNull: true
      },

      thumbnail: {
        type: Sequelize.STRING,
        allowNull: true
      },

      title: {
        type: Sequelize.STRING(255),
        allowNull: true
      },

      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },

      category: {
        type: Sequelize.STRING(100),
        allowNull: true
      },

      status: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },

      flag: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },

      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      },

      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      }
    },
    {
      tableName: 'videos',
      timestamps: false,
      underscored: true
    }
  );

  return Video;
};
