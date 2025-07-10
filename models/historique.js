const mongoose = require('mongoose');

const historiqueSchema = new mongoose.Schema({
  vehicule: { type: String, required: true },
  date: { type: String, required: true }, // format YYYY-MM-DD
  distance_km: { type: String, required: true },
  start_time: String,
  end_time: String,
  total_stops: Number,
  total_stop_time: String,
  positions: Array // tableau des arrêts
});

module.exports = mongoose.model('Historique', historiqueSchema);
