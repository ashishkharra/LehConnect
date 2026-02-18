const db = require('../models/index');
const Admin = db.admin;

const userData = async (req, res, next) => {
    try {
        const publicRoutes = ['/', '/register', '/logout'];
        if (publicRoutes.includes(req.path)) return next();
        if (req.session.user) {
            const adminData = await Admin.findAll({
                attributes: ['username', 'email', 'profile_image'],
                where: {
                    token: req.session.user.token,
                }
            });

            if (!adminData) {
                return res.send("data not found")
            }
            if (req.session && req.session.user.token) {
                res.locals.admin = adminData[0];
            }
        }
        next();

    } catch (error) {
        console.log(error)
    }

}
module.exports = { userData }