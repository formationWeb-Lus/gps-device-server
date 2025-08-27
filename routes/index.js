const express = require('express');
const router = express.Router();

const { loginUser, getUserProfile, getUserVehicles } = require('../controllers/usersController');
const { generateVehiculeToken } = require('../controllers/vehiculesController');
const { getHistoriques } = require('../controllers/historiquesController');
const { verifyUserToken, verifyVehiculeToken } = require('../auth/verifyVehiculeToken');

// Users
router.post('/users/login', loginUser);
router.get('/users/me', verifyUserToken, getUserProfile);
router.get('/users/vehicles', verifyUserToken, getUserVehicles);

// Vehicules
router.post('/vehicules/token', generateVehiculeToken);

// Historiques
router.get('/historiques/:vehiculeId/:date', verifyVehiculeToken, getHistoriques);

module.exports = router;

