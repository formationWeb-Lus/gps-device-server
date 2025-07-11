const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader) return res.status(401).json({ message: 'Token manquant' });

  const token = authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ message: 'Token invalide' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Token non valide' });

    req.user = user; // ✅ Injecte le user décodé ici
    next();
  });
};
