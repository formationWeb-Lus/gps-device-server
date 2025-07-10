const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false
  },
});

// Vérifie la connexion
pool.connect()
  .then(() => console.log('✅ Connexion PostgreSQL réussie'))
  .catch(err => {
    console.error('❌ Connexion PostgreSQL échouée :', err.message);
    process.exit(1);
  });

module.exports = pool;
