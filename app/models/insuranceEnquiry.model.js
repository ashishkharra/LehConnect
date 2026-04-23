module.exports = (sequelize, Sequelize) => {

    const InsuranceEnquiry = sequelize.define('InsuranceEnquiry', {

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

        customer_token: {
            type: Sequelize.STRING,
            allowNull: true,
            defaultValue: null
        },

        vendor_token: {
            type: Sequelize.STRING,
            allowNull: true,
            defaultValue: null
        },

        from_web: {
            type: Sequelize.BOOLEAN,
            defaultValue: false
        },

        who_posted: {
            type: Sequelize.STRING,
            allowNull: true,
            defaultValue: null
        },

        car_number: {
            type: Sequelize.STRING,
            allowNull: true,
            defaultValue: null
        },

        name: {
            type: Sequelize.STRING,
            allowNull: true,
            defaultValue: null
        },

        contact: {
            type: Sequelize.STRING,
            allowNull: true,
            defaultValue: null
        },

        agree_policy: {
            type: Sequelize.BOOLEAN,
            defaultValue: false
        },

        whatsapp: {
            type: Sequelize.BOOLEAN,
            defaultValue: false
        },

        status: {
            type: Sequelize.ENUM('active', 'inactive'),
            defaultValue: 'active'
        },

        flag: {
            type: Sequelize.INTEGER,
            defaultValue: 0
        }
    },
        {
            tableName: 'tbl_insurance_enquiry',
            timestamps: true,
            createdAt: 'create_date',
            updatedAt: 'update_date'
        });
    return InsuranceEnquiry;
};