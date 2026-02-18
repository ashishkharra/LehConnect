module.exports = (sequelize, Sequelize) => {
    const VendorRating = sequelize.define('tbl_vendor_rating', {
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },

        vendor_token: {
            type: Sequelize.STRING,
            allowNull: true,
            onDelete: 'CASCADE'
        },

        customer_token: {
            type: Sequelize.STRING,
            allowNull: true
        },

        rating: {
            type: Sequelize.FLOAT,
            allowNull: false
        },

        comment: {
            type: Sequelize.TEXT,
            allowNull: true
        },

        created_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.NOW
        }
    }, {
        tableName: 'tbl_vendor_rating',
        freezeTableName: true,
        timestamps: false
    });

    return VendorRating;
};
