module.exports = (sequelize, Sequelize) => {

    const FlightEnquiry = sequelize.define('FlightEnquiry', {

        id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },

        token: {
            type: Sequelize.STRING,
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
            type: Sequelize.ENUM('oneway', 'round', 'multi'),
            defaultValue: 'oneway'
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
            type: Sequelize.DATEONLY,
            allowNull: true,
            defaultValue: null
        },

        return_date: {
            type: Sequelize.DATEONLY,
            allowNull: true,
            defaultValue: null
        },

        adults: {
            type: Sequelize.INTEGER,
            defaultValue: 1
        },

        children: {
            type: Sequelize.INTEGER,
            defaultValue: 0
        },

        class_type: {
            type: Sequelize.STRING,
            allowNull: true,
            defaultValue: null
        },

        segments: {
            type: Sequelize.JSON,
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

    },

        {

            tableName: 'tbl_flight_enquiry',

            timestamps: true,

            createdAt: 'create_date',

            updatedAt: 'update_date'

        });

    return FlightEnquiry;

};