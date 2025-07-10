require('dotenv').config();
const db = require('./index');
const fs = require('fs');
const path = require('path');

async function createTables() {
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'init.sql')).toString();
    await db.query(sql);
    console.log('✅ Tables créées avec succès.');
  } catch (err) {
    console.error('❌ Erreur lors de la création des tables :', err.message);
  } finally {
    db.end();
  }
}

createTables();
