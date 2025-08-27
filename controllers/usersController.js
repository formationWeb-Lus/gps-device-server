// controllers/usersController.js
const pool = require('../models/db'); // Connexion PostgreSQL
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || "secret123";

/**
 * 🔹 Connexion utilisateur par téléphone
 * Génère un JWT si l'utilisateur existe
 */
exports.loginUser = async (req, res) => {
  const { phone } = req.body;

  try {
    if (!phone) {
      return res.status(400).json({ message: "Numéro de téléphone requis" });
    }

    // Vérifier si l'utilisateur existe
    const result = await pool.query(
      "SELECT id, phone, name FROM users WHERE phone = $1",
      [phone]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Utilisateur introuvable" });
    }

    const user = result.rows[0];

    // Générer un token JWT
    const token = jwt.sign(
      { id: user.id, phone: user.phone },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Connexion réussie ✅",
      token,
      user
    });

  } catch (error) {
    console.error("Erreur loginUser:", error.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
};


/**
 * 🔹 Récupérer les infos de l'utilisateur connecté (via token)
 */
exports.getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id; // injecté par verifyUserToken

    const result = await pool.query(
      "SELECT id, phone, name FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error("Erreur getUserProfile:", error.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
};


/**
 * 🔹 Récupérer les véhicules associés à un utilisateur
 */
exports.getUserVehicles = async (req, res) => {
  try {
    const userId = req.user.id; // injecté par verifyUserToken

    const result = await pool.query(
      `SELECT v.id, v.plate_number, v.model, v.imei
       FROM vehicles v
       WHERE v.user_id = $1`,
      [userId]
    );

    res.json({
      userId,
      vehicles: result.rows
    });

  } catch (error) {
    console.error("Erreur getUserVehicles:", error.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
};


/**
 * 🔹 Lister tous les utilisateurs (admin ou debug)
 */
exports.getAllUsers = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, phone, name FROM users ORDER BY id ASC"
    );

    res.json(result.rows);

  } catch (error) {
    console.error("Erreur getAllUsers:", error.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
};
