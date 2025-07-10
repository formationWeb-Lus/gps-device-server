require('dotenv').config({ path: '../.env' }); // <- Attention au chemin
const mongoose = require('mongoose');

console.log("🔍 URI lue depuis .env :", process.env.MONGODB_URI);

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log("✅ Connexion MongoDB réussie");
  mongoose.disconnect();
})
.catch((err) => {
  console.error("❌ Connexion échouée :", err.message);
});
