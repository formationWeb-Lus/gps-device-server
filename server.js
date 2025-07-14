require('dotenv').config();
const express = require('express');
const net = require('net');
const { Pool } = require('pg');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const verifyToken = require('./auth/verifyToken'); // ✅ Import du middleware

const app = express();
const PORT_API = process.env.PORT || 3000;
const PORT_TCP = 5055;

app.use(express.json());

// ✅ Connexion PostgreSQL
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

pool.connect()
  .then(client => {
    console.log('✅ Connexion PostgreSQL réussie');
    client.release();
    startServers(); // 🚀 Lancement TCP + API uniquement si la DB est OK
  })
  .catch(err => {
    console.error('❌ Connexion PostgreSQL échouée :', err.message);
    process.exit(1);
  });

// ✅ Endpoint de login utilisateur
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
    console.error('❌ Erreur /api/users :', err.message);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});


// 🧠 Variables de session de trajet
let positions = [], startTime = null, currentStop = null, stops = [], totalDistance = 0, totalStopTime = 0;
const ADDRESS_CACHE_THRESHOLD = 0.0003;
let lastAddressCache = null, lastCoordsCache = null;

// 📍 Fonctions utilitaires (distance, adresse, analyse...)
const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371, toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const coordsChangedSignificantly = (lat1, lon1, lat2, lon2, threshold = ADDRESS_CACHE_THRESHOLD) => {
  return Math.abs(lat1 - lat2) > threshold || Math.abs(lon1 - lon2) > threshold;
};

async function getAddress(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`;
    const res = await axios.get(url, { headers: { 'User-Agent': 'gps-tracker' } });
    const address = res.data.address || {};
    let ville = address.city || address.town || address.village || '';
    let quartier = address.suburb || address.city_district || address.neighbourhood || address.hamlet || '';
    if (ville.toLowerCase() === 'diur') { quartier = ville; ville = 'Kolwezi'; }
    return {
      numero: address.house_number || '',
      rue: address.road || '',
      ville, quartier,
      comte: address.county || '',
      region: address.state || '',
      code_postal: address.postcode || '',
      pays: address.country || ''
    };
  } catch {
    return { numero: '', rue: '', quartier: '', ville: '', comte: '', region: '', code_postal: '', pays: '' };
  }
}

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

  await pool.query(`INSERT INTO historiques (vehicule, userId, date, distance_km, start_time, end_time, total_stops, total_stop_time, positions) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [vehiculeId, userId, dateStr, totalDistance.toFixed(2), startStr, endStr, stops.length, `${Math.round(totalStopTime / 60)} min`, JSON.stringify(stops)]);

  positions = []; startTime = null; stops = []; currentStop = null; totalDistance = 0; totalStopTime = 0;
}

// 🚀 Fonction principale de démarrage des serveurs (TCP + HTTP)
function startServers() {
  const tcpServer = net.createServer(socket => {
    socket.on('data', async data => {
      try {
        const payload = data.toString('utf8').trim();
        const jsonPart = payload.includes('\r\n\r\n') ? payload.split('\r\n\r\n')[1] : payload;
        const parsed = JSON.parse(jsonPart);

        const { latitude, longitude, speed = 0 } = parsed.location.coords;
        const vehiculeId = parsed.device_id || 'Toyota';

        const result = await pool.query('SELECT id FROM users WHERE vehiculeid = $1', [vehiculeId]);
        if (result.rows.length === 0) return console.warn(`⚠️ Aucun utilisateur trouvé pour ${vehiculeId}`);
        const userId = result.rows[0].id;

        const now = Date.now();
        const shouldUpdateAddress =
          !lastCoordsCache ||
          coordsChangedSignificantly(latitude, longitude, lastCoordsCache.lat, lastCoordsCache.lon) ||
          speed > 10 || (now - (lastCoordsCache?.timestamp || 0)) > 30000;

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
      await saveHistoriqueIfNeeded('Toyota', 1);
      console.log('📁 Traceur déconnecté. Historique sauvegardé.');
    });
  });

  tcpServer.listen(PORT_TCP, () => console.log(`✅ TCP tracker en écoute sur port ${PORT_TCP}`));

  // 🌐 API REST - Routes sécurisées
  app.get('/api/positions', verifyToken, async (req, res) => {
  const userId = req.user.id;
  console.log('🔐 userId extrait du token :', userId); // 👈 utile pour debug

  try {
    const result = await pool.query(
      `SELECT * FROM positions WHERE userId = $1 ORDER BY timestamp ASC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Erreur PostgreSQL :', err.message);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});


  app.get('/api/last-positions/:vehiculeId', async (req, res) => {
    try {
      const result = await pool.query(`SELECT * FROM positions WHERE vehiculeId = $1 ORDER BY timestamp DESC LIMIT 1`, [req.params.vehiculeId]);
      if (result.rows.length === 0) return res.status(404).json({ message: 'Position non trouvée' });
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ message: 'Erreur serveur', error: err.message });
    }
  });

  app.get('/api/historiques', verifyToken, async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM historiques WHERE userId = $1 ORDER BY date DESC', [req.user.id]);
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ message: 'Erreur serveur', error: err.message });
    }
  });

  app.get('/api/historique', verifyToken, async (req, res) => {
    const { date } = req.query;
    if (!date) return res.status(400).json({ message: 'Date requise' });

    try {
      const result = await pool.query(`SELECT * FROM historiques WHERE userId = $1 AND date = $2 ORDER BY id DESC LIMIT 1`, [req.user.id, date]);
      if (result.rows.length === 0) return res.status(404).json({ message: 'Aucune donnée' });

      const h = result.rows[0];
      res.json({
        vehicule: h.vehicule,
        userId: h.userid,
        date: h.date,
        distance_km: parseFloat(h.distance_km),
        start_time: h.start_time,
        end_time: h.end_time,
        total_stops: h.total_stops,
        total_stop_time: h.total_stop_time,
        positions: JSON.parse(h.positions || '[]'),
      });
    } catch (err) {
      res.status(500).json({ message: 'Erreur serveur', error: err.message });
    }
  });

  // ✅ Lancement final
  app.listen(PORT_API, () => console.log(`✅ API REST en écoute sur http://localhost:${PORT_API}`));
}
