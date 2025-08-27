require('dotenv').config();
const express = require('express');
const net = require('net');
const mongoose = require('mongoose');
const axios = require('axios');

const app = express();
const PORT_API = process.env.PORT || 3000;
const PORT_TCP = 5055;

app.use(express.json());

if (!process.env.MONGODB_URI) {
  console.error("❌ ERREUR : la variable MONGODB_URI n'est pas définie.");
  process.exit(1);
}

let Position, Stop, Historique;
let positions = [];
let startTime = null;
let currentStop = null;
let stops = [];
let totalDistance = 0;
let totalStopTime = 0;

const ADDRESS_CACHE_THRESHOLD = 0.0003;
let lastAddressCache = null;
let lastCoordsCache = null;

const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const coordsChangedSignificantly = (lat1, lon1, lat2, lon2, threshold = ADDRESS_CACHE_THRESHOLD) => {
  return Math.abs(lat1 - lat2) > threshold || Math.abs(lon1 - lon2) > threshold;
};

async function waitForMongoReady(timeout = 15000) {
  const start = Date.now();
  while (mongoose.connection.readyState !== 1) {
    if (Date.now() - start > timeout) throw new Error('MongoDB timeout');
    await new Promise(res => setTimeout(res, 100));
  }
}

async function getAddress(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`;
    const res = await axios.get(url, { headers: { 'User-Agent': 'gps-tracker-ecolosie' } });
    const address = res.data.address || {};

    let ville = address.city || address.town || address.village || '';
    let quartier = address.suburb || address.city_district || address.neighbourhood || address.hamlet || '';

    if (ville.toLowerCase() === 'diur') {
      quartier = ville;
      ville = 'Kolwezi';
    }

    return {
      numero: address.house_number || '',
      rue: address.road || address.pedestrian || address.footway || address.highway || '',
      ville,
      quartier,
      comte: address.county || '',
      region: address.state || '',
      code_postal: address.postcode || '',
      pays: address.country || ''
    };
  } catch (error) {
    console.error('❌ Erreur géocodage inverse :', error.message);
    return {
      numero: '', rue: '', quartier: '', ville: '',
      comte: '', region: '', code_postal: '', pays: ''
    };
  }
}

async function processPosition(pos) {
  if (!startTime) startTime = new Date(pos.timestamp);
  const last = positions[positions.length - 1];
  positions.push(pos);

  if (last) {
    const dist = haversineDistance(pos.latitude, pos.longitude, last.latitude, last.longitude);
    totalDistance += dist;

    if (pos.vitesse <= 2) {
      if (!currentStop) {
        currentStop = {
          start: new Date(pos.timestamp),
          lat: pos.latitude,
          lon: pos.longitude
        };
      }
    } else if (currentStop) {
      const stopEnd = new Date(pos.timestamp);
      const duration = (stopEnd - currentStop.start) / 1000;

      if (duration >= 10) {
        await Stop.create({
          vehiculeId: pos.vehiculeId,
          userId: pos.userId,
          latitude: currentStop.lat,
          longitude: currentStop.lon,
          timestamp: currentStop.start,
          quartier: pos.quartier,
          avenue: pos.rue,
          duration_seconds: Math.round(duration)
        });

        stops.push({
          latitude: currentStop.lat,
          longitude: currentStop.lon,
          duree: `${Math.round(duration)} sec`,
          quartier: pos.quartier,
          avenue: pos.rue
        });

        totalStopTime += duration;
      }
      currentStop = null;
    }
  }
}

async function saveHistoriqueIfNeeded(vehiculeId, userId) {
  if (positions.length < 2) return;
  await waitForMongoReady();
  await Historique.create({
    vehicule: vehiculeId,
    userId,
    date: new Date().toISOString().slice(0, 10),
    distance_km: totalDistance.toFixed(2),
    start_time: startTime.toISOString().slice(11, 16),
    end_time: new Date().toISOString().slice(11, 16),
    total_stops: stops.length,
    total_stop_time: `${Math.round(totalStopTime / 60)} min`,
    positions: stops
  });
  positions = [];
  startTime = null;
  stops = [];
  currentStop = null;
  totalDistance = 0;
  totalStopTime = 0;
}

const tcpServer = net.createServer(socket => {
  console.log('📡 Traceur connecté :', socket.remoteAddress);

  socket.on('data', async data => {
    try {
      const payload = data.toString('utf8').trim();
      const jsonPart = payload.includes('\r\n\r\n') ? payload.split('\r\n\r\n')[1] : payload;
      const parsed = JSON.parse(jsonPart);

      const { latitude, longitude, accuracy = 9999, speed = 0 } = parsed.location.coords;
      const vehiculeId = parsed.device_id || 'Toyota';

      // 🔍 Charger le modèle Device pour récupérer userId depuis device_id
      const Device = require('./models/Device');
      const device = await Device.findOne({ device_id: vehiculeId });
      if (!device) {
        console.error('❌ Aucune correspondance device_id -> userId trouvée.');
        return;
      }
      const userId = device.user_id; // c’est un String maintenant

      const now = Date.now();

      const shouldUpdateAddress =
        !lastCoordsCache ||
        coordsChangedSignificantly(latitude, longitude, lastCoordsCache.lat, lastCoordsCache.lon) ||
        speed > 10 ||
        (now - (lastCoordsCache?.timestamp || 0)) > 30000;

      if (shouldUpdateAddress) {
        lastAddressCache = await getAddress(latitude, longitude);
        lastCoordsCache = { lat: latitude, lon: longitude, timestamp: now };
        await new Promise(res => setTimeout(res, 1000));
      }

      const pos = {
        userId: String(userId),
        vehiculeId,
        latitude,
        longitude,
        vitesse: speed,
        timestamp: parsed.location.timestamp,
        ...lastAddressCache
      };

      await processPosition(pos);
      await Position.create(pos);
      console.log(`✅ [${vehiculeId}] Position enregistrée à ${pos.quartier} / ${pos.rue}`);
    } catch (err) {
      console.error('❌ Erreur traitement TCP:', err);
    }
  });

  socket.on('end', async () => {
    console.log('📁 Traceur déconnecté. Historique sauvegardé.');
  });
});

app.get('/api/last-position/:vehiculeId', async (req, res) => {
  try {
    const position = await Position.findOne({ vehiculeId: req.params.vehiculeId }).sort({ timestamp: -1 });
    if (!position) return res.status(404).json({ message: 'Position non trouvée.' });
    res.json(position);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur.', error: err.message });
  }
});

app.get('/api/rapport/:vehiculeId/:date', async (req, res) => {
  try {
    const rapport = await Historique.findOne({ vehicule: req.params.vehiculeId, date: req.params.date });
    if (!rapport) return res.status(404).json({ message: 'Aucun rapport trouvé.' });
    res.json(rapport);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur.', error: err.message });
  }
});

app.get('/api/stats/:vehiculeId/:date', async (req, res) => {
  try {
    const historique = await Historique.findOne({ vehicule: req.params.vehiculeId, date: req.params.date });
    if (!historique) return res.status(404).json({ message: 'Aucune donnée trouvée.' });
    res.json({
      vehiculeId: req.params.vehiculeId,
      date: req.params.date,
      distance_parcourue_km: historique.distance_km,
      nombre_arrets: historique.total_stops,
      temps_total_arret: historique.total_stop_time
    });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur.', error: err.message });
  }
});

async function startServers() {
  console.log('🟡 Connexion à MongoDB...');
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10
    });
    console.log('✅ Connexion MongoDB réussie');

    Position = require('./models/Position');
    Stop = require('./models/Stop');
    Historique = require('./models/Historique');
    console.log('✅ Modèles Mongoose chargés');

    tcpServer.listen(PORT_TCP, () => console.log(`✅ TCP tracker en écoute sur port ${PORT_TCP}`));
    app.listen(PORT_API, () => console.log(`✅ API REST prête sur http://localhost:${PORT_API}`));
  } catch (err) {
    console.error('❌ Connexion MongoDB échouée :', err.message);
    setTimeout(startServers, 5000);
  }
}

startServers();
