// 🌍 Chargement des variables d'environnement
require('dotenv').config();

const express = require('express');
const net = require('net');
const cors = require('cors');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const pool = require('./models/db'); // connexion PostgreSQL
const routes = require('./routes'); // routes API existantes
const { verifyVehiculeToken } = require('./auth/verifyVehiculeToken');

const app = express();
const PORT_API = process.env.PORT || 3000;
const PORT_TCP = 5055;

// 🌐 Middleware CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// 🔄 Middleware JSON
app.use(express.json());

// 📍 Route test racine
app.get('/', (req, res) => {
  res.send('Bienvenue sur le serveur GPS RDC ✅');
});

// 📍 Routes API
app.use('/api', routes);

// ======================
// 🧠 Fonctions utilitaires
// ======================
const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371, toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const ADDRESS_CACHE_THRESHOLD = 0.0003;
let lastAddressCache = null, lastCoordsCache = null;

function coordsChangedSignificantly(lat1, lon1, lat2, lon2, threshold = ADDRESS_CACHE_THRESHOLD) {
  return Math.abs(lat1 - lat2) > threshold || Math.abs(lon1 - lon2) > threshold;
}

function getComponent(components, type) {
  const comp = components.find(c => c.types.includes(type));
  return comp ? comp.long_name : '';
}

async function getAddress(lat, lon) {
  let adresse = {
    numero: '',
    rue: '',
    quartier: '',
    ville: '',
    comte: '',
    region: '',
    code_postal: '',
    pays: '',
    adresse_formatee: 'Adresse inconnue'
  };

  try {
    // 1️⃣ Tentative Google Maps
    const gRes = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: { latlng: `${lat},${lon}`, key: process.env.GOOGLE_MAPS_API_KEY, language: 'fr' }
    });

    const gResults = gRes.data.results || [];

    function getComponent(components, type) {
      const comp = components.find(c => c.types.includes(type));
      return comp ? comp.long_name : '';
    }

    for (const result of gResults) {
      const components = result.address_components || [];

      if (!adresse.numero) adresse.numero = getComponent(components, 'street_number');
      if (!adresse.rue) adresse.rue = getComponent(components, 'route');
      if (!adresse.quartier) adresse.quartier = getComponent(components, 'sublocality_level_1') || getComponent(components, 'neighborhood');
      if (!adresse.ville) adresse.ville = getComponent(components, 'locality') || getComponent(components, 'administrative_area_level_3');
      if (!adresse.comte) adresse.comte = getComponent(components, 'administrative_area_level_2');
      if (!adresse.region) adresse.region = getComponent(components, 'administrative_area_level_1');
      if (!adresse.code_postal) adresse.code_postal = getComponent(components, 'postal_code');
      if (!adresse.pays) adresse.pays = getComponent(components, 'country');

      if (adresse.numero && adresse.rue && adresse.quartier && adresse.ville && adresse.comte && adresse.region && adresse.code_postal && adresse.pays) break;
    }

    if (gResults[0]?.formatted_address) adresse.adresse_formatee = gResults[0].formatted_address;

    // 2️⃣ Complément OpenStreetMap (Nominatim) si certains champs manquent
    if (!adresse.quartier || !adresse.rue || !adresse.code_postal) {
      const osmRes = await axios.get('https://nominatim.openstreetmap.org/reverse', {
        params: { lat, lon, format: 'json', addressdetails: 1, zoom: 18 },
        headers: { 'User-Agent': 'GPS-RDC-App/1.0' }
      });

      const osm = osmRes.data.address || {};
      if (!adresse.numero) adresse.numero = osm.house_number || adresse.numero;
      if (!adresse.rue) adresse.rue = osm.road || adresse.rue;
      if (!adresse.quartier) adresse.quartier = osm.suburb || osm.neighbourhood || adresse.quartier;
      if (!adresse.ville) adresse.ville = osm.city || osm.town || osm.village || adresse.ville;
      if (!adresse.comte) adresse.comte = osm.county || adresse.comte;
      if (!adresse.region) adresse.region = osm.state || adresse.region;
      if (!adresse.code_postal) adresse.code_postal = osm.postcode || adresse.code_postal;
      if (!adresse.pays) adresse.pays = osm.country || adresse.pays;

      if (osm.display_name) adresse.adresse_formatee = osm.display_name;
    }

    return adresse;

  } catch (err) {
    console.error('❌ Erreur Google+OSM:', err.message);
    return adresse;
  }
}




