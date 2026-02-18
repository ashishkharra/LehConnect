const sessMiddleware = (req, res, next) => {
    if (req.session && req.session.user) {
        return res.redirect('/');
    } else {
        next();
    }
}

module.exports = sessMiddleware;