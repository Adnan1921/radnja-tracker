const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB connection
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/radnja_tracker';
const DB_NAME = 'radnja_tracker';

let db;
let client;

// Middleware
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// User roles - Sajra ima ograničen pristup
const USER_ROLES = {
  'SanelaBiber': 'admin',
  'HarisBiber': 'admin',
  'Sajra': 'limited'
};

// Auth middleware
const requireAuth = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Niste prijavljeni' });
  }
  
  try {
    const session = await db.collection('sessions').findOne({ token });
    if (!session) {
      return res.status(401).json({ error: 'Nevažeći token' });
    }
    
    if (new Date() > new Date(session.expiresAt)) {
      await db.collection('sessions').deleteOne({ token });
      return res.status(401).json({ error: 'Sesija istekla' });
    }
    
    req.user = { 
      username: session.username,
      role: USER_ROLES[session.username] || 'limited'
    };
    next();
  } catch (error) {
    res.status(401).json({ error: 'Greška pri autentifikaciji' });
  }
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

// Korisnici
const KORISNICI = [
  { username: 'SanelaBiber', password: 'sanela123', role: 'admin' },
  { username: 'HarisBiber', password: 'haris123', role: 'admin' },
  { username: 'Sajra', password: 'sajra123', role: 'limited' }
];

// Connect to MongoDB
async function connectDB() {
  if (db) return db;
  
  try {
    client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db(DB_NAME);
    console.log('✅ Povezan na MongoDB');
    
    const usersCollection = db.collection('users');
    for (const user of KORISNICI) {
      const exists = await usersCollection.findOne({ username: user.username });
      if (!exists) {
        const hashedPassword = await bcrypt.hash(user.password, 10);
        await usersCollection.insertOne({
          username: user.username,
          password: hashedPassword,
          role: user.role
        });
        console.log(`👤 Kreiran korisnik: ${user.username} (${user.role})`);
      }
    }
    
    await db.collection('prodaje').createIndex({ datum: 1 });
    await db.collection('prodaje').createIndex({ korisnik: 1 });
    await db.collection('sessions').createIndex({ token: 1 });
    await db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    
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
    
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    await db.collection('sessions').insertOne({
      token,
      username: user.username,
      expiresAt
    });
    
    const role = USER_ROLES[user.username] || 'limited';
    res.json({ success: true, token, username: user.username, role });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Greška pri prijavi' });
  }
});

app.post('/api/logout', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    await db.collection('sessions').deleteOne({ token });
  }
  res.json({ success: true });
});

app.get('/api/me', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.json({ loggedIn: false });
  }
  
  try {
    const session = await db.collection('sessions').findOne({ token });
    if (session && new Date() < new Date(session.expiresAt)) {
      const role = USER_ROLES[session.username] || 'limited';
      res.json({ loggedIn: true, username: session.username, role });
    } else {
      res.json({ loggedIn: false });
    }
  } catch (error) {
    res.json({ loggedIn: false });
  }
});

// ============ API ROUTES ============

app.get('/api/artikli', requireAuth, (req, res) => {
  res.json(ARTIKLI);
});

