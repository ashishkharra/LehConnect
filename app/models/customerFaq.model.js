module.exports = (sequelize, Sequelize) => {
    const FAQ = sequelize.define('tbl_faqs', {
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },

        token: {
            type: Sequelize.STRING,
            allowNull: true
        },

        question: {
            type: Sequelize.STRING,
            allowNull: true
        },

        answer: {
            type: Sequelize.TEXT,
            allowNull: true
        },

        status: {
            type: Sequelize.ENUM('active', 'inactive'),
            defaultValue: 'active'
        },

        position: {
            type: Sequelize.INTEGER,
            defaultValue: 0
        },

        created_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.NOW
        }

    }, {
        tableName: 'tbl_customer_faqs',
        timestamps: false
    });

    return FAQ;
};
