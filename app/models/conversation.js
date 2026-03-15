module.exports = (sequelize, Sequelize) => {
  const Conversation = sequelize.define(
    "tbl_conversation",
    {
      id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },

      token: {
        type: Sequelize.STRING(64),
        allowNull: true,
        unique: true,
        comment: "Unique token for the conversation",
      },

      booking_token: {
        type: Sequelize.STRING(64),
        allowNull: true,
        comment: "Booking linked to this conversation",
      },

      owner_token: {
        type: Sequelize.STRING(64),
        allowNull: true,
        comment: "Booking owner token",
      },

      requester_token: {
        type: Sequelize.STRING(64),
        allowNull: true,
        comment: "Vendor/requester token",
      },

      last_message_token: {
        type: Sequelize.STRING(64),
        allowNull: true,
        comment: "Last message token in this conversation",
      },

      last_message: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Last message preview text",
      },

      last_message_type: {
        type: Sequelize.ENUM("TEXT", "IMAGE", "VIDEO", "FILE", "LOCATION"),
        allowNull: true,
        comment: "Last message type",
      },

      last_message_sender_token: {
        type: Sequelize.STRING(64),
        allowNull: true,
        comment: "Who sent the last message",
      },

      last_message_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Timestamp of last message",
      },

      unread_count_owner: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Unread messages count for owner",
      },

      unread_count_requester: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Unread messages count for requester",
      },

      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: true,
        comment: "Whether conversation is active",
      },

      created_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.NOW,
      },

      updated_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.NOW,
      },
    },
    {
      tableName: "tbl_conversation",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        {
          unique: true,
          fields: ["booking_token", "owner_token", "requester_token"],
          name: "uniq_booking_owner_requester_conversation",
        },
        { fields: ["booking_token"] },
        { fields: ["owner_token"] },
        { fields: ["requester_token"] },
        { fields: ["last_message_at"] },
        { fields: ["is_active"] },
      ],
    }
  );

  return Conversation;
};