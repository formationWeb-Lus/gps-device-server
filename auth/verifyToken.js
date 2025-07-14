const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  const authHeader = req.headers['authorization'];
  console.log('🧾 Header Authorization reçu :', authHeader); // ✅ Ajout utile pour debug

  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(403).json({ message: 'Token manquant ❌' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    console.log('🔓 Token décodé :', decoded); // ✅ Debug
    next();
  } catch (err) {
    console.error('❌ Token invalide :', err.message);
    res.status(403).json({ message: 'Token invalide ❌' });
  }
};
