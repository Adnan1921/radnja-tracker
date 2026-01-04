const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB connection
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/radnja_tracker';
const DB_NAME = 'radnja_tracker';

let db;
let client;

// ============ RATE LIMITING ============

// Općeniti rate limiter za sve rute
const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuta
  max: 100, // max 100 zahtjeva po minuti
  message: { error: 'Previše zahtjeva, pokušajte ponovo za minutu' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stroži rate limiter za login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuta
  max: 5, // max 5 pokušaja
  message: { error: 'Previše pokušaja prijave, pokušajte ponovo za 15 minuta' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // ne broji uspješne loginove
});

// ============ VALIDATION HELPERS ============

const validatePrice = (price) => {
  const num = parseFloat(price);
  if (isNaN(num) || num <= 0 || num > 100000) {
    return { valid: false, error: 'Cijena mora biti između 0.01 i 100,000 KM' };
  }
  return { valid: true, value: num };
};

const validateQuantity = (quantity) => {
  const num = parseInt(quantity);
  if (isNaN(num) || num < 1 || num > 1000) {
    return { valid: false, error: 'Količina mora biti između 1 i 1000' };
  }
  return { valid: true, value: num };
};

const validatePaymentMethod = (method) => {
  if (!['kes', 'kartica'].includes(method)) {
    return { valid: false, error: 'Način plaćanja mora biti "kes" ili "kartica"' };
  }
  return { valid: true, value: method };
};

const validateDate = (dateStr) => {
  if (!dateStr) return { valid: true, value: null };
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) {
    return { valid: false, error: 'Datum mora biti u formatu YYYY-MM-DD' };
  }
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return { valid: false, error: 'Nevažeći datum' };
  }
  // Ne dopusti buduće datume
  if (date > new Date()) {
    return { valid: false, error: 'Ne možete unositi za buduće datume' };
  }
  return { valid: true, value: dateStr };
};

// Middleware
app.use(express.json({ limit: '10kb' })); // Ograniči veličinu body-ja
app.use(generalLimiter);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// User roles
const USER_ROLES = {
  'SanelaBiber': 'admin',
  'HarisBiber': 'admin',
  'Sajra': 'limited'
};

// NAPOMENA: Lozinke su uklonjene iz koda nakon inicijalnog setup-a
// Korisnici se kreiraju samo ako ne postoje u bazi
// Za promjenu lozinki koristiti direktno MongoDB
const INITIAL_USERS = [
  { username: 'SanelaBiber', role: 'admin' },
  { username: 'HarisBiber', role: 'admin' },
  { username: 'Sajra', role: 'limited' }
];

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

