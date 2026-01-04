// State
let artikli = [];
let odabraniArtikalId = null;
let trenutniMjesec = new Date().getMonth();
let trenutnaGodina = new Date().getFullYear();
let odabraniDatum = null;
let authToken = localStorage.getItem('authToken');
let currentUser = null;
let userRole = 'limited';
let kolicina = 1;
let nacinPlacanja = 'kes';
let deleteTargetId = null;

// Retro state
let retroDatum = null;
let retroArtikalId = null;
let retroKolicina = 1;
let retroNacinPlacanja = 'kes';

// Elementi
const loginScreen = document.getElementById('loginScreen');
const mainApp = document.getElementById('mainApp');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const userBadge = document.getElementById('userBadge');
const btnLogout = document.getElementById('btnLogout');
const analitikaTabBtn = document.getElementById('analitikaTabBtn');

const artikliGrid = document.getElementById('artikliGrid');
const cijenaSection = document.getElementById('cijenaSection');
const cijenaInput = document.getElementById('cijenaInput');
const odabraniArtikalSpan = document.getElementById('odabraniArtikal');
const brziIznosi = document.getElementById('brziIznosi');
const btnSpremi = document.getElementById('btnSpremi');
const prodajeLista = document.getElementById('prodajeLista');
const dnevniPromet = document.getElementById('dnevniPromet');
const brojProdaja = document.getElementById('brojProdaja');
const prometPlacanje = document.getElementById('prometPlacanje');
const toast = document.getElementById('toast');
const ukupnoPreview = document.getElementById('ukupnoPreview');

// Količina
const kolicinaDisplay = document.getElementById('kolicinaDisplay');
const kolicinaMin = document.getElementById('kolicinaMin');
const kolicinaPlus = document.getElementById('kolicinaPlus');

// Plaćanje
const placanjeKes = document.getElementById('placanjeKes');
const placanjeKartica = document.getElementById('placanjeKartica');

// Modal
const deleteModal = document.getElementById('deleteModal');
const deleteModalText = document.getElementById('deleteModalText');
const deleteCancel = document.getElementById('deleteCancel');
const deleteConfirm = document.getElementById('deleteConfirm');

// Retro modali
const retroPrometModal = document.getElementById('retroPrometModal');
const retroArtikalModal = document.getElementById('retroArtikalModal');

// Tab elementi
const tabs = document.querySelectorAll('.tab');
const prodajaTab = document.getElementById('prodaja-tab');
const analitikaTab = document.getElementById('analitika-tab');

// Kalendar elementi
const kalendarDani = document.getElementById('kalendarDani');
const mjesecGodina = document.getElementById('mjesecGodina');
const prevMonth = document.getElementById('prevMonth');
const nextMonth = document.getElementById('nextMonth');
const danDetalji = document.getElementById('danDetalji');
const mjesecniPromet = document.getElementById('mjesecniPromet');
const mjesecniBroj = document.getElementById('mjesecniBroj');
const mjesecniPlacanje = document.getElementById('mjesecniPlacanje');

// Normalni nazivi mjeseci
const mjeseci = [
  'Januar', 'Februar', 'Mart', 'April', 'Maj', 'Juni',
  'Juli', 'August', 'Septembar', 'Oktobar', 'Novembar', 'Decembar'
];

// Pomoćne funkcije
const formatCijena = (broj) => {
  return new Intl.NumberFormat('bs-BA', { 
    style: 'decimal', 
    minimumFractionDigits: 2,
    maximumFractionDigits: 2 
  }).format(broj) + ' KM';
};

const formatDatum = (datum) => {
  const d = new Date(datum);
  const dani = ['Nedjelja', 'Ponedjeljak', 'Utorak', 'Srijeda', 'Četvrtak', 'Petak', 'Subota'];
  return `${dani[d.getDay()]}, ${d.getDate()}. ${mjeseci[d.getMonth()].toLowerCase()}`;
};

const formatDatumKratki = (datum) => {
  const d = new Date(datum);
  return `${d.getDate()}. ${mjeseci[d.getMonth()].toLowerCase()} ${d.getFullYear()}`;
};

