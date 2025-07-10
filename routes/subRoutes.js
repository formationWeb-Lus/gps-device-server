const express = require('express');
const router = express.Router();
const controller = require('../controllers/subController');

router.post('/subscriptions', controller.createSubscription);
router.post('/payments', controller.createPayment);
router.get('/subscriptions', controller.getSubscriptions);
router.get('/payments', controller.getPayments);

module.exports = router;
