// backend/database/subscriptionModel.js
const pool = require('./index');

async function createSubscription({ userId, plan, vehicleCount, totalPrice }) {
  const result = await pool.query(
    `INSERT INTO subscriptions (user_id, plan, vehicle_count, total_price, created_at) 
     VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
    [userId, plan, vehicleCount, totalPrice]
  );
  return result.rows[0];
}

module.exports = {
  createSubscription,
};
