module.exports = (sequelize, Sequelize) => {
    const AccountDeleteRequest = sequelize.define("account_delete_request", {
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },

        token: {
            type: Sequelize.STRING(64),
            allowNull: true
        },

        vendor_token: {
            type: Sequelize.STRING,
            allowNull: true,
            comment: 'Unique token of the vendor requesting deletion'
        },

        reason: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: 'User provided reason for deleting the account'
        },

        status: {
            type: Sequelize.ENUM('PENDING', 'APPROVED', 'REJECTED'),
            defaultValue: 'PENDING',
            allowNull: true
        },

        admin_remark: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: 'Admin notes on why the request was accepted or rejected'
        },

        processed_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: 'Timestamp when admin took action'
        },

        create_date: {
            type: Sequelize.DATE,
            allowNull: true,
            defaultValue: Sequelize.NOW,
        },

        update_date: {
            type: Sequelize.DATE,
            allowNull: true,
            defaultValue: Sequelize.NOW,
        }

    }, {
        tableName: 'tbl_account_delete_request',
        freezeTableName: true,
        timestamps: true,
        createdAt: 'create_date',
        updatedAt: 'update_date',
    });

    return AccountDeleteRequest;
};