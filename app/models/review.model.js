module.exports = (sequelize, Sequelize) => {
    const review = sequelize.define('tbl_reviews', {
        id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },

        token: {
            type: Sequelize.STRING(64),
            unique: true
        },

        // Who gave the review
        review_by: {
            type: Sequelize.ENUM('CUSTOMER', 'VENDOR'),
            allowNull: true
        },

        reviewer_token: {
            type: Sequelize.STRING,
            allowNull: true
        },

        reviewer_name: {
            type: Sequelize.STRING(100),
            allowNull: true
        },

        reviewer_email: {
            type: Sequelize.STRING(150),
            allowNull: true
        },

        reviewer_avatar: {
            type: Sequelize.STRING(255),
            allowNull: true
        },

        review_for: {
            type: Sequelize.ENUM('VENDOR', 'PLATFORM', 'CUSTOMER'),
            allowNull: true
        },

        rating: {
            type: Sequelize.INTEGER,
            allowNull: false,
            validate: {
                min: 1,
                max: 5
            }
        },

        comment: {
            type: Sequelize.TEXT,
            allowNull: true
        },

        status: {
            type: Sequelize.ENUM('PENDING', 'APPROVED', 'REJECTED'),
            defaultValue: 'PENDING'
        },

        reject_reason: {
            type: Sequelize.TEXT,
            allowNull: true
        },

        is_active: {
            type: Sequelize.BOOLEAN,
            defaultValue: true
        },

        created_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.NOW
        },

        updated_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.NOW,
            onUpdate: Sequelize.NOW
        }

    }, {
        tableName: 'tbl_reviews',
        timestamps: false,
        indexes: [
            { fields: ['review_by'] },
            { fields: ['review_for'] },
            { fields: ['rating'] },
            { fields: ['status'] }
        ],
        hooks: {
            beforeCreate: (review) => {
                if (!review.token) {
                    const crypto = require('crypto');
                    review.token = crypto.randomBytes(32).toString('hex');
                }
            }
        }
    });

    review.getCustomerReviews = async function (filters = {}) {
        return await this.findAll({
            where: {
                review_by: 'CUSTOMER',
                ...filters
            },
            order: [['created_at', 'DESC']]
        });
    };

    review.getVendorReviews = async function (filters = {}) {
        return await this.findAll({
            where: {
                review_by: 'VENDOR',
                ...filters
            },
            order: [['created_at', 'DESC']]
        });
    };

    review.updateStatus = async function (id, status, reason = null) {
        return await this.update(
            { status, reject_reason: reason },
            { where: { id } }
        );
    };

    review.getStats = async function () {
        const total_customer_reviews = await this.count({ where: { review_by: 'CUSTOMER' } });
        const total_vendor_reviews = await this.count({ where: { review_by: 'VENDOR' } });
        const PENDING_reviews = await this.count({ where: { status: 'PENDING' } });

        const avg = await this.findOne({
            attributes: [[Sequelize.fn('AVG', Sequelize.col('rating')), 'average_rating']],
            raw: true
        });

        return {
            total_customer_reviews,
            total_vendor_reviews,
            PENDING_reviews,
            average_rating: Number(avg.average_rating || 0).toFixed(1)
        };
    };

    return review;
};
