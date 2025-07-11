router.post('/', async (req, res) => {
  const { phone } = req.body;

  const user = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);

  if (user.rows.length === 0) return res.status(404).json({ message: 'Utilisateur introuvable' });

  const payload = { id: user.rows[0].id };
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '2h' });

  res.json({ token, user: user.rows[0] }); // contient le vehiculeid
});