// Lokalni datum i vrijeme (timezone-aware)
const danas = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const trenutnoVrijeme = () => {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const showToast = (poruka) => {
  toast.textContent = poruka;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
};

const updateUkupnoPreview = () => {
  const cijena = parseFloat(cijenaInput.value) || 0;
  const ukupno = cijena * kolicina;
  ukupnoPreview.innerHTML = `Ukupno: <strong>${formatCijena(ukupno)}</strong>`;
};

// API pozivi s token autentifikacijom
const api = {
  async fetch(url, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      authToken = null;
      localStorage.removeItem('authToken');
      showLogin();
      throw new Error('Unauthorized');
    }
    return res;
  },
  
  async login(username, password) {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    return res.json();
  },
  
  async logout() {
    await this.fetch('/api/logout', { method: 'POST' });
    authToken = null;
    localStorage.removeItem('authToken');
  },
  
  async checkAuth() {
    const res = await this.fetch('/api/me');
    return res.json();
  },
  
  async getArtikli() {
    const res = await this.fetch('/api/artikli');
    return res.json();
  },
  
  async dodajProdaju(artikal_id, cijena, kolicina, nacin_placanja, datum = null, vrijeme = null) {
    const body = { 
      artikal_id, 
      cijena, 
      kolicina, 
      nacin_placanja,
      datum: datum || danas(),
      vrijeme: vrijeme || trenutnoVrijeme()
    };
    
    const res = await this.fetch('/api/prodaje', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    return res.json();
  },
  
  async dodajDnevniPromet(iznos, nacin_placanja, datum) {
    const res = await this.fetch('/api/dnevni-promet', {
      method: 'POST',
      body: JSON.stringify({ iznos, nacin_placanja, datum })
    });
    return res.json();
  },
  
  async getProdaje(datum) {
    const res = await this.fetch(`/api/prodaje/${datum}`);
    return res.json();
  },
  
  async getStatistika(datum) {
    const res = await this.fetch(`/api/statistika/${datum}`);
    return res.json();
  },
  
  async getStatistikaMjesec(godina, mjesec) {
    const res = await this.fetch(`/api/statistika/mjesec/${godina}/${mjesec}`);
    return res.json();
  },
  
  async obrisiProdaju(id) {
    const res = await this.fetch(`/api/prodaje/${id}`, { method: 'DELETE' });
    return res.json();
  }
};

// ============ AUTH ============

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  
  try {
    const result = await api.login(username, password);
    if (result.error) {
      loginError.textContent = result.error;
    } else {
      authToken = result.token;
      localStorage.setItem('authToken', result.token);
      showApp(result.username, result.role);
    }
  } catch (error) {
    loginError.textContent = 'Greška pri povezivanju';
  }
});

btnLogout.addEventListener('click', async () => {
  await api.logout();
  showLogin();
});

const showLogin = () => {
  loginScreen.style.display = 'flex';
  mainApp.style.display = 'none';
  document.getElementById('username').value = '';
  document.getElementById('password').value = '';
  currentUser = null;
  userRole = 'limited';
};

const showApp = async (username, role = 'limited') => {
  loginScreen.style.display = 'none';
  mainApp.style.display = 'block';
  currentUser = username;
  userRole = role;
  
  userBadge.textContent = username;
  if (role === 'limited') {
    userBadge.classList.add('limited');
    analitikaTabBtn.style.display = 'none';
  } else {
    userBadge.classList.remove('limited');
    analitikaTabBtn.style.display = 'flex';
  }
  
  document.getElementById('trenutniDatum').textContent = formatDatum(danas());
  
  try {
    artikli = await api.getArtikli();
    renderArtikli();
    renderProdaje();
  } catch (error) {
    showLogin();
  }
};

// ============ RENDER ============

const renderArtikli = () => {
  artikliGrid.innerHTML = artikli.map(a => `
    <button class="artikal-btn ${odabraniArtikalId === a.id ? 'selected' : ''}" data-id="${a.id}">
      <span class="artikal-ikona">${a.ikona}</span>
      <span class="artikal-naziv">${a.naziv}</span>
    </button>
  `).join('');
  
  document.querySelectorAll('#artikliGrid .artikal-btn').forEach(btn => {
    btn.addEventListener('click', () => selectArtikal(parseInt(btn.dataset.id)));
  });
};

