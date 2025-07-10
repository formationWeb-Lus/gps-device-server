const mongoose = require('mongoose');

const stopSchema = new mongoose.Schema({
  vehiculeId: { type: String, required: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  timestamp: { type: Date, required: true },
  quartier: String,
  avenue: String,
  duration_seconds: Number
});

module.exports = mongoose.model('Stop', stopSchema);
