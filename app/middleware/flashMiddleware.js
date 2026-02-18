module.exports = function (req, res, next) {
  if (!req.session.flash) {
    req.session.flash = {};
  }

  req.setFlash = (type, message) => {
    req.session.flash[type] = message;
  };

  res.getFlash = (type) => {
    const message = req.session.flash[type];
    delete req.session.flash[type];
    return message;
  };

  next();
};