const selectArtikal = (id) => {
  const artikal = artikli.find(a => a.id === id);
  if (!artikal) return;
  
  odabraniArtikalId = id;
  odabraniArtikalSpan.innerHTML = `${artikal.ikona} ${artikal.naziv}`;
  cijenaSection.style.display = 'block';
  cijenaInput.value = '';
  kolicina = 1;
  kolicinaDisplay.textContent = kolicina;
  nacinPlacanja = 'kes';
  placanjeKes.classList.add('active');
  placanjeKartica.classList.remove('active');
  updateUkupnoPreview();
  
  if (artikal.shortcuti && artikal.shortcuti.length > 0) {
    brziIznosi.innerHTML = artikal.shortcuti.map(iznos => 
      `<button class="brzi-iznos" data-iznos="${iznos}">${iznos} KM</button>`
    ).join('');
    brziIznosi.style.display = 'flex';
    
    brziIznosi.querySelectorAll('.brzi-iznos').forEach(btn => {
      btn.addEventListener('click', () => {
        cijenaInput.value = btn.dataset.iznos;
        updateUkupnoPreview();
        cijenaInput.focus();
      });
    });
  } else {
    brziIznosi.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; width: 100%; text-align: center; padding: 8px 0;">Unesi proizvoljnu cijenu</div>';
  }
  
  cijenaInput.focus();
  renderArtikli();
  
  cijenaSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

const renderProdaje = async () => {
  try {
    const prodaje = await api.getProdaje(danas());
    const statistika = await api.getStatistika(danas());
    
    dnevniPromet.textContent = formatCijena(statistika.ukupno);
    brojProdaja.textContent = `${statistika.broj_prodaja} prodaj${statistika.broj_prodaja === 1 ? 'a' : 'e'}`;
    
    if (statistika.kes > 0 || statistika.kartica > 0) {
      prometPlacanje.innerHTML = `💵 ${formatCijena(statistika.kes)} | 💳 ${formatCijena(statistika.kartica)}`;
    } else {
      prometPlacanje.innerHTML = '';
    }
    
    if (prodaje.length === 0) {
      prodajeLista.innerHTML = `
        <div class="prazno-stanje">
          <div class="prazno-ikona">🛒</div>
          <div>Još nema prodaja danas</div>
        </div>
      `;
      return;
    }
    
    prodajeLista.innerHTML = prodaje.map(p => `
      <div class="prodaja-item" data-id="${p._id}">
        <span class="prodaja-ikona">${p.artikal_ikona}</span>
        <div class="prodaja-info">
          <div class="prodaja-naziv">
            ${p.artikal_naziv}
            ${(p.kolicina || 1) > 1 ? `<span class="prodaja-kolicina">${p.kolicina}×</span>` : ''}
            <span class="prodaja-placanje-tag ${p.nacin_placanja || 'kes'}">${p.nacin_placanja === 'kartica' ? '💳' : '💵'}</span>
          </div>
          <div class="prodaja-meta">${p.vrijeme} • ${p.korisnik}</div>
        </div>
        <div class="prodaja-cijena">${formatCijena(p.ukupno || p.cijena)}</div>
        <button class="prodaja-delete" title="Obriši">×</button>
      </div>
    `).join('');
    
    document.querySelectorAll('.prodaja-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const item = e.target.closest('.prodaja-item');
        const id = item.dataset.id;
        const naziv = item.querySelector('.prodaja-naziv').textContent.trim();
        const cijena = item.querySelector('.prodaja-cijena').textContent;
        
        showDeleteModal(id, `${naziv} - ${cijena}`);
      });
    });
  } catch (error) {
    console.error('Greška:', error);
  }
};

// ============ DELETE MODAL ============

const showDeleteModal = (id, text) => {
  deleteTargetId = id;
  deleteModalText.textContent = text;
  deleteModal.style.display = 'flex';
};

const hideDeleteModal = () => {
  deleteModal.style.display = 'none';
  deleteTargetId = null;
};

deleteCancel.addEventListener('click', hideDeleteModal);

deleteConfirm.addEventListener('click', async () => {
  if (deleteTargetId) {
    await api.obrisiProdaju(deleteTargetId);
    showToast('Prodaja obrisana');
    renderProdaje();
    if (odabraniDatum) {
      selectDan(odabraniDatum);
    }
  }
  hideDeleteModal();
});

deleteModal.addEventListener('click', (e) => {
  if (e.target === deleteModal) {
    hideDeleteModal();
  }
});

// ============ KOLIČINA ============

