const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const pool = require('../db'); // adapte selon ton projet

router.post('/users', async (req, res) => {
  const { phone } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ message: 'Numéro non trouvé' });
    }

    const token = jwt.sign({ id: user.id, phone: user.phone }, process.env.JWT_SECRET, {
      expiresIn: '24h',
    });

    res.json({ user, token });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

module.exports = router;
