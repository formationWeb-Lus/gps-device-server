const express = require('express');
const router = express.Router();

// ✅ Contrôleurs de position
const {
  getAllPositions,        // Route pour admin (optionnel)
  getPositionsByUser,     // Route filtrée selon le user connecté
  createPosition,
  updatePosition,
  deletePosition
} = require('../controllers/positionController'); // ✅ NOM EXACT DU FICHIER

// 🔐 Middleware d’authentification par JWT
const verifyToken = require('../auth/verifyToken');

// ==========================
// 🔐 Récupérer positions du véhicule lié à l’utilisateur connecté
// ==========================
router.get('/', verifyToken, getAllPositions); // ✅ UTILISE getAllPositions car il lit req.user.id

// ==========================
// 🔄 Récupérer les positions d’un user spécifique (optionnel, pour admin)
// ==========================
router.get('/user/:userId', getPositionsByUser); // Sans token, car usage spécifique (peut être protégé aussi)

// ==========================
// ➕ Enregistrer une position (utilisé par le traceur GPS)
// ==========================
router.post('/', createPosition);

// ==========================
// ✏️ Modifier une position
// ==========================
router.put('/:id', updatePosition);

// ==========================
// ❌ Supprimer une position
// ==========================
router.delete('/:id', deletePosition);

// ==========================
// 🛡️ (Optionnel) Route admin pour toutes les positions
// ==========================
// router.get('/all', verifyToken, getAllPositions);

module.exports = router;