kolicinaMin.addEventListener('click', () => {
  if (kolicina > 1) {
    kolicina--;
    kolicinaDisplay.textContent = kolicina;
    updateUkupnoPreview();
  }
});

kolicinaPlus.addEventListener('click', () => {
  kolicina++;
  kolicinaDisplay.textContent = kolicina;
  updateUkupnoPreview();
});

cijenaInput.addEventListener('input', updateUkupnoPreview);

// ============ NAČIN PLAĆANJA ============

placanjeKes.addEventListener('click', () => {
  nacinPlacanja = 'kes';
  placanjeKes.classList.add('active');
  placanjeKartica.classList.remove('active');
});

placanjeKartica.addEventListener('click', () => {
  nacinPlacanja = 'kartica';
  placanjeKartica.classList.add('active');
  placanjeKes.classList.remove('active');
});

// ============ RETROAKTIVNI UNOS - DNEVNI PROMET ============

document.getElementById('btnRetroPromet').addEventListener('click', () => {
  if (!odabraniDatum) return;
  retroDatum = odabraniDatum;
  document.getElementById('retroPrometDatum').textContent = formatDatumKratki(retroDatum);
  document.getElementById('retroPrometIznos').value = '';
  document.getElementById('retroPrometKes').classList.add('active');
  document.getElementById('retroPrometKartica').classList.remove('active');
  retroNacinPlacanja = 'kes';
  retroPrometModal.style.display = 'flex';
});

document.getElementById('retroPrometKes').addEventListener('click', () => {
  retroNacinPlacanja = 'kes';
  document.getElementById('retroPrometKes').classList.add('active');
  document.getElementById('retroPrometKartica').classList.remove('active');
});

document.getElementById('retroPrometKartica').addEventListener('click', () => {
  retroNacinPlacanja = 'kartica';
  document.getElementById('retroPrometKartica').classList.add('active');
  document.getElementById('retroPrometKes').classList.remove('active');
});

document.getElementById('retroPrometCancel').addEventListener('click', () => {
  retroPrometModal.style.display = 'none';
});

document.getElementById('retroPrometConfirm').addEventListener('click', async () => {
  const iznos = parseFloat(document.getElementById('retroPrometIznos').value);
  if (isNaN(iznos) || iznos <= 0) {
    showToast('Unesi ispravan iznos');
    return;
  }
  
  try {
    await api.dodajDnevniPromet(iznos, retroNacinPlacanja, retroDatum);
    showToast(`💰 Dnevni promet ${formatCijena(iznos)} dodan`);
    retroPrometModal.style.display = 'none';
    renderKalendar();
    selectDan(retroDatum);
  } catch (error) {
    showToast('Greška pri spremanju');
  }
});

retroPrometModal.addEventListener('click', (e) => {
  if (e.target === retroPrometModal) {
    retroPrometModal.style.display = 'none';
  }
});

// ============ RETROAKTIVNI UNOS - ARTIKAL ============

const renderRetroArtikli = () => {
  const grid = document.getElementById('retroArtikliGrid');
  grid.innerHTML = artikli.map(a => `
    <button class="artikal-btn ${retroArtikalId === a.id ? 'selected' : ''}" data-id="${a.id}">
      <span class="artikal-ikona">${a.ikona}</span>
      <span class="artikal-naziv">${a.naziv}</span>
    </button>
  `).join('');
  
  grid.querySelectorAll('.artikal-btn').forEach(btn => {
    btn.addEventListener('click', () => selectRetroArtikal(parseInt(btn.dataset.id)));
  });
};

const selectRetroArtikal = (id) => {
  retroArtikalId = id;
  renderRetroArtikli();
  
  const artikal = artikli.find(a => a.id === id);
  const brziIznosiRetro = document.getElementById('retroBrziIznosi');
  
  if (artikal && artikal.shortcuti && artikal.shortcuti.length > 0) {
    brziIznosiRetro.innerHTML = artikal.shortcuti.map(iznos => 
      `<button class="brzi-iznos" data-iznos="${iznos}">${iznos} KM</button>`
    ).join('');
    
    brziIznosiRetro.querySelectorAll('.brzi-iznos').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('retroCijenaInput').value = btn.dataset.iznos;
        updateRetroUkupnoPreview();
      });
    });
  } else {
    brziIznosiRetro.innerHTML = '';
  }
};

