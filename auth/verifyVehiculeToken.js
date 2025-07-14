// auth/verifyVehiculeToken.js
const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ message: 'Token manquant' });

  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token invalide' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.vehicule = decoded; // { vehiculeId, userId }
    next();
  } catch (err) {
    res.status(403).json({ message: 'Token invalide ou expiré' });
  }
};
