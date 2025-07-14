const jwt = require('jsonwebtoken');

function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(403).json({ message: '❌ Token manquant dans le header' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(403).json({ message: '❌ Token vide ou mal formé' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.error('❌ Erreur JWT :', err.message);
      return res.status(403).json({ message: '❌ Token invalide' });
    }

    req.user = decoded; // ✅ { id: 1 }
    next();
  });
}

module.exports = verifyToken;