const updateRetroUkupnoPreview = () => {
  const cijena = parseFloat(document.getElementById('retroCijenaInput').value) || 0;
  const ukupno = cijena * retroKolicina;
  document.getElementById('retroUkupnoPreview').innerHTML = `Ukupno: <strong>${formatCijena(ukupno)}</strong>`;
};

document.getElementById('btnRetroArtikal').addEventListener('click', () => {
  if (!odabraniDatum) return;
  retroDatum = odabraniDatum;
  retroArtikalId = null;
  retroKolicina = 1;
  retroNacinPlacanja = 'kes';
  
  document.getElementById('retroArtikalDatum').textContent = formatDatumKratki(retroDatum);
  document.getElementById('retroCijenaInput').value = '';
  document.getElementById('retroKolicinaDisplay').textContent = 1;
  document.getElementById('retroArtikalKes').classList.add('active');
  document.getElementById('retroArtikalKartica').classList.remove('active');
  document.getElementById('retroBrziIznosi').innerHTML = '';
  updateRetroUkupnoPreview();
  
  renderRetroArtikli();
  retroArtikalModal.style.display = 'flex';
});

document.getElementById('retroKolicinaMin').addEventListener('click', () => {
  if (retroKolicina > 1) {
    retroKolicina--;
    document.getElementById('retroKolicinaDisplay').textContent = retroKolicina;
    updateRetroUkupnoPreview();
  }
});

document.getElementById('retroKolicinaPlus').addEventListener('click', () => {
  retroKolicina++;
  document.getElementById('retroKolicinaDisplay').textContent = retroKolicina;
  updateRetroUkupnoPreview();
});

document.getElementById('retroCijenaInput').addEventListener('input', updateRetroUkupnoPreview);

document.getElementById('retroArtikalKes').addEventListener('click', () => {
  retroNacinPlacanja = 'kes';
  document.getElementById('retroArtikalKes').classList.add('active');
  document.getElementById('retroArtikalKartica').classList.remove('active');
});

document.getElementById('retroArtikalKartica').addEventListener('click', () => {
  retroNacinPlacanja = 'kartica';
  document.getElementById('retroArtikalKartica').classList.add('active');
  document.getElementById('retroArtikalKes').classList.remove('active');
});

document.getElementById('retroArtikalCancel').addEventListener('click', () => {
  retroArtikalModal.style.display = 'none';
});

document.getElementById('retroArtikalConfirm').addEventListener('click', async () => {
  if (!retroArtikalId) {
    showToast('Odaberi artikal');
    return;
  }
  
  const cijena = parseFloat(document.getElementById('retroCijenaInput').value);
  if (isNaN(cijena) || cijena <= 0) {
    showToast('Unesi ispravnu cijenu');
    return;
  }
  
  try {
    // Retroaktivni unos - šalje datum ali "retroaktivno" kao vrijeme
    await api.dodajProdaju(retroArtikalId, cijena, retroKolicina, retroNacinPlacanja, retroDatum, 'retroaktivno');
    const artikal = artikli.find(a => a.id === retroArtikalId);
    showToast(`${artikal.ikona} ${artikal.naziv} dodan`);
    retroArtikalModal.style.display = 'none';
    renderKalendar();
    selectDan(retroDatum);
  } catch (error) {
    showToast('Greška pri spremanju');
  }
});

retroArtikalModal.addEventListener('click', (e) => {
  if (e.target === retroArtikalModal) {
    retroArtikalModal.style.display = 'none';
  }
});

// ============ KALENDAR ============

