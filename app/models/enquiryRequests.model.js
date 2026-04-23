module.exports = (sequelize, Sequelize) => {
    const EnquiryRequest = sequelize.define('EnquiryRequest', {
        id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },

        token: {
            type: Sequelize.STRING(64),
            allowNull: true,
            defaultValue: null
        },

        enquiry_type: {
            type: Sequelize.ENUM(
                'cab',
                'flight',
                'hotel',
                'holiday_package',
                'insurance'
            ),
            allowNull: false
        },

        enquiry_token: {
            type: Sequelize.STRING(64),
            allowNull: false
        },

        requester_token: {
            type: Sequelize.STRING(64),
            allowNull: false
        },

        vendor_token: {
            type: Sequelize.STRING(64),
            allowNull: true,
            defaultValue: null
        },

        who_posted: {
            type: Sequelize.STRING,
            allowNull: true,
            defaultValue: null
        },

        from_web: {
            type: Sequelize.BOOLEAN,
            defaultValue: false
        },

        amount: {
            type: Sequelize.FLOAT,
            allowNull: true,
            defaultValue: null
        },

        message: {
            type: Sequelize.TEXT,
            allowNull: true,
            defaultValue: null
        },

        contact: {
            type: Sequelize.STRING,
            allowNull: true,
            defaultValue: null
        },

        status: {
            type: Sequelize.ENUM(
                'PENDING',
                'ACCEPTED',
                'REJECTED',
                'CANCELLED',
                'BOOKED'
            ),
            defaultValue: 'PENDING'
        },

        meta: {
            type: Sequelize.JSON,
            allowNull: true,
            defaultValue: null
        },

        flag: {
            type: Sequelize.INTEGER,
            defaultValue: 0
        }
    }, {
        tableName: 'tbl_enquiry_requests',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            {
                name: 'idx_enquiry_type',
                fields: ['enquiry_type']
            },
            {
                name: 'idx_enquiry_token',
                fields: ['enquiry_token']
            },
            {
                name: 'idx_requester_token',
                fields: ['requester_token']
            },
            {
                name: 'idx_status',
                fields: ['status']
            },
            {
                name: 'uniq_enquiry_vendor_request',
                unique: true,
                fields: ['enquiry_type', 'enquiry_token', 'requester_token']
            }
        ]
    });

    return EnquiryRequest;
};