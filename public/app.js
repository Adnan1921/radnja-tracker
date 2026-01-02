// State
let artikli = [];
let odabraniArtikalId = null;
let trenutniMjesec = new Date().getMonth();
let trenutnaGodina = new Date().getFullYear();
let odabraniDatum = null;

// Elementi
const loginScreen = document.getElementById('loginScreen');
const mainApp = document.getElementById('mainApp');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const userBadge = document.getElementById('userBadge');
const btnLogout = document.getElementById('btnLogout');

const artikliGrid = document.getElementById('artikliGrid');
const cijenaSection = document.getElementById('cijenaSection');
const cijenaInput = document.getElementById('cijenaInput');
const odabraniArtikalSpan = document.getElementById('odabraniArtikal');
const brziIznosi = document.getElementById('brziIznosi');
const btnSpremi = document.getElementById('btnSpremi');
const prodajeLista = document.getElementById('prodajeLista');
const dnevniPromet = document.getElementById('dnevniPromet');
const brojProdaja = document.getElementById('brojProdaja');
const toast = document.getElementById('toast');

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

const danas = () => new Date().toISOString().split('T')[0];

const showToast = (poruka) => {
  toast.textContent = poruka;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
};

// API pozivi
const api = {
  async login(username, password) {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    return res.json();
  },
  
  async logout() {
    const res = await fetch('/api/logout', { method: 'POST' });
    return res.json();
  },
  
  async checkAuth() {
    const res = await fetch('/api/me');
    return res.json();
  },
  
  async getArtikli() {
    const res = await fetch('/api/artikli');
    if (res.status === 401) throw new Error('Unauthorized');
    return res.json();
  },
  
  async dodajProdaju(artikal_id, cijena) {
    const res = await fetch('/api/prodaje', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artikal_id, cijena })
    });
    return res.json();
  },
  
  async getProdaje(datum) {
    const res = await fetch(`/api/prodaje/${datum}`);
    return res.json();
  },
  
  async getStatistika(datum) {
    const res = await fetch(`/api/statistika/${datum}`);
    return res.json();
  },
  
  async getStatistikaMjesec(godina, mjesec) {
    const res = await fetch(`/api/statistika/mjesec/${godina}/${mjesec}`);
    return res.json();
  },
  
  async obrisiProdaju(id) {
    const res = await fetch(`/api/prodaje/${id}`, { method: 'DELETE' });
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
      showApp(result.username);
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
};

