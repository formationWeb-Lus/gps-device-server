// ✅ routes/positions.js
const express = require('express');
const router = express.Router();
const {
  getAllPositions,
  getPositionsByUser,
  createPosition,
  updatePosition,
  deletePosition
} = require('../controllers/positionsController');

// Toutes les positions (admin seulement)
router.get('/', getAllPositions);

// Positions d'un utilisateur spécifique
router.get('/user/:userId', getPositionsByUser);

// Créer une nouvelle position
router.post('/', createPosition);

// Modifier une position
router.put('/:id', updatePosition);

// Supprimer une position
router.delete('/:id', deletePosition);

module.exports = router;