const renderKalendar = async () => {
  mjesecGodina.textContent = `${mjeseci[trenutniMjesec]} ${trenutnaGodina}`;
  
  try {
    const statistika = await api.getStatistikaMjesec(trenutnaGodina, String(trenutniMjesec + 1));
    
    mjesecniPromet.textContent = formatCijena(statistika.ukupno);
    mjesecniBroj.textContent = `${statistika.broj_prodaja} prodaj${statistika.broj_prodaja === 1 ? 'a' : 'e'}`;
    
    if (statistika.kes > 0 || statistika.kartica > 0) {
      mjesecniPlacanje.innerHTML = `💵 ${formatCijena(statistika.kes)} | 💳 ${formatCijena(statistika.kartica)}`;
    } else {
      mjesecniPlacanje.innerHTML = '';
    }
    
    const daniSProdajama = new Set(statistika.dnevno.map(d => d.datum));
    
    const prviDan = new Date(trenutnaGodina, trenutniMjesec, 1);
    const zadnjiDan = new Date(trenutnaGodina, trenutniMjesec + 1, 0);
    const danPrvi = prviDan.getDay() === 0 ? 7 : prviDan.getDay();
    const brojDana = zadnjiDan.getDate();
    const danasDatum = danas();
    
    let html = '';
    
    for (let i = 1; i < danPrvi; i++) {
      html += '<button class="kalendar-dan prazan"></button>';
    }
    
    for (let dan = 1; dan <= brojDana; dan++) {
      const datum = `${trenutnaGodina}-${String(trenutniMjesec + 1).padStart(2, '0')}-${String(dan).padStart(2, '0')}`;
      const jeDanas = datum === danasDatum;
      const jeBuducnost = datum > danasDatum;
      const imaProdaje = daniSProdajama.has(datum);
      const jeOdabran = datum === odabraniDatum;
      
      let klase = 'kalendar-dan';
      if (jeDanas) klase += ' danas';
      if (jeBuducnost) klase += ' buducnost';
      if (imaProdaje) klase += ' ima-prodaje';
      if (jeOdabran) klase += ' odabran';
      
      html += `<button class="${klase}" data-datum="${datum}" ${jeBuducnost ? 'disabled' : ''}>${dan}</button>`;
    }
    
    kalendarDani.innerHTML = html;
    
    document.querySelectorAll('.kalendar-dan:not(.prazan):not(.buducnost)').forEach(btn => {
      btn.addEventListener('click', () => selectDan(btn.dataset.datum));
    });
  } catch (error) {
    console.error('Greška:', error);
  }
};

const selectDan = async (datum) => {
  odabraniDatum = datum;
  renderKalendar();
  
  try {
    const prodaje = await api.getProdaje(datum);
    const statistika = await api.getStatistika(datum);
    
    danDetalji.style.display = 'block';
    document.getElementById('danNaslov').textContent = formatDatum(datum);
    
    let statistikaHtml = '';
    if (statistika.po_artiklima.length === 0) {
      statistikaHtml = '<div class="prazno-stanje"><div class="prazno-ikona">📭</div><div>Nema prodaja ovaj dan</div></div>';
    } else {
      statistikaHtml = statistika.po_artiklima.map(a => `
        <div class="dan-stat-item">
          <span class="dan-stat-ikona">${a.ikona}</span>
          <div class="dan-stat-info">
            <div class="dan-stat-naziv">${a.naziv} (${a.kolicina || a.broj}×)</div>
            <div class="dan-stat-vrijednost">${formatCijena(a.ukupno)}</div>
          </div>
        </div>
      `).join('');
      
      statistikaHtml += `
        <div class="dan-stat-item" style="background: linear-gradient(135deg, rgba(0,217,165,0.2), rgba(0,217,165,0.1));">
          <span class="dan-stat-ikona">💰</span>
          <div class="dan-stat-info">
            <div class="dan-stat-naziv">Ukupno (${statistika.broj_prodaja} prodaja)</div>
            <div class="dan-stat-vrijednost" style="color: var(--success); font-size: 1.1rem;">${formatCijena(statistika.ukupno)}</div>
          </div>
        </div>
      `;
      
      if (statistika.kes > 0 || statistika.kartica > 0) {
        statistikaHtml += `
          <div class="dan-stat-item">
            <span class="dan-stat-ikona">💵</span>
            <div class="dan-stat-info">
              <div class="dan-stat-naziv">Keš</div>
              <div class="dan-stat-vrijednost">${formatCijena(statistika.kes)}</div>
            </div>
          </div>
          <div class="dan-stat-item">
            <span class="dan-stat-ikona">💳</span>
            <div class="dan-stat-info">
              <div class="dan-stat-naziv">Kartica</div>
              <div class="dan-stat-vrijednost">${formatCijena(statistika.kartica)}</div>
            </div>
          </div>
        `;
      }
    }
    document.getElementById('danStatistika').innerHTML = statistikaHtml;
    
    if (prodaje.length > 0) {
      document.getElementById('danProdaje').innerHTML = `
        <h4>Sve prodaje</h4>
        ${prodaje.map(p => `
          <div class="prodaja-item" data-id="${p._id}">
            <span class="prodaja-ikona">${p.artikal_ikona}</span>
            <div class="prodaja-info">
              <div class="prodaja-naziv">
                ${p.artikal_naziv}
                ${(p.kolicina || 1) > 1 ? `<span class="prodaja-kolicina">${p.kolicina}×</span>` : ''}
                <span class="prodaja-placanje-tag ${p.nacin_placanja || 'kes'}">${p.nacin_placanja === 'kartica' ? '💳' : '💵'}</span>
              </div>
              <div class="prodaja-meta">${p.vrijeme} • ${p.korisnik}</div>
            </div>
            <div class="prodaja-cijena">${formatCijena(p.ukupno || p.cijena)}</div>
            <button class="prodaja-delete" title="Obriši">×</button>
          </div>
        `).join('')}
      `;
      
      // Dodaj delete listenere za retroaktivne prodaje
      document.querySelectorAll('#danProdaje .prodaja-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const item = e.target.closest('.prodaja-item');
          const id = item.dataset.id;
          const naziv = item.querySelector('.prodaja-naziv').textContent.trim();
          const cijena = item.querySelector('.prodaja-cijena').textContent;
          showDeleteModal(id, `${naziv} - ${cijena}`);
        });
      });
    } else {
      document.getElementById('danProdaje').innerHTML = '';
    }
    
    danDetalji.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    console.error('Greška:', error);
  }
};

