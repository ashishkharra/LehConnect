const db = require('../models/index');
const { ENV } = require('../config/globals');

async function initializeDatabase() {
  try {
    await db.sequelize.authenticate();
    console.log('Database connection established successfully.');

    // if (ENV !== 'production') {
    //   await db.sequelize.sync({
    //     alter: false
    //   });
    //   console.log('Database synced with model changes (ALTER MODE).');
    // } else {
    //   console.log('Production mode: schema sync skipped.');
    // }

    console.log('Database ready.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    process.exit(1);
  }
}

module.exports = initializeDatabase;