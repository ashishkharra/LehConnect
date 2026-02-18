module.exports = (sequelize, Sequelize) => {
    const VendorDevice = sequelize.define("tbl_vendor_device_fcm", {
        token: {
            type: Sequelize.STRING(64),
            allowNull: true
        },

        vendor_token: {
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
                fields: ['vendor_token', 'device_id']
            }
        ]
    });

    return VendorDevice;
};