// Dodaj novu prodaju - sada s količinom i načinom plaćanja
app.post('/api/prodaje', requireAuth, async (req, res) => {
  const { artikal_id, cijena, kolicina = 1, nacin_placanja = 'kes' } = req.body;
  const now = new Date();
  const datum = now.toISOString().split('T')[0];
  const vrijeme = now.toLocaleTimeString('bs-BA', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Sarajevo' });
  
  const artikal = ARTIKLI.find(a => a.id === artikal_id);
  if (!artikal) {
    return res.status(400).json({ error: 'Nepoznat artikal' });
  }
  
  const ukupnaCijena = parseFloat(cijena) * parseInt(kolicina);
  
  try {
    const result = await db.collection('prodaje').insertOne({
      artikal_id,
      artikal_naziv: artikal.naziv,
      artikal_ikona: artikal.ikona,
      cijena: parseFloat(cijena),
      kolicina: parseInt(kolicina),
      ukupno: ukupnaCijena,
      nacin_placanja,
      datum,
      vrijeme,
      korisnik: req.user.username,
      createdAt: now
    });
    
    res.json({ success: true, id: result.insertedId });
  } catch (error) {
    console.error('Prodaja error:', error);
    res.status(500).json({ error: 'Greška pri spremanju' });
  }
});

// Dohvati prodaje - limited users vide samo svoje
app.get('/api/prodaje/:datum', requireAuth, async (req, res) => {
  const { datum } = req.params;
  
  try {
    let query = { datum };
    
    // Limited users vide samo svoje prodaje
    if (req.user.role === 'limited') {
      query.korisnik = req.user.username;
    }
    
    const prodaje = await db.collection('prodaje')
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();
    
    res.json(prodaje);
  } catch (error) {
    res.status(500).json({ error: 'Greška pri dohvaćanju' });
  }
});

// Statistika - limited users vide samo svoje
app.get('/api/statistika/:datum', requireAuth, async (req, res) => {
  const { datum } = req.params;
  
  try {
    let query = { datum };
    if (req.user.role === 'limited') {
      query.korisnik = req.user.username;
    }
    
    const prodaje = await db.collection('prodaje').find(query).toArray();
    
    const ukupno = prodaje.reduce((sum, p) => sum + (p.ukupno || p.cijena), 0);
    const broj_prodaja = prodaje.length;
    const ukupno_kolicina = prodaje.reduce((sum, p) => sum + (p.kolicina || 1), 0);
    
    // Statistika po načinu plaćanja
    const kes = prodaje.filter(p => p.nacin_placanja !== 'kartica').reduce((sum, p) => sum + (p.ukupno || p.cijena), 0);
    const kartica = prodaje.filter(p => p.nacin_placanja === 'kartica').reduce((sum, p) => sum + (p.ukupno || p.cijena), 0);
    
    const poArtiklimaMap = {};
    for (const p of prodaje) {
      if (!poArtiklimaMap[p.artikal_id]) {
        poArtiklimaMap[p.artikal_id] = {
          naziv: p.artikal_naziv,
          ikona: p.artikal_ikona,
          broj: 0,
          kolicina: 0,
          ukupno: 0
        };
      }
      poArtiklimaMap[p.artikal_id].broj++;
      poArtiklimaMap[p.artikal_id].kolicina += (p.kolicina || 1);
      poArtiklimaMap[p.artikal_id].ukupno += (p.ukupno || p.cijena);
    }
    
    res.json({ 
      ukupno, 
      broj_prodaja,
      ukupno_kolicina,
      kes,
      kartica,
      po_artiklima: Object.values(poArtiklimaMap) 
    });
  } catch (error) {
    res.status(500).json({ error: 'Greška pri dohvaćanju statistike' });
  }
});

// Mjesečna statistika - limited users vide samo svoje
app.get('/api/statistika/mjesec/:godina/:mjesec', requireAuth, async (req, res) => {
  const { godina, mjesec } = req.params;
  const pattern = `${godina}-${mjesec.padStart(2, '0')}`;
  
  try {
    let query = { datum: { $regex: `^${pattern}` } };
    if (req.user.role === 'limited') {
      query.korisnik = req.user.username;
    }
    
    const prodaje = await db.collection('prodaje').find(query).toArray();
    
    const dnevnoMap = {};
    for (const p of prodaje) {
      if (!dnevnoMap[p.datum]) {
        dnevnoMap[p.datum] = { datum: p.datum, ukupno: 0, broj_prodaja: 0, kolicina: 0 };
      }
      dnevnoMap[p.datum].ukupno += (p.ukupno || p.cijena);
      dnevnoMap[p.datum].broj_prodaja++;
      dnevnoMap[p.datum].kolicina += (p.kolicina || 1);
    }
    
    const dnevno = Object.values(dnevnoMap).sort((a, b) => a.datum.localeCompare(b.datum));
    const ukupno = prodaje.reduce((sum, p) => sum + (p.ukupno || p.cijena), 0);
    const kes = prodaje.filter(p => p.nacin_placanja !== 'kartica').reduce((sum, p) => sum + (p.ukupno || p.cijena), 0);
    const kartica = prodaje.filter(p => p.nacin_placanja === 'kartica').reduce((sum, p) => sum + (p.ukupno || p.cijena), 0);
    
    res.json({ 
      dnevno, 
      ukupno, 
      broj_prodaja: prodaje.length,
      kes,
      kartica
    });
  } catch (error) {
    res.status(500).json({ error: 'Greška pri dohvaćanju statistike' });
  }
});

app.delete('/api/prodaje/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  
  try {
    // Limited users mogu brisati samo svoje
    let query = { _id: new ObjectId(id) };
    if (req.user.role === 'limited') {
      query.korisnik = req.user.username;
    }
    
    const result = await db.collection('prodaje').deleteOne(query);
    if (result.deletedCount === 0) {
      return res.status(403).json({ error: 'Nemate dozvolu za brisanje' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Greška pri brisanju' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🏪 Radnja Tracker pokrenut na http://localhost:${PORT}`);
  });
}

module.exports = app;
