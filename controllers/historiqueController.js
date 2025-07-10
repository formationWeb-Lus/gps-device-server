const Position = require('../models/Position');
const moment = require('moment'); // Pour manipuler facilement les dates

/**
 * @swagger
 * /api/historique/{vehiculeId}/{date}:
 *   get:
 *     summary: Voir l'historique du véhicule pour un jour donné
 *     tags: [Historique]
 *     parameters:
 *       - in: path
 *         name: vehiculeId
 *         required: true
 *         description: L'ID du véhicule
 *       - in: path
 *         name: date
 *         required: true
 *         description: La date du trajet (format YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Historique du véhicule
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 vehiculeId:
 *                   type: string
 *                 date:
 *                   type: string
 *                 distance_km:
 *                   type: number
 *                 start_time:
 *                   type: string
 *                 end_time:
 *                   type: string
 *                 total_stops:
 *                   type: number
 *                 total_stop_time:
 *                   type: string
 */
const getHistorique = async (req, res) => {
  const { vehiculeId, date } = req.params;
  
  try {
    // Récupérer toutes les positions pour le véhicule et la date donnée
    const startOfDay = moment(date).startOf('day').toDate();
    const endOfDay = moment(date).endOf('day').toDate();
    
    const positions = await Position.find({
      vehiculeId,
      timestamp: { $gte: startOfDay, $lte: endOfDay },
    }).sort({ timestamp: 1 }); // Trier les positions par timestamp croissant
    
    if (!positions.length) {
      return res.status(404).json({ message: 'Aucune donnée pour ce jour' });
    }

    let totalDistance = 0;
    let totalStops = 0;
    let totalStopTime = 0; // en secondes

    let lastPosition = null;
    let startTime = positions[0].timestamp;
    let endTime = positions[positions.length - 1].timestamp;

    positions.forEach((pos, index) => {
      if (lastPosition) {
        // Calculer la distance entre deux positions
        const distance = calculateDistance(lastPosition, pos);
        totalDistance += distance;
        
        // Si le véhicule a été à l'arrêt pendant plus de 10 secondes
        if (pos.vitesse === 0) {
          totalStops++;
          totalStopTime += 10; // On suppose qu'un arrêt dure au moins 10 secondes
        }
      }
      lastPosition = pos;
    });

    const historique = {
      vehiculeId,
      date,
      distance_km: totalDistance / 1000, // Convertir en km
      start_time: moment(startTime).format('HH:mm:ss'),
      end_time: moment(endTime).format('HH:mm:ss'),
      total_stops: totalStops,
      total_stop_time: `${totalStopTime} minutes`,
      positions,
    };

    res.status(200).json(historique);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err });
  }
};

// Fonction pour calculer la distance entre deux points GPS en mètres
const calculateDistance = (pos1, pos2) => {
  const R = 6371e3; // Rayon de la Terre en mètres
  const φ1 = (pos1.latitude * Math.PI) / 180;
  const φ2 = (pos2.latitude * Math.PI) / 180;
  const Δφ = ((pos2.latitude - pos1.latitude) * Math.PI) / 180;
  const Δλ = ((pos2.longitude - pos1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance en mètres
};

module.exports = { getHistorique };
