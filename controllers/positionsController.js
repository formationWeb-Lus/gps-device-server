const pool = require('../models/db');

const getPositionsByUser = async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(
      'SELECT * FROM positions WHERE userid = $1 ORDER BY timestamp DESC',
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
};

const getUserByPhone = async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ message: 'Numéro de téléphone requis' });

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    if (userResult.rows.length === 0) return res.status(404).json({ message: 'Utilisateur non trouvé' });

    const user = userResult.rows[0];
    const vehicules = await pool.query('SELECT vehiculeid FROM vehicules WHERE user_id = $1 LIMIT 1', [user.id]);
    if (vehicules.rows.length === 0) return res.status(404).json({ message: 'Aucun véhicule associé' });

    user.vehiculeid = vehicules.rows[0].vehiculeid;
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
};

const getPositionsByVehicule = async (req, res) => {
  const { vehiculeId } = req.vehicule;
  try {
    const result = await pool.query('SELECT * FROM positions WHERE vehiculeId = $1', [vehiculeId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
};

module.exports = {
  getPositionsByUser,
  getUserByPhone,
  getPositionsByVehicule,
};