// Connect to MongoDB
async function connectDB() {
  if (db) return db;
  
  try {
    client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db(DB_NAME);
    console.log('✅ Povezan na MongoDB');
    
    // Provjeri da li postoje korisnici - ako ne, kreiraj inicijalne
    const usersCollection = db.collection('users');
    const existingUsers = await usersCollection.countDocuments();
    
    if (existingUsers === 0) {
      // Prvi put - kreiraj korisnike s default lozinkama
      // NAPOMENA: Ove lozinke treba promijeniti nakon prvog logina!
      console.log('⚠️  Kreiranje inicijalnih korisnika s default lozinkama...');
      const defaultPasswords = {
        'SanelaBiber': process.env.INIT_PASS_SANELA || 'CHANGE_ME_sanela',
        'HarisBiber': process.env.INIT_PASS_HARIS || 'CHANGE_ME_haris', 
        'Sajra': process.env.INIT_PASS_SAJRA || 'CHANGE_ME_sajra'
      };
      
      for (const user of INITIAL_USERS) {
        const hashedPassword = await bcrypt.hash(defaultPasswords[user.username], 12);
        await usersCollection.insertOne({
          username: user.username,
          password: hashedPassword,
          role: user.role,
          createdAt: new Date(),
          passwordChangedAt: null // Označava da treba promijeniti lozinku
        });
        console.log(`👤 Kreiran korisnik: ${user.username}`);
      }
      console.log('⚠️  VAŽNO: Postavite prave lozinke kroz environment varijable ili MongoDB!');
    }
    
    // Kreiraj indekse
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

// Login - sa rate limitingom
app.post('/api/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  
  // Validacija inputa
  if (!username || typeof username !== 'string' || username.length > 50) {
    return res.status(400).json({ error: 'Nevažeće korisničko ime' });
  }
  if (!password || typeof password !== 'string' || password.length > 100) {
    return res.status(400).json({ error: 'Nevažeća lozinka' });
  }
  
  try {
    const user = await db.collection('users').findOne({ username: username.trim() });
    if (!user) {
      return res.status(401).json({ error: 'Pogrešno korisničko ime ili lozinka' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Pogrešno korisničko ime ili lozinka' });
    }
    
    // Generiraj siguran token
    const token = crypto.randomBytes(32).toString('hex');
    // Token traje 7 dana (produženo s 24 sata)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    await db.collection('sessions').insertOne({
      token,
      username: user.username,
      expiresAt,
      createdAt: new Date(),
      userAgent: req.headers['user-agent'] || 'unknown'
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

// Dodaj novu prodaju - sa validacijom
app.post('/api/prodaje', requireAuth, async (req, res) => {
  const { artikal_id, cijena, kolicina = 1, nacin_placanja = 'kes', datum: clientDatum, vrijeme: clientVrijeme } = req.body;
  
  // Validacija
  const priceValidation = validatePrice(cijena);
  if (!priceValidation.valid) {
    return res.status(400).json({ error: priceValidation.error });
  }
  
  const quantityValidation = validateQuantity(kolicina);
  if (!quantityValidation.valid) {
    return res.status(400).json({ error: quantityValidation.error });
  }
  
  const paymentValidation = validatePaymentMethod(nacin_placanja);
  if (!paymentValidation.valid) {
    return res.status(400).json({ error: paymentValidation.error });
  }
  
  // Datum je OBAVEZAN od klijenta (timezone-aware)
  if (!clientDatum) {
    return res.status(400).json({ error: 'Datum je obavezan' });
  }
  
  const dateValidation = validateDate(clientDatum);
  if (!dateValidation.valid) {
    return res.status(400).json({ error: dateValidation.error });
  }
  
  const artikal = ARTIKLI.find(a => a.id === artikal_id);
  if (!artikal) {
    return res.status(400).json({ error: 'Nepoznat artikal' });
  }
  
  const now = new Date();
  const datum = dateValidation.value;
  // Vrijeme dolazi od klijenta ili je retroaktivno
  const vrijeme = clientVrijeme || 'retroaktivno';
  
  const ukupnaCijena = priceValidation.value * quantityValidation.value;
  
  // Dodatna provjera za ukupnu cijenu
  if (ukupnaCijena > 1000000) {
    return res.status(400).json({ error: 'Ukupna cijena prelazi maksimum' });
  }
  
  try {
    const result = await db.collection('prodaje').insertOne({
      artikal_id,
      artikal_naziv: artikal.naziv,
      artikal_ikona: artikal.ikona,
      cijena: priceValidation.value,
      kolicina: quantityValidation.value,
      ukupno: ukupnaCijena,
      nacin_placanja: paymentValidation.value,
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

// Dodaj dnevni promet - sa validacijom
app.post('/api/dnevni-promet', requireAuth, async (req, res) => {
  const { iznos, nacin_placanja = 'kes', datum } = req.body;
  
  // Validacija
  const priceValidation = validatePrice(iznos);
  if (!priceValidation.valid) {
    return res.status(400).json({ error: priceValidation.error });
  }
  
  const paymentValidation = validatePaymentMethod(nacin_placanja);
  if (!paymentValidation.valid) {
    return res.status(400).json({ error: paymentValidation.error });
  }
  
  const dateValidation = validateDate(datum);
  if (!dateValidation.valid || !dateValidation.value) {
    return res.status(400).json({ error: 'Datum je obavezan' });
  }
  
  const now = new Date();
  
  try {
    const result = await db.collection('prodaje').insertOne({
      artikal_id: 0,
      artikal_naziv: 'Dnevni promet',
      artikal_ikona: '💰',
      cijena: priceValidation.value,
      kolicina: 1,
      ukupno: priceValidation.value,
      nacin_placanja: paymentValidation.value,
      datum: dateValidation.value,
      vrijeme: 'dnevni promet',
      korisnik: req.user.username,
      createdAt: now,
      isDnevniPromet: true
    });
    
    res.json({ success: true, id: result.insertedId });
  } catch (error) {
    console.error('Dnevni promet error:', error);
    res.status(500).json({ error: 'Greška pri spremanju' });
  }
});

// Dohvati prodaje
app.get('/api/prodaje/:datum', requireAuth, async (req, res) => {
  const { datum } = req.params;
  
  // Validacija datuma
  const dateValidation = validateDate(datum);
  if (!dateValidation.valid) {
    return res.status(400).json({ error: dateValidation.error });
  }
  
  try {
    let query = { datum };
    
    if (req.user.role === 'limited') {
      query.korisnik = req.user.username;
    }
    
    const prodaje = await db.collection('prodaje')
      .find(query)
      .sort({ createdAt: -1 })
      .limit(500) // Ograniči broj rezultata
      .toArray();
    
    res.json(prodaje);
  } catch (error) {
    res.status(500).json({ error: 'Greška pri dohvaćanju' });
  }
});

// Statistika
app.get('/api/statistika/:datum', requireAuth, async (req, res) => {
  const { datum } = req.params;
  
  const dateValidation = validateDate(datum);
  if (!dateValidation.valid) {
    return res.status(400).json({ error: dateValidation.error });
  }
  
  try {
    let query = { datum };
    if (req.user.role === 'limited') {
      query.korisnik = req.user.username;
    }
    
    const prodaje = await db.collection('prodaje').find(query).toArray();
    
    const ukupno = prodaje.reduce((sum, p) => sum + (p.ukupno || p.cijena), 0);
    const broj_prodaja = prodaje.length;
    const ukupno_kolicina = prodaje.reduce((sum, p) => sum + (p.kolicina || 1), 0);
    
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

// Mjesečna statistika
app.get('/api/statistika/mjesec/:godina/:mjesec', requireAuth, async (req, res) => {
  const { godina, mjesec } = req.params;
  
  // Validacija
  const godinaNum = parseInt(godina);
  const mjesecNum = parseInt(mjesec);
  if (isNaN(godinaNum) || godinaNum < 2020 || godinaNum > 2100) {
    return res.status(400).json({ error: 'Nevažeća godina' });
  }
  if (isNaN(mjesecNum) || mjesecNum < 1 || mjesecNum > 12) {
    return res.status(400).json({ error: 'Nevažeći mjesec' });
  }
  
  const pattern = `${godina}-${String(mjesecNum).padStart(2, '0')}`;
  
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
  
  // Validacija ObjectId
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Nevažeći ID' });
  }
  
  try {
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
