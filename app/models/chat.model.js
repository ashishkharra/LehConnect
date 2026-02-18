module.exports = (sequelize, Sequelize) => {
    const Chat = sequelize.define("tbl_chat", {
        id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true
        },

        token: {
            type: Sequelize.STRING(64),
            allowNull: false,
            unique: true,
            comment: "Unique token for the chat message"
        },

        booking_token: {
            type: Sequelize.STRING(64),
            allowNull: false,
            comment: "Chat is linked to this booking"
        },

        sender_token: {
            type: Sequelize.STRING(64),
            allowNull: false,
            comment: "Who sent this message"
        },

        receiver_token: {
            type: Sequelize.STRING(64),
            allowNull: false,
            comment: "Who receives this message"
        },

        message: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: "Text message content"
        },

        message_type: {
            type: Sequelize.ENUM("TEXT", "IMAGE", "VIDEO", "FILE", "LOCATION"),
            defaultValue: "TEXT",
            allowNull: false
        },

        attachment_url: {
            type: Sequelize.STRING,
            allowNull: true,
            comment: "URL to any attached file"
        },

        status: {
            type: Sequelize.ENUM("SENT", "DELIVERED", "SEEN"),
            defaultValue: "SENT",
            allowNull: false,
            comment: "Message status like WhatsApp"
        },

        is_deleted_by_sender: {
            type: Sequelize.BOOLEAN,
            defaultValue: false
        },

        is_deleted_by_receiver: {
            type: Sequelize.BOOLEAN,
            defaultValue: false
        },

        created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.NOW
        },

        updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.NOW
        }
    }, {
        tableName: "tbl_chat",
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
        indexes: [
            { fields: ["booking_token"] },
            { fields: ["sender_token"] },
            { fields: ["receiver_token"] },
            { fields: ["status"] }
        ]
    });

    return Chat;
};
