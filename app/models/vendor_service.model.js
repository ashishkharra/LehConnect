module.exports = (sequelize, Sequelize) => {
    const VendorService = sequelize.define("tbl_vendor_service", {
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },

        token: {
            type: Sequelize.STRING,
            allowNull: true,
            unique: true
        },

        vendor_token: {
            type: Sequelize.STRING,
            allowNull: true
        },

        service_token: {
            type: Sequelize.STRING,
            allowNull: true
        },

        create_date: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.NOW
        }

    }, {
        tableName: 'tbl_vendor_service',
        freezeTableName: true,
        timestamps: false,
        indexes: [
            {
                unique: true,
                fields: ['vendor_token', 'service_token']
            }
        ]
    });

    return VendorService;
};
