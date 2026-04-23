module.exports = (sequelize, Sequelize) => {
    const CabEnquiry = sequelize.define('CabEnquiry', {

        id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },

        token: {
            type: Sequelize.STRING,
            defaultValue: null
        },

        vendor_token: {
            type: Sequelize.STRING,
            allowNull: true,
            defaultValue: null
        },

        customer_token: {
            type: Sequelize.STRING,
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

        trip_type: {
            type: Sequelize.ENUM('oneway', 'round_trip', 'local'),
            allowNull: false
        },

        from_location: {
            type: Sequelize.STRING,
            allowNull: true,
            defaultValue: null
        },

        to_location: {
            type: Sequelize.STRING,
            allowNull: true,
            defaultValue: null
        },

        departure_date: {
            type: Sequelize.DATE,
            allowNull: true,
            defaultValue: null
        },

        return_date: {
            type: Sequelize.DATE,
            allowNull: true,
            defaultValue: null
        },

        car_type: {
            type: Sequelize.STRING,
            allowNull: true,
            defaultValue: null
        },

        contact: {
            type: Sequelize.STRING,
            allowNull: true,
            defaultValue: null
        },

        status: {
            type: Sequelize.ENUM('active', 'inactive'),
            defaultValue: 'active'
        },

        flag: {
            type: Sequelize.INTEGER,
            defaultValue: 0
        }
    }, {
        tableName: 'tbl_cab_enquiry',
        timestamps: true,
        createdAt: 'create_date',
        updatedAt: 'update_date'
    });
    return CabEnquiry;
};