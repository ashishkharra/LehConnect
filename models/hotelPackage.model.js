'use strict';

module.exports = (sequelize, DataTypes) => {

const HotelEnquiry = sequelize.define('HotelEnquiry', {

id:{
type:DataTypes.INTEGER,
autoIncrement:true,
primaryKey:true
},

token:DataTypes.STRING,

vendor_token:DataTypes.STRING,

area:DataTypes.STRING,

check_in:DataTypes.DATEONLY,

check_out:DataTypes.DATEONLY,

adults:{
type:DataTypes.INTEGER,
defaultValue:1
},

children:{
type:DataTypes.INTEGER,
defaultValue:0
},

rooms:{
type:DataTypes.INTEGER,
defaultValue:1
},

status:{
type:DataTypes.ENUM('active','inactive'),
defaultValue:'active'
}

},

{

tableName:'tbl_hotel_enquiry',

timestamps:true,

createdAt:'create_date',

updatedAt:'update_date'

});

return HotelEnquiry;

};