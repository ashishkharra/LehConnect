module.exports = (sequelize, Sequelize) => {

    const HolidayPackageEnquiry = sequelize.define('HolidayPackageEnquiry', {

        id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },

        token: {
            type: Sequelize.STRING(64),
            allowNull: true
        },

        vendor_token: {
            type: Sequelize.STRING,
            allowNull: true
        },

        from_city: {
            type: Sequelize.STRING,
            allowNull: true
        },

        to_city: {
            type: Sequelize.STRING,
            allowNull: true
        },

        departure_date: {
            type: Sequelize.DATEONLY,
            allowNull: true
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

    }, {

        tableName: 'tbl_holiday_package_enquiry',

        timestamps: true,

        createdAt: 'create_date',

        updatedAt: 'update_date'

    });

    return HolidayPackageEnquiry;

};