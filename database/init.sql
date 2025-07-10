-- Table pour les utilisateurs existants (connexion)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL UNIQUE,
  verified BOOLEAN DEFAULT FALSE,
  verification_code VARCHAR(6)
);

-- Table pour les comptes créés (avant vérification)
CREATE TABLE IF NOT EXISTS pending_accounts (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
