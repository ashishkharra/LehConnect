const { api_key } = require('../config/globals');

function apiAuthMiddleware(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ status: 401, message: 'No bearer token provided.' });
    }

    const token = authHeader.split(' ')[1];

    if (api_key !== token) {
        return res.status(403).json({ status: 403, message: 'Invalid or expired token.' });
    }

    next();
}

module.exports = apiAuthMiddleware;
