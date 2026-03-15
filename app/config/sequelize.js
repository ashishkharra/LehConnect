const db = require('../models/index');
const { ENV } = require('../config/globals');

async function initializeDatabase() {
  try {
    await db.sequelize.authenticate();
    console.log('Database connection established successfully.');

    if (ENV === 'development') {
      console.log('Database synced with model changes (ALTER MODE).');
      await db.sequelize.sync();
    } else {
      console.log('Production mode: schema sync skipped.');
    }

    console.log('Database ready.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    process.exit(1);
  }
}

module.exports = initializeDatabase;