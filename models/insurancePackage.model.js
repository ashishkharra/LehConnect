'use strict';

module.exports = (sequelize, DataTypes) => {

const InsuranceEnquiry = sequelize.define('InsuranceEnquiry', {

id:{
type:DataTypes.INTEGER,
autoIncrement:true,
primaryKey:true
},

token:{
type:DataTypes.STRING
},

vendor_token:{
type:DataTypes.STRING
},

car_number:{
type:DataTypes.STRING
},

name:{
type:DataTypes.STRING
},

contact:{
type:DataTypes.STRING
},

agree_policy:{
type:DataTypes.BOOLEAN,
defaultValue:false
},

whatsapp:{
type:DataTypes.BOOLEAN,
defaultValue:false
},

status:{
type:DataTypes.ENUM('active','inactive'),
defaultValue:'active'
}

},

{

tableName:'tbl_insurance_enquiry',

timestamps:true,

createdAt:'create_date',

updatedAt:'update_date'

});

return InsuranceEnquiry;

};