const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB connection
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/radnja_tracker';
const DB_NAME = 'radnja_tracker';

let db;
let client;

// Middleware
app.use(cors({ credentials: true, origin: true }));
app.use(express.json());

// Session setup - koristi MongoDB za storage u produkciji
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'radnja-super-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: { 
    secure: process.env.NODE_ENV === 'production' || !!process.env.VERCEL,
    httpOnly: true,
    sameSite: process.env.VERCEL ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 sata
  }
};

// Dodaj MongoStore ako imamo MONGODB_URI
if (process.env.MONGODB_URI) {
  sessionConfig.store = MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    ttl: 24 * 60 * 60, // 24 sata
    crypto: {
      secret: process.env.SESSION_SECRET || 'radnja-super-secret-key-2024'
    }
  });
}

// Trust proxy za Vercel
app.set('trust proxy', 1);

app.use(session(sessionConfig));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Auth middleware
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Niste prijavljeni' });
  }
  next();
};

// Artikli sa shortcutima
const ARTIKLI = [
  { id: 1, naziv: 'Torba', ikona: '👜', shortcuti: [60, 65, 70, 75, 80, 85, 90] },
  { id: 2, naziv: 'Naočale', ikona: '🕶️', shortcuti: [20, 30] },
  { id: 3, naziv: 'Kapa', ikona: '🧢', shortcuti: [20, 25] },
  { id: 4, naziv: 'Novčanik', ikona: '👛', shortcuti: [25, 30, 35, 40] },
  { id: 5, naziv: 'Kais', ikona: '🪢', shortcuti: [40, 60] },
  { id: 6, naziv: 'Ostalo', ikona: '📦', shortcuti: [] }
];

// Korisnici (passwordi se hashiraju pri prvom pokretanju)
const KORISNICI = [
  { username: 'SanelaBiber', password: 'sanela123' },
  { username: 'HarisBiber', password: 'haris123' },
  { username: 'Sajra', password: 'sajra123' }
];

// Connect to MongoDB
async function connectDB() {
  if (db) return db;
  
  try {
    client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db(DB_NAME);
    console.log('✅ Povezan na MongoDB');
    
    // Kreiraj korisnike ako ne postoje
    const usersCollection = db.collection('users');
    for (const user of KORISNICI) {
      const exists = await usersCollection.findOne({ username: user.username });
      if (!exists) {
        const hashedPassword = await bcrypt.hash(user.password, 10);
        await usersCollection.insertOne({
          username: user.username,
          password: hashedPassword
        });
        console.log(`👤 Kreiran korisnik: ${user.username}`);
      }
    }
    
    // Kreiraj indekse
    await db.collection('prodaje').createIndex({ datum: 1 });
    await db.collection('prodaje').createIndex({ korisnik: 1 });
    
    return db;
  } catch (error) {
    console.error('❌ Greška pri povezivanju na MongoDB:', error.message);
    throw error;
  }
}

// Middleware za DB konekciju
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    res.status(500).json({ error: 'Greška pri povezivanju na bazu' });
  }
});

// ============ AUTH ROUTES ============

// Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const user = await db.collection('users').findOne({ username });
    if (!user) {
      return res.status(401).json({ error: 'Pogrešno korisničko ime ili lozinka' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Pogrešno korisničko ime ili lozinka' });
    }
    
    req.session.userId = user._id.toString();
    req.session.username = user.username;
    
    res.json({ success: true, username: user.username });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Greška pri prijavi' });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Check auth status
app.get('/api/me', (req, res) => {
  if (req.session.userId) {
    res.json({ loggedIn: true, username: req.session.username });
  } else {
    res.json({ loggedIn: false });
  }
});

// ============ API ROUTES ============

// Dohvati sve artikle
app.get('/api/artikli', requireAuth, (req, res) => {
  res.json(ARTIKLI);
});

// Dodaj novu prodaju
app.post('/api/prodaje', requireAuth, async (req, res) => {
  const { artikal_id, cijena } = req.body;
  const now = new Date();
  const datum = now.toISOString().split('T')[0];
  const vrijeme = now.toLocaleTimeString('bs-BA', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Sarajevo' });
  
  const artikal = ARTIKLI.find(a => a.id === artikal_id);
  if (!artikal) {
    return res.status(400).json({ error: 'Nepoznat artikal' });
  }
  
  try {
    const result = await db.collection('prodaje').insertOne({
      artikal_id,
      artikal_naziv: artikal.naziv,
      artikal_ikona: artikal.ikona,
      cijena: parseFloat(cijena),
      datum,
      vrijeme,
      korisnik: req.session.username,
      createdAt: now
    });
    
    res.json({ success: true, id: result.insertedId });
  } catch (error) {
    console.error('Prodaja error:', error);
    res.status(500).json({ error: 'Greška pri spremanju' });
  }
});

// Dohvati prodaje za određeni datum
app.get('/api/prodaje/:datum', requireAuth, async (req, res) => {
  const { datum } = req.params;
  
  try {
    const prodaje = await db.collection('prodaje')
      .find({ datum })
      .sort({ createdAt: -1 })
      .toArray();
    
    res.json(prodaje);
  } catch (error) {
    res.status(500).json({ error: 'Greška pri dohvaćanju' });
  }
});

// Dohvati statistiku za određeni datum
app.get('/api/statistika/:datum', requireAuth, async (req, res) => {
  const { datum } = req.params;
  
  try {
    const prodaje = await db.collection('prodaje').find({ datum }).toArray();
    
    const ukupno = prodaje.reduce((sum, p) => sum + p.cijena, 0);
    const broj_prodaja = prodaje.length;
    
    // Grupiraj po artiklima
    const poArtiklimaMap = {};
    for (const p of prodaje) {
      if (!poArtiklimaMap[p.artikal_id]) {
        poArtiklimaMap[p.artikal_id] = {
          naziv: p.artikal_naziv,
          ikona: p.artikal_ikona,
          broj: 0,
          ukupno: 0
        };
      }
      poArtiklimaMap[p.artikal_id].broj++;
      poArtiklimaMap[p.artikal_id].ukupno += p.cijena;
    }
    
    res.json({ 
      ukupno, 
      broj_prodaja, 
      po_artiklima: Object.values(poArtiklimaMap) 
    });
  } catch (error) {
    res.status(500).json({ error: 'Greška pri dohvaćanju statistike' });
  }
});

// Dohvati statistiku za mjesec
app.get('/api/statistika/mjesec/:godina/:mjesec', requireAuth, async (req, res) => {
  const { godina, mjesec } = req.params;
  const pattern = `${godina}-${mjesec.padStart(2, '0')}`;
  
  try {
    const prodaje = await db.collection('prodaje')
      .find({ datum: { $regex: `^${pattern}` } })
      .toArray();
    
    // Grupiraj po danima
    const dnevnoMap = {};
    for (const p of prodaje) {
      if (!dnevnoMap[p.datum]) {
        dnevnoMap[p.datum] = { datum: p.datum, ukupno: 0, broj_prodaja: 0 };
      }
      dnevnoMap[p.datum].ukupno += p.cijena;
      dnevnoMap[p.datum].broj_prodaja++;
    }
    
    const dnevno = Object.values(dnevnoMap).sort((a, b) => a.datum.localeCompare(b.datum));
    const ukupno = prodaje.reduce((sum, p) => sum + p.cijena, 0);
    
    res.json({ 
      dnevno, 
      ukupno, 
      broj_prodaja: prodaje.length 
    });
  } catch (error) {
    res.status(500).json({ error: 'Greška pri dohvaćanju statistike' });
  }
});

// Obriši prodaju
app.delete('/api/prodaje/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  
  try {
    await db.collection('prodaje').deleteOne({ _id: new ObjectId(id) });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Greška pri brisanju' });
  }
});

// Catch-all za SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server (za lokalni razvoj)
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🏪 Radnja Tracker pokrenut na http://localhost:${PORT}`);
  });
}

// Export za Vercel
module.exports = app;
