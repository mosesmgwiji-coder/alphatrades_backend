const auth = require('./auth');

const admin = async (req, res, next) => {
  await auth(req, res, async () => {
    if (!req.user || !req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
};

module.exports = admin;
