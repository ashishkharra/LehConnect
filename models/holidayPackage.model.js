'use strict';

module.exports = (sequelize, DataTypes) => {

const HolidayPackageEnquiry = sequelize.define('HolidayPackageEnquiry', {

id: {
type: DataTypes.INTEGER,
autoIncrement: true,
primaryKey: true
},

token: {
type: DataTypes.STRING,
allowNull: true
},

vendor_token: {
type: DataTypes.STRING,
allowNull: true
},

from_city: {
type: DataTypes.STRING,
allowNull: false
},

to_city: {
type: DataTypes.STRING,
allowNull: false
},

departure_date: {
type: DataTypes.DATEONLY,
allowNull: false
},

adults: {
type: DataTypes.INTEGER,
defaultValue: 1
},

children: {
type: DataTypes.INTEGER,
defaultValue: 0
},

rooms: {
type: DataTypes.INTEGER,
defaultValue: 1
},

status: {
type: DataTypes.ENUM('active','inactive'),
defaultValue: 'active'
}

}, {

tableName: 'tbl_holiday_package_enquiry',

timestamps: true,

createdAt: 'create_date',

updatedAt: 'update_date'

});

return HolidayPackageEnquiry;

};