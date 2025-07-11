require('dotenv').config();
const express = require('express');
const net = require('net');
const { Pool } = require('pg');
const axios = require('axios');
const jwt = require('jsonwebtoken');

const app = express();
const PORT_API = process.env.PORT || 3000;
const PORT_TCP = 5055;
app.use(express.json());

// 🔐 Middleware pour vérifier le token JWT
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token manquant' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Token invalide' });
    req.user = user;
    next();
  });
}

// 🌐 Connexion PostgreSQL
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
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

// 🔐 Endpoint de connexion
app.post('/api/users', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ message: 'Téléphone requis' });

  try {
    const result = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Utilisateur non trouvé' });

    const user = result.rows[0];
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '2h' });

    res.json({ user, token });
  } catch (err) {
    console.error('❌ Erreur login :', err.message);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

let positions = [], startTime = null, currentStop = null, stops = [], totalDistance = 0, totalStopTime = 0;
const ADDRESS_CACHE_THRESHOLD = 0.0003;
let lastAddressCache = null, lastCoordsCache = null;

// 📐 Calcul de distance GPS
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371, toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 📍 Adresse depuis OpenStreetMap
async function getAddress(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`;
    const res = await axios.get(url, { headers: { 'User-Agent': 'gps-tracker' } });
    const a = res.data.address || {};
    let ville = a.city || a.town || a.village || '';
    let quartier = a.suburb || a.neighbourhood || a.hamlet || '';
    if (ville.toLowerCase() === 'diur') { quartier = ville; ville = 'Kolwezi'; }
    return {
      numero: a.house_number || '',
      rue: a.road || a.pedestrian || '',
      quartier,
      ville,
      comte: a.county || '',
      region: a.state || '',
      code_postal: a.postcode || '',
      pays: a.country || ''
    };
  } catch {
    return { quartier: '', rue: '', ville: '', comte: '', region: '', code_postal: '', pays: '' };
  }
}

// 🧠 Traitement de chaque position GPS
async function processPosition(pos) {
  if (!startTime) startTime = new Date(pos.timestamp);
  const last = positions.at(-1);
  positions.push(pos);

  if (last) {
    const dist = haversineDistance(pos.latitude, pos.longitude, last.latitude, last.longitude);
    totalDistance += dist;

    if (pos.vitesse <= 2 && !currentStop) {
      currentStop = { start: new Date(pos.timestamp), ...pos };
    } else if (currentStop && pos.vitesse > 2) {
      const stopEnd = new Date(pos.timestamp);
      const duration = (stopEnd - currentStop.start) / 1000;
      if (duration >= 10) {
        await pool.query(
          `INSERT INTO stops (vehiculeid, userid, latitude, longitude, timestamp, quartier, avenue, duration_seconds)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [pos.vehiculeId, pos.userId, pos.latitude, pos.longitude, pos.timestamp, pos.quartier, pos.rue, Math.round(duration)]
        );
        stops.push({
          latitude: pos.latitude,
          longitude: pos.longitude,
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

// 🧾 Sauvegarder l'historique à la fin
async function saveHistoriqueIfNeeded(vehiculeId, userId) {
  if (positions.length < 2) return;
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const startStr = startTime.toISOString().slice(11, 16);
  const endStr = now.toISOString().slice(11, 16);
  await pool.query(
    `INSERT INTO historiques (vehicule, userId, date, distance_km, start_time, end_time, total_stops, total_stop_time, positions)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [vehiculeId, userId, dateStr, totalDistance.toFixed(2), startStr, endStr, stops.length, `${Math.round(totalStopTime / 60)} min`, JSON.stringify(stops)]
  );
  positions = []; startTime = null; stops = []; currentStop = null; totalDistance = 0; totalStopTime = 0;
}

// 🚀 Lancement des serveurs
function startServers() {
  // 🔌 TCP SERVER
  const tcpServer = net.createServer(socket => {
    socket.on('data', async data => {
      try {
        const payload = data.toString().trim();
        const json = JSON.parse(payload.includes('\r\n\r\n') ? payload.split('\r\n\r\n')[1] : payload);
        const { latitude, longitude, speed = 0 } = json.location.coords;
        const vehiculeId = json.device_id || 'Toyota';
        const userId = json.userId || 1;

        const now = Date.now();
        const shouldUpdate = !lastCoordsCache || Math.abs(latitude - lastCoordsCache.lat) > ADDRESS_CACHE_THRESHOLD;

        if (shouldUpdate) {
          lastAddressCache = await getAddress(latitude, longitude);
          lastCoordsCache = { lat: latitude, lon: longitude, timestamp: now };
          await new Promise(r => setTimeout(r, 1000));
        }

        const pos = {
          userId,
          vehiculeId,
          latitude,
          longitude,
          vitesse: speed,
          timestamp: json.location.timestamp,
          ...lastAddressCache,
        };

        await processPosition(pos);

        await pool.query(
          `INSERT INTO positions (vehiculeid, userid, latitude, longitude, vitesse, timestamp, quartier, rue, ville, comte, region, code_postal, pays)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [vehiculeId, userId, latitude, longitude, speed, json.location.timestamp, pos.quartier, pos.rue, pos.ville, pos.comte, pos.region, pos.code_postal, pos.pays]
        );

        console.log(`✅ [${vehiculeId}] Position enregistrée à ${pos.quartier} / ${pos.rue}`);
      } catch (err) {
        console.error('❌ Erreur TCP:', err.message);
      }
    });

    socket.on('end', async () => {
      await saveHistoriqueIfNeeded('Toyota', 1);
      console.log('📁 Traceur déconnecté. Historique sauvegardé.');
    });
  });

  tcpServer.listen(PORT_TCP, () => {
    console.log(`✅ TCP tracker en écoute sur port ${PORT_TCP}`);
  });

  // ✅ API REST : positions de l’utilisateur connecté
  app.get('/api/positions', verifyToken, async (req, res) => {
    const userId = req.user.id;

    try {
      const result = await pool.query('SELECT vehiculeid FROM users WHERE id = $1', [userId]);
      if (result.rows.length === 0) return res.status(404).json({ message: 'Utilisateur non trouvé' });

      const vehiculeId = result.rows[0].vehiculeid;
      const positions = await pool.query('SELECT * FROM positions WHERE vehiculeid = $1 ORDER BY timestamp ASC', [vehiculeId]);

      res.json(positions.rows);
    } catch (err) {
      res.status(500).json({ message: 'Erreur serveur', error: err.message });
    }
  });

  // ✅ Dernière position d’un véhicule
  app.get('/api/last-position/:vehiculeId', async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT * FROM positions WHERE vehiculeid = $1 ORDER BY timestamp DESC LIMIT 1',
        [req.params.vehiculeId]
      );
      if (result.rows.length === 0) return res.status(404).json({ message: 'Position non trouvée' });
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ message: 'Erreur serveur', error: err.message });
    }
  });

  app.listen(PORT_API, () => console.log(`✅ API REST prête sur http://localhost:${PORT_API}`));
}
