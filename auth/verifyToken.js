// auth/verifyToken.js

const jwt = require('jsonwebtoken');

/**
 * Middleware pour vérifier le token JWT dans les headers Authorization
 * Le token doit être au format : "Bearer <token>"
 */
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(403).json({ message: '❌ Token manquant dans les headers' });
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(403).json({ message: '❌ Token non fourni' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.error('❌ Erreur de vérification JWT :', err.message);
      return res.status(403).json({ message: '❌ Token invalide' });
    }

    req.user = decoded; // contient { id: ... }
    console.log('✅ Token vérifié. Utilisateur ID :', decoded.id);
    next();
  });
}

module.exports = verifyToken;
