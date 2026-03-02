'use strict';

module.exports = (sequelize, DataTypes) => {

    const FlightEnquiry = sequelize.define('FlightEnquiry', {

        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },

        token: DataTypes.STRING,

        vendor_token: DataTypes.STRING,

        trip_type: {
            type: DataTypes.ENUM('oneway', 'round', 'multi'),
            defaultValue: 'oneway'
        },

        from_location: DataTypes.STRING,

        to_location: DataTypes.STRING,

        departure_date: DataTypes.DATEONLY,

        return_date: DataTypes.DATEONLY,

        adults: {
            type: DataTypes.INTEGER,
            defaultValue: 1
        },

        children: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },

        class_type: DataTypes.STRING,

        status: {
            type: DataTypes.ENUM('active', 'inactive'),
            defaultValue: 'active'
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