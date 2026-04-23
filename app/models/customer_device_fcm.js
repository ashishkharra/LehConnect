module.exports = (sequelize, Sequelize) => {
    const CustomerDevice = sequelize.define("tbl_customer_device_fcm", {
        token: {
            type: Sequelize.STRING(64),
            allowNull: true
        },

        customer_token: {
            type: Sequelize.STRING(64),
            allowNull: true,
        },
        contact: {
            type: Sequelize.STRING(15),
            allowNull: true,
        },
        fcm_token: {
            type: Sequelize.TEXT,
            allowNull: true,
        },
        device_id: {
            type: Sequelize.STRING,
            allowNull: true
        },
        platform: {
            type: Sequelize.ENUM('android', 'ios'),
            defaultValue: 'android'
        }
    }, {
        indexes: [
            {
                unique: true,
                fields: ['customer_token', 'device_id']
            }
        ]
    });

    return CustomerDevice;
};