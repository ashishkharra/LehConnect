module.exports = (sequelize, Sequelize) => {
  const BookingRating = sequelize.define(
    'tbl_booking_rating',
    {
      id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true
      },

      token: {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true
      },

      booking_token: {
        type: Sequelize.STRING(64),
        allowNull: true,
        comment: 'Booking being rated'
      },

      rater_token: {
        type: Sequelize.STRING(64),
        allowNull: true,
        comment: 'Who is giving the rating'
      },

      ratee_token: {
        type: Sequelize.STRING(64),
        allowNull: true,
        comment: 'Who is being rated'
      },

      rater_role: {
        type: Sequelize.ENUM('CUSTOMER', 'VENDOR'),
        allowNull: true
      },

      ratee_role: {
        type: Sequelize.ENUM('CUSTOMER', 'VENDOR'),
        allowNull: true
      },

      stars: {
        type: Sequelize.INTEGER,
        allowNull: false,
        validate: {
          min: 1,
          max: 5
        },
        defaultValue: 5
      },

      comment: {
        type: Sequelize.TEXT,
        allowNull: true
      },

      is_public: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        comment: 'Visible in public reviews'
      },

      is_flagged: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: 'Flagged for abuse or review'
      },

      flagged_reason: {
        type: Sequelize.STRING,
        allowNull: true
      },

      created_ip: {
        type: Sequelize.STRING,
        allowNull: true
      },

      user_agent: {
        type: Sequelize.STRING,
        allowNull: true
      },

      status: {
        type: Sequelize.ENUM('ACTIVE', 'REMOVED'),
        defaultValue: 'ACTIVE'
      },

      flag: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      }
    },
    {
      tableName: 'tbl_booking_rating',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      indexes: [
        { fields: ['token'] },
        { fields: ['booking_token'] },
        { fields: ['rater_token'] },
        { fields: ['ratee_token'] },
        { fields: ['stars'] },
        {
          unique: true,
          fields: ['token','booking_token', 'rater_token'],
          name: 'unique_rating_per_booking_per_user'
        }
      ]
    }
  );

  return BookingRating;
};
