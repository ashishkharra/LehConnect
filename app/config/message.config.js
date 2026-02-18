const axios = require('axios');
const { randomstring } = require('../shared/utils/helper');

const apiUrl = '';
const apiUser = 'KISTECHNOSOFTWARE';
const api_authkey = '92hMAvpwqZ6ak';
const sender = 'KTSPLA';
// const entityid = 1701168553918957925n;
const templateid = 1707175026086887347n;

exports.sendMsg = async (phone) => {
    try {
        const otp = randomstring({ length: 6, type: 'numeric' });
        const sms_text = 'Use ' + otp + ' to verify your Atyourdoor-Mobile Repair. This OTP is valid for one-time use only. Keep it confidential. KTSPLA';
        const url = `${apiUrl}?user=${apiUser}&authkey=${api_authkey}&sender=${sender}&mobile=${phone}&text=${sms_text}&templateid=${templateid}&rpt=1`;

        await axios.get(url)
        return otp;
    } catch (error) {
        console.error('Error sending SMS:', error.response ? error.response.data : error.message);
    }
}