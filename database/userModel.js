// backend/database/userModel.js
const pool = require('./index'); // connexion pg

// Vérifier utilisateur par nom et téléphone
async function findUser(name, phone) {
  const result = await pool.query(
    'SELECT * FROM users WHERE name = $1 AND phone = $2',
    [name, phone]
  );
  return result.rows[0];
}

// Créer un nouvel utilisateur
async function createUser({ name, phone, firstname }) {
  const result = await pool.query(
    'INSERT INTO users (name, phone, firstname) VALUES ($1, $2, $3) RETURNING *',
    [name, phone, firstname]
  );
  return result.rows[0];
}

module.exports = {
  findUser,
  createUser,
};
