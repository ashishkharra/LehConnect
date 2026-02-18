module.exports = (sequelize, Sequelize) => {
    const Notification = sequelize.define("notification", {
        id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true
        },

        sender_token: {
            type: Sequelize.STRING,
            allowNull: true,
        },

        receiver_token: {
            type: Sequelize.STRING,
            allowNull: true,
        },

        receiver_role: {
            type: Sequelize.ENUM("vendor"),
            allowNull: true,
        },

        booking_token: {
            type: Sequelize.STRING,
            allowNull: true
        },

        free_vehicle_token: {
            type: Sequelize.STRING,
            allowNull: true
        },

        type: {
            type: Sequelize.STRING,
            allowNull: true,
            comment: `
            BOOKING_CREATED,
            BOOKING_ACCEPTED,
            FREE_VEHICLE_POSTED,
            WALLET_CREDITED,
            SYSTEM_ALERT
            `
        },

        title: {
            type: Sequelize.STRING,
            allowNull: true
        },

        message: {
            type: Sequelize.TEXT,
            allowNull: true
        },

        visibility: {
            type: Sequelize.ENUM("public", "private"),
            defaultValue: "public",
            allowNull: true
        },

        city: {
            type: Sequelize.STRING,
            allowNull: true
        },

        state: {
            type: Sequelize.STRING,
            allowNull: true
        },

        payload: {
            type: Sequelize.JSON,
            allowNull: true,
        },

        is_read: {
            type: Sequelize.BOOLEAN,
            defaultValue: false
        },

        flag: {
            type: Sequelize.INTEGER,
            defaultValue: 0,
        }

    }, {
        tableName: "tbl_notifications",
        freezeTableName: true,
        timestamps: true,
        createdAt: "create_date",
        updatedAt: "update_date",
        indexes: [
            { fields: ['receiver_token'] },
            { fields: ['receiver_role'] },
            { fields: ['is_read'] },
            { fields: ['type'] },
            { fields: ['create_date'] }
        ]
    });

    return Notification;
};
