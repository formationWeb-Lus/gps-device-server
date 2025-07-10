/**
 * @swagger
 * tags:
 *   name: Historique
 *   description: "Historique des trajets des véhicules"
 */

/**
 * @swagger
 * /api/historique/{vehiculeId}/{date}:
 *   get:
 *     summary: "Affiche l'historique d'un véhicule pour une date précise"
 *     tags: [Historique]
 *     parameters:
 *       - in: path
 *         name: vehiculeId
 *         required: true
 *         description: "Identifiant du véhicule (ex: Toyota)"
 *         schema:
 *           type: string
 *       - in: path
 *         name: date
 *         required: true
 *         description: "Date du trajet (ex: 2025-06-28)"
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: "Résumé complet de l'historique du véhicule ce jour-là"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 vehicule:
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
 *                 arrets:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       quartier:
 *                         type: string
 *                       avenue:
 *                         type: string
 *                       duree:
 *                         type: string
 */

const express = require('express');
const router = express.Router();
const historiqueController = require('../controllers/historiqueController');

router.get('/:vehiculeId/:date', historiqueController.getHistorique);

module.exports = router;
