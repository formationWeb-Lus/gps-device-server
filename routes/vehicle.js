const express = require('express');
const router = express.Router();
const Vehicle = require('../models/Vehicle');

// ➕ Ajouter un nouveau véhicule lié à un utilisateur
router.post('/', async (req, res) => {
  const { vehiculeId, userId } = req.body;

  if (!vehiculeId || !userId) {
    return res.status(400).json({ message: 'vehiculeId et userId sont requis' });
  }

  try {
    const existing = await Vehicle.findOne({ vehiculeId });

    if (existing) {
      return res.status(409).json({ message: 'Ce véhicule est déjà enregistré' });
    }

    const vehicle = new Vehicle({ vehiculeId, userId });
    await vehicle.save();

    res.status(201).json({ message: 'Véhicule enregistré avec succès', vehicle });
  } catch (err) {
    console.error('Erreur création véhicule :', err);
    res.status(500).json({ message: 'Erreur serveur', error: err });
  }
});

// 🔄 Récupérer tous les véhicules
router.get('/', async (req, res) => {
  try {
    const vehicles = await Vehicle.find();
    res.status(200).json(vehicles);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err });
  }
});

// 🔍 Récupérer tous les véhicules d’un utilisateur donné
router.get('/user/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const vehicles = await Vehicle.find({ userId });
    res.status(200).json(vehicles);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err });
  }
});

module.exports = router;