// ======================
// 🔄 Variables pour calcul trajet et stops
// ======================
let positions = [], startTime = null, currentStop = null, stops = [], totalDistance = 0, totalStopTime = 0;

async function processPosition(pos) {
  if (!startTime) startTime = new Date(pos.timestamp);
  const last = positions.length ? positions[positions.length - 1] : null;
  positions.push(pos);

  if (last) {
    const dist = haversineDistance(pos.latitude, pos.longitude, last.latitude, last.longitude);
    totalDistance += dist;

    if (pos.vitesse <= 2 && !currentStop) {
      currentStop = { start: new Date(pos.timestamp), lat: pos.latitude, lon: pos.longitude, quartier: pos.quartier, rue: pos.rue, vehiculeId: pos.vehiculeId, userId: pos.userId };
    } else if (currentStop && pos.vitesse > 2) {
      const stopEnd = new Date(pos.timestamp);
      const duration = (stopEnd - currentStop.start) / 1000;
      if (duration >= 10) {
        await pool.query(
          `INSERT INTO stops (vehiculeId, userId, latitude, longitude, timestamp, quartier, avenue, duration_seconds) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [currentStop.vehiculeId, currentStop.userId, currentStop.lat, currentStop.lon, currentStop.start, currentStop.quartier, currentStop.rue, Math.round(duration)]
        );
        stops.push({ latitude: currentStop.lat, longitude: currentStop.lon, duree: `${Math.round(duration)} sec`, quartier: currentStop.quartier, avenue: currentStop.rue });
        totalStopTime += duration;
      }
      currentStop = null;
    }
  }
}

async function saveHistoriqueIfNeeded(vehiculeId, userId) {
  if (positions.length < 2) return;
  const dateStr = new Date().toISOString().slice(0, 10);
  const startStr = startTime.toISOString().slice(11, 16);
  const endStr = new Date().toISOString().slice(11, 16);

  await pool.query(
    `INSERT INTO historiques (vehiculeid, userId, date, distance_km, start_time, end_time, total_stops, total_stop_time, positions)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [vehiculeId, userId, dateStr, totalDistance.toFixed(2), startStr, endStr, stops.length, `${Math.round(totalStopTime / 60)} min`, JSON.stringify(stops)]
  );

  positions = []; startTime = null; stops = []; currentStop = null; totalDistance = 0; totalStopTime = 0;
}

// ======================
// 🚗 TCP Tracker
// ======================
function startTCPServer() {
  const clients = new Map();

  const tcpServer = net.createServer(socket => {
    socket.on('data', async data => {
      try {
        const payload = data.toString('utf8').trim();
        const jsonPart = payload.includes('\r\n\r\n') ? payload.split('\r\n\r\n')[1] : payload;
        const parsed = JSON.parse(jsonPart);

        const { latitude, longitude, speed = 0 } = parsed.location.coords;
        const vehiculeId = parsed.device_id || 'Inconnu';

        const result = await pool.query(`
          SELECT users.id 
          FROM users 
          JOIN vehicules ON users.id = vehicules.user_id 
          WHERE vehicules.vehiculeid = $1
        `, [vehiculeId]);

        if (result.rows.length === 0) return console.warn(`⚠️ Aucun utilisateur trouvé pour ${vehiculeId}`);
        const userId = result.rows[0].id;

        clients.set(socket, { vehiculeId, userId });

        const now = Date.now();
        const shouldUpdateAddress = !lastCoordsCache || coordsChangedSignificantly(latitude, longitude, lastCoordsCache.lat, lastCoordsCache.lon) || speed > 10 || (now - (lastCoordsCache?.timestamp || 0)) > 30000;

        if (shouldUpdateAddress) {
          lastAddressCache = await getAddress(latitude, longitude);
          lastCoordsCache = { lat: latitude, lon: longitude, timestamp: now };
          await new Promise(res => setTimeout(res, 1000));
        }

        const pos = { userId, vehiculeId, latitude, longitude, vitesse: speed, timestamp: parsed.location.timestamp, ...lastAddressCache };
        await processPosition(pos);
        await pool.query(
          `INSERT INTO positions (vehiculeId, userId, latitude, longitude, vitesse, timestamp, quartier, rue, ville, comte, region, code_postal, pays)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [pos.vehiculeId, pos.userId, pos.latitude, pos.longitude, pos.vitesse, pos.timestamp, pos.quartier, pos.rue, pos.ville, pos.comte, pos.region, pos.code_postal, pos.pays]
        );
        console.log(`✅ [${vehiculeId}] Position enregistrée à ${pos.quartier} / ${pos.rue}`);
      } catch (err) {
        console.error('❌ Erreur TCP:', err.message);
      }
    });

    socket.on('end', async () => {
      const info = clients.get(socket);
      if (info) {
        await saveHistoriqueIfNeeded(info.vehiculeId, info.userId);
        console.log(`📁 Traceur ${info.vehiculeId} déconnecté. Historique sauvegardé.`);
        clients.delete(socket);
      }
    });

    socket.on('error', err => console.error('💥 Erreur socket :', err.message));
  });

  tcpServer.listen(PORT_TCP, () =>
    console.log(`✅ TCP tracker en écoute sur port ${PORT_TCP}`)
  );

  // 🕒 Sauvegarde périodique toutes les 5 minutes
  setInterval(async () => {
    for (const [socket, info] of clients) {
      await saveHistoriqueIfNeeded(info.vehiculeId, info.userId);
      console.log(`⏱️ Historique périodique sauvegardé pour ${info.vehiculeId}`);
    }
  }, 5 * 60 * 1000);
}

// ======================
// 🔄 Routes API positions et historiques
// ======================
app.get('/api/positions', verifyVehiculeToken, async (req, res) => {
  const { vehiculeId } = req.vehicule;
  try {
    const result = await pool.query(`SELECT * FROM positions WHERE vehiculeId = $1`, [vehiculeId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.get('/api/historiques', verifyVehiculeToken, async (req, res) => {
  const userId = req.vehicule?.userId || req.userId;
  if (!userId) return res.status(401).json({ message: "Utilisateur non authentifié" });

  const datetime = req.query.datetime;
  try {
    let query = '', params = [];
    if (datetime) {
      const [date, time] = datetime.split(' ');
      query = `SELECT * FROM historiques WHERE userId = $1 AND date = $2 AND start_time = $3 ORDER BY date DESC`;
      params = [userId, date, time];
    } else {
      query = `SELECT * FROM historiques WHERE userId = $1 ORDER BY date DESC`;
      params = [userId];
    }

    const result = await pool.query(query, params);

    const data = result.rows.map(h => ({
      vehiculeid: h.vehiculeid,
      userId: h.userid,
      date: h.date,
      distance_km: parseFloat(h.distance_km),
      start_time: h.start_time,
      end_time: h.end_time,
      total_stops: h.total_stops,
      total_stop_time: h.total_stop_time,
      positions: (() => { try { return JSON.parse(h.positions || '[]'); } catch { return []; } })(),
    }));

    if (data.length === 0) return res.status(404).json({ message: 'Aucun historique trouvé' });

    res.json(data);
  } catch (err) {
    console.error('❌ Erreur récupération historiques:', err.message);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// ======================
// 🚀 Lancement serveur après connexion PostgreSQL
// ======================
pool.connect()
  .then(client => {
    console.log('✅ Connexion PostgreSQL réussie');
    client.release();

    app.listen(PORT_API, () => 
      console.log(`✅ API REST en écoute sur http://localhost:${PORT_API}`)
    );

    startTCPServer();
  })
  .catch(err => {
    console.error('❌ Connexion PostgreSQL échouée :', err.message);
    process.exit(1);
  });
