const db = require('../config/db.postgres');

// Créer un abonnement
exports.createSubscription = async (req, res) => {
  const { user_id, plan_name, price, start_date, end_date } = req.body;
  try {
    const result = await db.query(
      `INSERT INTO subscriptions (user_id, plan_name, price, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [user_id, plan_name, price, start_date, end_date]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Créer un paiement
exports.createPayment = async (req, res) => {
  const { user_id, amount, payment_date, method } = req.body;
  try {
    const result = await db.query(
      `INSERT INTO payments (user_id, amount, payment_date, method)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [user_id, amount, payment_date, method]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Lister abonnements
exports.getSubscriptions = async (req, res) => {
  try {
    const result = await db.query(`SELECT * FROM subscriptions`);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Lister paiements
exports.getPayments = async (req, res) => {
  try {
    const result = await db.query(`SELECT * FROM payments`);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
