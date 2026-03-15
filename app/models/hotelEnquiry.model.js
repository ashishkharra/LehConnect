module.exports = (sequelize, Sequelize) => {

    const HotelEnquiry = sequelize.define('HotelEnquiry', {

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

        area: {
            type: Sequelize.STRING,
            defaultValue: null
        },

        check_in: {
            type: Sequelize.DATEONLY,
            defaultValue: null
        },

        check_out: {
            type: Sequelize.DATEONLY,
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

        rooms: {
            type: Sequelize.INTEGER,
            defaultValue: 1
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

            tableName: 'tbl_hotel_enquiry',

            timestamps: true,

            createdAt: 'create_date',

            updatedAt: 'update_date'

        });

    return HotelEnquiry;

};