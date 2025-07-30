const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  port: process.env.PGPORT,
  ssl: { rejectUnauthorized: false } // important pour Render
});

// Vérifie la connexion
pool.connect()
  .then(() => console.log('✅ Connexion PostgreSQL réussie'))
  .catch(err => {
    console.error('❌ Connexion PostgreSQL échouée :', err.message);
    process.exit(1);
  });

module.exports = pool;
