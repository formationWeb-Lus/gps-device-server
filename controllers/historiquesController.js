// controllers/historiquesController.js
const pool = require('../config/db');

// Récupérer tous les historiques filtrés par userId et/ou date
const getHistoriques = async (req, res) => {
  try {
    const userId = req.user.id; // injecté par verifyToken
    const { startDate, endDate } = req.query;

    let query = 'SELECT * FROM historiques WHERE user_id = $1';
    let params = [userId];

    if (startDate && endDate) {
      query += ' AND date BETWEEN $2 AND $3';
      params.push(startDate, endDate);
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
};

module.exports = {
  getHistoriques, // <-- très important à exporter
};