// ============ EVENT LISTENERI ============

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    if (tab.dataset.tab === 'analitika' && userRole === 'limited') {
      return;
    }
    
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    if (tab.dataset.tab === 'prodaja') {
      prodajaTab.style.display = 'block';
      analitikaTab.style.display = 'none';
      renderProdaje();
    } else {
      prodajaTab.style.display = 'none';
      analitikaTab.style.display = 'block';
      renderKalendar();
    }
  });
});

btnSpremi.addEventListener('click', async () => {
  if (!odabraniArtikalId) {
    showToast('Odaberi artikal');
    return;
  }
  
  const cijena = parseFloat(cijenaInput.value);
  if (isNaN(cijena) || cijena <= 0) {
    showToast('Unesi ispravnu cijenu');
    return;
  }
  
  try {
    // Šalje lokalni datum i vrijeme
    await api.dodajProdaju(odabraniArtikalId, cijena, kolicina, nacinPlacanja, danas(), trenutnoVrijeme());
    
    const artikal = artikli.find(a => a.id === odabraniArtikalId);
    const ukupno = cijena * kolicina;
    showToast(`${artikal.ikona} ${artikal.naziv} ${kolicina > 1 ? `(${kolicina}×)` : ''} - ${formatCijena(ukupno)}`);
    
    // Reset
    odabraniArtikalId = null;
    cijenaSection.style.display = 'none';
    cijenaInput.value = '';
    kolicina = 1;
    kolicinaDisplay.textContent = 1;
    nacinPlacanja = 'kes';
    placanjeKes.classList.add('active');
    placanjeKartica.classList.remove('active');
    renderArtikli();
    renderProdaje();
  } catch (error) {
    showToast('Greška pri spremanju');
  }
});

cijenaInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    btnSpremi.click();
  }
});

prevMonth.addEventListener('click', () => {
  trenutniMjesec--;
  if (trenutniMjesec < 0) {
    trenutniMjesec = 11;
    trenutnaGodina--;
  }
  odabraniDatum = null;
  danDetalji.style.display = 'none';
  renderKalendar();
});

nextMonth.addEventListener('click', () => {
  const now = new Date();
  if (trenutnaGodina > now.getFullYear() || 
      (trenutnaGodina === now.getFullYear() && trenutniMjesec >= now.getMonth())) {
    return;
  }
  trenutniMjesec++;
  if (trenutniMjesec > 11) {
    trenutniMjesec = 0;
    trenutnaGodina++;
  }
  odabraniDatum = null;
  danDetalji.style.display = 'none';
  renderKalendar();
});

// ============ INIT ============

const init = async () => {
  if (authToken) {
    try {
      const auth = await api.checkAuth();
      if (auth.loggedIn) {
        showApp(auth.username, auth.role);
      } else {
        showLogin();
      }
    } catch (error) {
      showLogin();
    }
  } else {
    showLogin();
  }
};

init();
