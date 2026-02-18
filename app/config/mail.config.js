const nodemailer = require('nodemailer');
const { transporterData } = require('./globals');

const transporter = nodemailer.createTransport({
    host: transporterData.host,
    port: transporterData.port,
    secure: transporterData.secure,
    auth: {
        user: transporterData.user,
        pass: transporterData.password,
    },
});

const sendMail = async (email, subject, mail) => {
    try {
        const info = await transporter.sendMail({
            from: transporterData.email,
            to: `${email}`,
            subject: `${subject}`,
            html: `${mail}`,
        });
    } catch (err) {
        throw err;
    }
}

module.exports = { sendMail };