const showApp = async (username) => {
  loginScreen.style.display = 'none';
  mainApp.style.display = 'block';
  userBadge.textContent = username;
  
  // Postavi današnji datum
  document.getElementById('trenutniDatum').textContent = formatDatum(danas());
  
  // Učitaj artikle
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
  
  // Event listeneri
  document.querySelectorAll('.artikal-btn').forEach(btn => {
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
  
  // Generiraj shortcute za ovaj artikal
  if (artikal.shortcuti && artikal.shortcuti.length > 0) {
    brziIznosi.innerHTML = artikal.shortcuti.map(iznos => 
      `<button class="brzi-iznos" data-iznos="${iznos}">${iznos} KM</button>`
    ).join('');
    brziIznosi.style.display = 'flex';
    
    // Dodaj event listenere
    brziIznosi.querySelectorAll('.brzi-iznos').forEach(btn => {
      btn.addEventListener('click', () => {
        cijenaInput.value = btn.dataset.iznos;
        cijenaInput.focus();
      });
    });
  } else {
    brziIznosi.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; width: 100%; text-align: center; padding: 8px 0;">Unesi proizvoljnu cijenu</div>';
  }
  
  cijenaInput.focus();
  renderArtikli();
  
  // Scroll do cijena sekcije
  cijenaSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

const renderProdaje = async () => {
  try {
    const prodaje = await api.getProdaje(danas());
    const statistika = await api.getStatistika(danas());
    
    dnevniPromet.textContent = formatCijena(statistika.ukupno);
    brojProdaja.textContent = `${statistika.broj_prodaja} prodaj${statistika.broj_prodaja === 1 ? 'a' : 'e'}`;
    
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
          <div class="prodaja-naziv">${p.artikal_naziv}</div>
          <div class="prodaja-meta">${p.vrijeme} • ${p.korisnik}</div>
        </div>
        <div class="prodaja-cijena">${formatCijena(p.cijena)}</div>
        <button class="prodaja-delete" title="Obriši">×</button>
      </div>
    `).join('');
    
    // Delete event listeneri
    document.querySelectorAll('.prodaja-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.closest('.prodaja-item').dataset.id;
        await api.obrisiProdaju(id);
        showToast('Prodaja obrisana');
        renderProdaje();
      });
    });
  } catch (error) {
    console.error('Greška:', error);
  }
};

// ============ KALENDAR ============

const renderKalendar = async () => {
  mjesecGodina.textContent = `${mjeseci[trenutniMjesec]} ${trenutnaGodina}`;
  
  try {
    // Dohvati statistiku za mjesec
    const statistika = await api.getStatistikaMjesec(trenutnaGodina, String(trenutniMjesec + 1));
    
    mjesecniPromet.textContent = formatCijena(statistika.ukupno);
    mjesecniBroj.textContent = `${statistika.broj_prodaja} prodaj${statistika.broj_prodaja === 1 ? 'a' : 'e'}`;
    
    // Dani s prodajama
    const daniSProdajama = new Set(statistika.dnevno.map(d => d.datum));
    
    // Generiraj dane
    const prviDan = new Date(trenutnaGodina, trenutniMjesec, 1);
    const zadnjiDan = new Date(trenutnaGodina, trenutniMjesec + 1, 0);
    const danPrvi = prviDan.getDay() === 0 ? 7 : prviDan.getDay(); // Ponedjeljak = 1
    const brojDana = zadnjiDan.getDate();
    const danasDatum = danas();
    
    let html = '';
    
    // Prazni dani prije
    for (let i = 1; i < danPrvi; i++) {
      html += '<button class="kalendar-dan prazan"></button>';
    }
    
    // Dani mjeseca
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
    
    // Event listeneri
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
    
    // Statistika po artiklima
    let statistikaHtml = '';
    if (statistika.po_artiklima.length === 0) {
      statistikaHtml = '<div class="prazno-stanje"><div class="prazno-ikona">📭</div><div>Nema prodaja ovaj dan</div></div>';
    } else {
      statistikaHtml = statistika.po_artiklima.map(a => `
        <div class="dan-stat-item">
          <span class="dan-stat-ikona">${a.ikona}</span>
          <div class="dan-stat-info">
            <div class="dan-stat-naziv">${a.naziv} (${a.broj}×)</div>
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
    }
    document.getElementById('danStatistika').innerHTML = statistikaHtml;
    
    // Lista prodaja
    if (prodaje.length > 0) {
      document.getElementById('danProdaje').innerHTML = `
        <h4>Sve prodaje</h4>
        ${prodaje.map(p => `
          <div class="prodaja-item">
            <span class="prodaja-ikona">${p.artikal_ikona}</span>
            <div class="prodaja-info">
              <div class="prodaja-naziv">${p.artikal_naziv}</div>
              <div class="prodaja-meta">${p.vrijeme} • ${p.korisnik}</div>
            </div>
            <div class="prodaja-cijena">${formatCijena(p.cijena)}</div>
          </div>
        `).join('')}
      `;
    } else {
      document.getElementById('danProdaje').innerHTML = '';
    }
    
    danDetalji.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    console.error('Greška:', error);
  }
};

// ============ EVENT LISTENERI ============

// Tab navigacija
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
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

// Spremi prodaju
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
    await api.dodajProdaju(odabraniArtikalId, cijena);
    
    const artikal = artikli.find(a => a.id === odabraniArtikalId);
    showToast(`${artikal.ikona} ${artikal.naziv} - ${formatCijena(cijena)}`);
    
    // Reset
    odabraniArtikalId = null;
    cijenaSection.style.display = 'none';
    cijenaInput.value = '';
    renderArtikli();
    renderProdaje();
  } catch (error) {
    showToast('Greška pri spremanju');
  }
});

// Enter za spremanje
cijenaInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    btnSpremi.click();
  }
});

// Kalendar navigacija
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
    return; // Ne dopusti budućnost
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
  try {
    const auth = await api.checkAuth();
    if (auth.loggedIn) {
      showApp(auth.username);
    } else {
      showLogin();
    }
  } catch (error) {
    showLogin();
  }
};

init();
