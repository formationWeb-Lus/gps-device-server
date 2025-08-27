// controllers/vehiculesController.js
const pool = require('../config/db'); // Connexion PostgreSQL
const jwt = require('jsonwebtoken');

// 🔹 Générer un token JWT basé sur un vehiculeId
const generateVehiculeToken = async (req, res) => {
  const { vehiculeId } = req.body;

  try {
    // Vérifier si l'ID du véhicule est fourni
    if (!vehiculeId) {
      return res.status(400).json({ message: "❌ vehiculeId requis" });
    }

    // Vérifier si le véhicule existe dans la base
    const result = await pool.query(
      "SELECT id, user_id, plate_number, model FROM vehicules WHERE vehiculeid = $1",
      [vehiculeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "❌ Véhicule non trouvé" });
    }

    const vehicule = result.rows[0];

    // Générer un token JWT contenant vehiculeId et userId
    const token = jwt.sign(
      { vehiculeId, userId: vehicule.user_id },
      process.env.JWT_SECRET || "secret123",
      { expiresIn: "4h" } // durée de validité
    );

    // Réponse avec détails
    res.json({
      message: "✅ Token généré avec succès",
      token,
      vehicule: {
        id: vehicule.id,
        vehiculeId,
        plate_number: vehicule.plate_number,
        model: vehicule.model,
        user_id: vehicule.user_id
      }
    });

  } catch (error) {
    console.error("Erreur generateVehiculeToken:", error.message);
    res.status(500).json({ message: "❌ Erreur serveur", error: error.message });
  }
};

module.exports = { generateVehiculeToken };
