module.exports = (sequelize, Sequelize) => {
    const Otp = sequelize.define(
        'otp',
        {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },

            contact: {
                type: Sequelize.STRING,
                allowNull: true
            },

            role: {
                type: Sequelize.ENUM('VENDOR', 'CUSTOMER'),
                allowNull: true
            },

            otp: {
                type: Sequelize.STRING,
                allowNull: true
            },

            valid_time: {
                type: Sequelize.INTEGER,
                allowNull: true
            },

            server_time: {
                type: Sequelize.BIGINT,
                allowNull: true
            },

            browser_address: {
                type: Sequelize.STRING,
                allowNull: true
            },

            user_ip: {
                type: Sequelize.STRING,
                allowNull: true
            },

            mac_address: {
                type: Sequelize.STRING,
                allowNull: true
            },

            otp_expire_time: {
                type: Sequelize.STRING,
                allowNull: true
            },

            create_date: {
                type: Sequelize.DATE,
                allowNull: true,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },

            status: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 1
            },

            flag: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0
            }
        },
        {
            tableName: 'tbl_otp',
            freezeTableName: true,
            timestamps: true,
            createdAt: 'create_date',
            updatedAt: false
        }
    );

    return Otp;
};
