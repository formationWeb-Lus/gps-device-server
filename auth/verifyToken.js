const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(403).json({ message: 'Aucun token fourni' });

  const token = authHeader.split(' ')[1]; // "Bearer xxx"

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: 'Token invalide ou expiré' });

    req.user = { id: decoded.id }; // obligatoire pour récupérer req.user.id dans les routes
    next();
  });
};
