const { decryptRefreshToken, encryptRefreshToken, getDeviceHash, responseData } = require('../shared/utils/helper.js');
// db
const db = require('../models/index.js')
const Vendor = db.vendor
const Customer = db.customer
const Session = db.session

const authMiddleware = (req, res, next) => {
  if (req.session && req.session.user) {
    next();
  } else {
    res.redirect('/login');
  }
};

const vendorMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const refreshToken = req.headers["x-refresh-token"];

    if (!authHeader || !refreshToken) {
      return res.status(401).json(responseData("Unauthorized", { code: 'FORCE_LOGOUT' }, req, false));
    }

    const token = authHeader.split(" ")[1];

    // console.log('token middleware ->>> ', token)
    const deviceHash = getDeviceHash(req);

    const session = await Session.findOne({
      where: {
        user_token: token,
        revoked_at: null,
        device_hash: deviceHash,
      },
    });

    if (!session) {
      return res.status(401).json(responseData("Session expired", { code: 'FORCE_LOGOUT' }, req, false));
    }

    if (new Date() > new Date(session.expires_at)) {
      await Session.update(
        { revoked_at: new Date() },
        { where: { id: session.id } }
      );
      return res.status(401).json(responseData("Session expired", { code: 'FORCE_LOGOUT' }, req, false));
    }

    const decryptedRefresh = decryptRefreshToken(JSON.parse(session.session_token));

    if (decryptedRefresh !== refreshToken) {
      return res.status(401).json(responseData("Invalid session", { code: 'FORCE_LOGOUT' }, req, false));
    }

    const user = await Vendor.findOne({
      where: { token, flag: 0 },
    });

    if (!user) {
      return res.status(401).json(responseData("Unauthorized", {}, req, false));
    }

    await Session.update(
      { last_used_at: new Date() },
      { where: { id: session.id } }
    );

    req.user = user;
    req.dbSession = session;

    next();
  } catch (err) {
    console.error("Vendor middleware error:", err);
    return res.status(401).json(responseData("Unauthorized", {}, req, false));
  }
};

const customerMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const refreshToken = req.headers["x-refresh-token"];

    // console.log('xxxxxxxxxxxxxxx ', authHeader)
    // console.log('yyyyyyyyyyyyy  ', refreshToken)

    if (!authHeader || !refreshToken) {
      return res
        .status(401)
        .json(responseData("Unauthorized", { code: "FORCE_LOGOUT" }, req, false));
    }

    // console.log('yyyyyyyyyyyyy')

    const token = authHeader.split(" ")[1];
    const deviceHash = getDeviceHash(req);

    const session = await Session.findOne({
      where: {
        user_token: token,
        revoked_at: null,
        device_hash: deviceHash,
      },
    });

    if (!session) {
      return res
        .status(401)
        .json(responseData("Session expired", { code: "FORCE_LOGOUT" }, req, false));
    }

    if (new Date() > new Date(session.expires_at)) {
      await Session.update(
        { revoked_at: new Date() },
        { where: { id: session.id } }
      );

      return res
        .status(401)
        .json(responseData("Session expired", { code: "FORCE_LOGOUT" }, req, false));
    }

    const decryptedRefresh = decryptRefreshToken(
      JSON.parse(session.session_token)
    );

    if (decryptedRefresh !== refreshToken) {
      return res
        .status(401)
        .json(responseData("Invalid session", { code: "FORCE_LOGOUT" }, req, false));
    }

    const user = await Customer.findOne({
      where: { token, flag: 0 },
    });

    if (!user) {
      return res
        .status(401)
        .json(responseData("Unauthorized", {}, req, false));
    }

    await Session.update(
      { last_used_at: new Date() },
      { where: { id: session.id } }
    );

    req.user = user;
    req.dbSession = session;

    next();
  } catch (err) {
    console.error("Customer middleware error:", err);
    return res
      .status(401)
      .json(responseData("Unauthorized", {}, req, false));
  }
};

const verifiedOnly = (req, res, next) => {
  if (req.user.verification_status !== 'VERIFIED') {
    return res
      .status(403)
      .json(responseData('Complete verification first', {}, req, false));
  }
  next();
};


module.exports = { authMiddleware, vendorMiddleware, customerMiddleware, verifiedOnly };