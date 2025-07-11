const Position = require('../models/Position'); // ✅ Mongoose model
const pool = require('../config/db'); // ✅ Connexion PostgreSQL (pg)

// ✅ Récupère toutes les positions pour l'utilisateur connecté
const getAllPositions = async (req, res) => {
  const userId = req.user?.id; // récupéré depuis le JWT

  if (!userId) {
    return res.status(401).json({ message: 'Utilisateur non authentifié' });
  }

  try {
    // 🔍 Récupérer le vehiculeid lié à cet utilisateur depuis PostgreSQL
    const result = await pool.query('SELECT vehiculeid FROM users WHERE id = $1', [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Utilisateur introuvable en base' });
    }

    const vehiculeId = result.rows[0].vehiculeid;

    // 🔍 Récupérer les positions du véhicule lié
    const positions = await Position.find({ vehiculeId });

    return res.status(200).json(positions);
  } catch (err) {
    console.error('❌ Erreur lors de la récupération des positions :', err);
    return res.status(500).json({ message: 'Erreur serveur', error: err });
  }
};

// ✅ Récupère les positions pour un userId spécifique passé en URL
const getPositionsByUser = async (req, res) => {
  const userId = req.params.userId;

  try {
    // Vérifier le vehiculeid de cet utilisateur
    const result = await pool.query('SELECT vehiculeid FROM users WHERE id = $1', [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    const vehiculeId = result.rows[0].vehiculeid;

    const positions = await Position.find({ vehiculeId });

    return res.status(200).json(positions);
  } catch (err) {
    console.error('❌ Erreur getPositionsByUser :', err);
    return res.status(500).json({ message: 'Erreur serveur', error: err });
  }
};

// ✅ Crée une nouvelle position (utilisé par le traceur GPS)
const createPosition = async (req, res) => {
  const { vehiculeId, latitude, longitude, vitesse, timestamp } = req.body;

  const newPosition = new Position({
    vehiculeId,
    latitude,
    longitude,
    vitesse,
    timestamp,
  });

  try {
    await newPosition.save();
    return res.status(201).json({ message: '✅ Position enregistrée', data: newPosition });
  } catch (err) {
    console.error('❌ Erreur createPosition :', err);
    return res.status(400).json({ message: 'Erreur d’enregistrement', error: err });
  }
};

// ✅ Met à jour une position existante
const updatePosition = async (req, res) => {
  try {
    const updated = await Position.findByIdAndUpdate(req.params.id, req.body, { new: true });

    if (!updated) {
      return res.status(404).json({ message: 'Position non trouvée' });
    }

    return res.status(200).json({ message: 'Position mise à jour', data: updated });
  } catch (err) {
    console.error('❌ Erreur updatePosition :', err);
    return res.status(500).json({ message: 'Erreur mise à jour', error: err });
  }
};

// ✅ Supprime une position
const deletePosition = async (req, res) => {
  try {
    const deleted = await Position.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: 'Position non trouvée' });
    }

    return res.status(200).json({ message: 'Position supprimée avec succès' });
  } catch (err) {
    console.error('❌ Erreur deletePosition :', err);
    return res.status(500).json({ message: 'Erreur suppression', error: err });
  }
};

module.exports = {
  getAllPositions,
  getPositionsByUser,
  createPosition,
  updatePosition,
  deletePosition,
};
