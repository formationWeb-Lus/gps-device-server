const mongoose = require('mongoose');

const positionSchema = new mongoose.Schema({
  userId: { type: String, required: true }, // ← 🔐 Identifiant de l'utilisateur propriétaire
  vehiculeId: { type: String, required: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  vitesse: { type: Number, required: true },
  timestamp: { type: Date, required: true },
  numero: String,
  rue: String,
  ville: String,
  quartier: String,
  comte: String,
  region: String,
  code_postal: String,
  pays: String
});

module.exports = mongoose.model('Position', positionSchema);
