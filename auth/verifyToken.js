const jwt = require('jsonwebtoken');

function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  console.log('🧾 Authorization Header:', authHeader);

  if (!authHeader) {
    return res.status(403).json({ message: '❌ Token manquant dans le header' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(403).json({ message: '❌ Token vide ou mal formé' });
  }

  console.log('🔍 Token reçu:', token);
  console.log('🔐 JWT_SECRET utilisé:', process.env.JWT_SECRET); // ✅ Debug utile

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.error('❌ Erreur JWT :', err.message);
      return res.status(403).json({ message: '❌ Token invalide' });
    }

    console.log('✅ Token valide, user:', decoded);
    req.user = decoded; // { id: ... }
    next();
  });
}

module.exports = verifyToken;
