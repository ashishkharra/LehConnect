// utils/wallet.js
const db = require('../../models/index')
const randomstring = require('../utils/helper')

const getOrCreateWallet = async ({ user_token, role }) => {
  let wallet = await db.wallet.findOne({
    where: { user_token, role, status: 'ACTIVE' }
  });

  if (!wallet) {
    wallet = await db.wallet.create({
      token: randomstring(64),
      user_token,
      role,
      balance: 0,
      currency: 'INR'
    });
  }

  return wallet;
};

module.exports = getOrCreateWallet
