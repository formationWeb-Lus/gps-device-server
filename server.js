// 🌍 Chargement des variables d'environnement
require('dotenv').config();

// 📦 Dépendances principales
const express = require('express');
const net = require('net');
const { Pool } = require('pg');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { verifyVehiculeToken, verifyUserToken } = require('./auth/verifyVehiculeToken');


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

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    require: true,
    rejectUnauthorized: false
  }
});


pool.connect()
  .then(client => {
    console.log('✅ Connexion PostgreSQL réussie');
    client.release();
    startServers();
  })
  .catch(err => {
    console.error('❌ Connexion PostgreSQL échouée :', err.message);
    process.exit(1);
  });

  app.get('/api/positions/user', verifyUserToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query('SELECT * FROM positions WHERE userid = $1 ORDER BY timestamp DESC', [userId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// 📍 Route non sécurisée - Donne les infos à partir du numéro de téléphone
app.post('/api/positions/user', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ message: 'Numéro de téléphone requis' });
  try {
    const userResult = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    if (userResult.rows.length === 0) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    const user = userResult.rows[0];
    const vehicules = await pool.query('SELECT vehiculeid FROM vehicules WHERE user_id = $1 LIMIT 1', [user.id]);
    if (vehicules.rows.length === 0) return res.status(404).json({ message: 'Aucun véhicule associé' });
    user.vehiculeid = vehicules.rows[0].vehiculeid;
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// 📍 Route pour vérifier l'utilisateur par téléphone
app.post('/api/users', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ message: 'Téléphone requis' });
  try {
    const userResult = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    if (userResult.rows.length === 0) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    const user = userResult.rows[0];
    const vehicules = await pool.query('SELECT vehiculeid FROM vehicules WHERE user_id = $1', [user.id]);
    res.json({ user, vehicules: vehicules.rows.map(v => v.vehiculeid) });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// 📍 Génération de token pour un véhicule
app.post('/api/vehicules-token', async (req, res) => {
  const { vehiculeId } = req.body;
  if (!vehiculeId) return res.status(400).json({ message: 'vehiculeId requis' });
  try {
    const result = await pool.query('SELECT user_id FROM vehicules WHERE vehiculeid = $1', [vehiculeId]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Véhicule non trouvé' });
    const userId = result.rows[0].user_id;
    const token = jwt.sign({ vehiculeId, userId }, process.env.JWT_SECRET || 'secret', { expiresIn: '4h' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});


// 🧠 Calcul de distance Haversine
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
async function getAddress(lat, lon) {
  try {
    const res = await axios.get('https://api.opencagedata.com/geocode/v1/json', {
      params: {
        key: process.env.OPENCAGE_API_KEY,
        q: `${lat},${lon}`,
        language: 'fr',
        no_annotations: 1
      }
    });

    const result = res.data.results[0];
    const components = result.components || {};

    const quartier =
      components.suburb ||
      components.neighbourhood ||
      components.city_district ||
      components.village ||
      components.town ||
      components.county ||
      '';

    const ville =
      components.city ||
      components.town ||
      components.village ||
      components.county ||
      '';

    const code_postal = components.postcode || 'Non disponible';

    const adresse_formatee = result.formatted || "Adresse inconnue";

    return {
      numero: components.house_number || '',
      rue: components.road || '',
      quartier: quartier || 'Inconnu',
      ville,
      comte: components.county || '',
      region: components.state || '',
      code_postal,
      pays: components.country || '',
      adresse_formatee
    };
  } catch (err) {
    console.error('❌ Erreur OpenCage:', err.message);
    return {
      numero: '',
      rue: '',
      quartier: 'Erreur',
      ville: '',
      comte: '',
      region: '',
      code_postal: 'Erreur',
      pays: '',
      adresse_formatee: 'Adresse inconnue'
    };
  }
}


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
        await pool.query(`INSERT INTO stops (vehiculeId, userId, latitude, longitude, timestamp, quartier, avenue, duration_seconds) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [currentStop.vehiculeId, currentStop.userId, currentStop.lat, currentStop.lon, currentStop.start, currentStop.quartier, currentStop.rue, Math.round(duration)]);
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

  await pool.query(`INSERT INTO historiques (vehiculeid, userId, date, distance_km, start_time, end_time, total_stops, total_stop_time, positions) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [vehiculeId, userId, dateStr, totalDistance.toFixed(2), startStr, endStr, stops.length, `${Math.round(totalStopTime / 60)} min`, JSON.stringify(stops)]);

  positions = []; startTime = null; stops = []; currentStop = null; totalDistance = 0; totalStopTime = 0;
}

function startServers() {
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
        await pool.query(`INSERT INTO positions (vehiculeId, userId, latitude, longitude, vitesse, timestamp, quartier, rue, ville, comte, region, code_postal, pays) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [pos.vehiculeId, pos.userId, pos.latitude, pos.longitude, pos.vitesse, pos.timestamp, pos.quartier, pos.rue, pos.ville, pos.comte, pos.region, pos.code_postal, pos.pays]);
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

    socket.on('error', err => {
      console.error('💥 Erreur socket :', err.message);
    });
  });

  tcpServer.listen(PORT_TCP, () =>
    console.log(`✅ TCP tracker en écoute sur port ${PORT_TCP}`)
  );
  
// ✅ Déplacement ici :
setInterval(async () => {
  for (const [socket, info] of clients) {
    await saveHistoriqueIfNeeded(info.vehiculeId, info.userId);
    console.log(`⏱️ Historique périodique sauvegardé pour ${info.vehiculeId}`);
  }
}, 5 * 60 * 1000);

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

  if (!userId) {
    return res.status(401).json({ message: "Utilisateur non authentifié" });
  }

  // Récupérer la date et l'heure (format attendu : "YYYY-MM-DD HH:mm")
  const datetime = req.query.datetime; // exemple : "2025-07-15 10:30"

  try {
    let query = '';
    let params = [];

    if (datetime) {
      // Séparer date et time
      // ou tu peux faire un filtre exact sur timestamp/datetime selon ta table
      // Ici on suppose que ta table a une colonne 'date' (type DATE) et 'start_time' (type TIME)
      const [date, time] = datetime.split(' ');

      query = `
        SELECT * FROM historiques
        WHERE userId = $1 AND date = $2 AND start_time = $3
        ORDER BY date DESC
      `;
      params = [userId, date, time];
    } else {
      query = `
        SELECT * FROM historiques
        WHERE userId = $1
        ORDER BY date DESC
      `;
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
      positions: (() => {
        try {
          return JSON.parse(h.positions || '[]');
        } catch (e) {
          console.error('❌ JSON invalide pour positions :', h.positions);
          return [];
        }
      })(),
    }));

    if (data.length === 0) {
      return res.status(404).json({ message: 'Aucun historique trouvé' });
    }

    res.json(data);
  } catch (err) {
    console.error('❌ Erreur lors de la récupération des historiques :', err.message);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});


  app.listen(PORT_API, () =>
    console.log(`✅ API REST en écoute sur http://localhost:${PORT_API}`)
  );
}