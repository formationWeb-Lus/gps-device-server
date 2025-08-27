// config/db.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    require: true,
    rejectUnauthorized: false
  }
});

pool.connect()
  .then(() => console.log('✅ Connexion PostgreSQL réussie'))
  .catch(err => {
    console.error('❌ Connexion PostgreSQL échouée :', err.message);
    process.exit(1);
  });

module.exports = pool;
