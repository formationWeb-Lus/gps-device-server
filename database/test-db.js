// backend/database/test-db.js
const pool = require('./index');

async function testConnection() {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('✅ Connexion PostgreSQL réussie :', res.rows[0]);
  } catch (err) {
    console.error('❌ Erreur de connexion PostgreSQL :', err.message);
  }
}

testConnection();
