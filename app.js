// ═══════════════════════════════════════════════════════════
//  THEME TOGGLE [DISABLED - Phase 1 removal]
// ═══════════════════════════════════════════════════════════
// (function initTheme() {
//   const saved = localStorage.getItem('smb-theme');
//   if (saved === 'ft') document.documentElement.setAttribute('data-theme', 'ft');
// })();

// function toggleTheme() {
//   const html = document.documentElement;
//   const thumb = document.getElementById('theme-thumb');
//   const isFT = html.getAttribute('data-theme') === 'ft';
//   if (isFT) {
//     html.removeAttribute('data-theme');
//     if (thumb) { thumb.textContent = '$'; thumb.className = 'theme-toggle-thumb dark'; }
//     localStorage.setItem('smb-theme', 'dark');
//   } else {
//     html.setAttribute('data-theme', 'ft');
//     if (thumb) { thumb.textContent = '\u00A3'; thumb.className = 'theme-toggle-thumb ft'; }
//     localStorage.setItem('smb-theme', 'ft');
//   }
//   // Redraw charts so canvas picks up new theme colors
//   try { if (typeof myChart !== 'undefined' && myChart) myChart.draw(); } catch(e) {}
//   try { if (typeof myFundChart !== 'undefined' && myFundChart) myFundChart.draw(); } catch(e) {}
//   // Redraw breakdown chart if visible
//   try { if (typeof renderStackedBarChart === 'function') renderStackedBarChart(); } catch(e) {}
// }

// // Restore toggle thumb visual on load
// document.addEventListener('DOMContentLoaded', function() {
//   const saved = localStorage.getItem('smb-theme');
//   const thumb = document.getElementById('theme-thumb');
//   if (saved === 'ft' && thumb) {
//     thumb.textContent = '\u00A3';
//     thumb.className = 'theme-toggle-thumb ft';
//   }
// });

// ═══════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════
const STORAGE_KEY = 'stockgame_v3';

// ═══════════════════════════════════════════════════════════
//  FIREBASE CONFIG  ← paste your Firebase project config here
//  Get this from: Firebase Console → Project Settings → Your apps
//  Leave as-is to run in local demo mode (no shared database)
// ═══════════════════════════════════════════════════════════
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDov2xSPmu-1Jz6SsdW5ZuUiVPCTxlrkUo",
  authDomain:        "square-mile-bets.firebaseapp.com",
  projectId:         "square-mile-bets",
  storageBucket:     "square-mile-bets.firebasestorage.app",
  messagingSenderId: "768948529412",
  appId:             "1:768948529412:web:a22789c56e8627747d0851",
  measurementId:     "G-LDX3H0910C"
};
// ── Admin email whitelist ────────────────────────────────────────────────────
const ADMIN_EMAILS = ['oscarelliston@gmail.com'];

const USE_FIREBASE = FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY" && typeof firebase !== 'undefined';
let db   = null;
let auth = null;
let currentUser = null;

if (USE_FIREBASE) {
  firebase.initializeApp(FIREBASE_CONFIG);
  db   = firebase.firestore();
  auth = firebase.auth();
}

function isAdmin() { return ADMIN_EMAILS.includes(currentUser?.email); }

function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider)
    .then(() => hide('signin-screen'))
    .catch(e => toast('Sign-in failed: ' + e.message));
}
function signOut() {
  closeUserMenu();
  auth.signOut().then(() => location.reload());
}
function toggleUserMenu() {
  const m = document.getElementById('user-menu');
  m.style.display = m.style.display === 'none' ? 'block' : 'none';
}
function closeUserMenu() {
  const m = document.getElementById('user-menu');
  if (m) m.style.display = 'none';
}
document.addEventListener('click', e => {
  if (!e.target.closest('#user-badge') && !e.target.closest('#user-menu')) closeUserMenu();
});

// Price fetching — Vercel serverless function (Yahoo Finance)
// Works for stocks, ETFs, and FX cross-rate pairs (e.g. GBPUSD=X)
async function fetchPrices(symbols) {
  const res = await fetch('/api/quote?symbols=' + encodeURIComponent(symbols.join(',')),
                          { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  const out = {};
  (data.quoteResponse?.result || []).forEach(q => {
    out[q.symbol] = {
      price:    q.regularMarketPrice,
      name:     q.shortName || q.symbol,
      change1d: q.regularMarketChangePercent,
      currency: q.currency || 'USD',
    };
  });
  return out;
}

// ═══════════════════════════════════════════════════════════
//  CATEGORY SEARCH MAP
//  Typing a theme keyword surfaces these tickers instantly,
//  before the live Yahoo autocomplete results arrive.
// ═══════════════════════════════════════════════════════════
const CATEGORY_MAP = {
  // ── Defence & Aerospace ───────────────────────────────────
  'defense':              ['LMT','RTX','NOC','GD','BA','HII','L3HIT'],
  'defence':              ['LMT','RTX','NOC','GD','BA','BA.L','QINETIQ.L'],
  'military':             ['LMT','RTX','NOC','GD','BA','BA.L'],
  'aerospace':            ['BA','LMT','NOC','RTX','RKLB','HWM'],
  'space':                ['RKLB','LMT','NOC','BA','SPCE'],

  // ── Energy & Oil ──────────────────────────────────────────
  'oil':                  ['XOM','CVX','BP.L','SHEL.L','COP','OXY','TTE','HES'],
  'energy':               ['XOM','CVX','BP.L','SHEL.L','NEE','ENPH','SSE.L','CNA.L'],
  'petroleum':            ['XOM','CVX','BP.L','SHEL.L','COP','OXY','TTE'],
  'clean energy':         ['NEE','ENPH','SEDG','FSLR','PLUG','BEP','RUN'],
  'solar':                ['ENPH','SEDG','FSLR','CSIQ','SPWR','RUN'],
  'renewables':           ['NEE','ENPH','SEDG','FSLR','BEP','SSE.L','REN'],

  // ── Banks & Finance ───────────────────────────────────────
  'banks':                ['JPM','BAC','GS','WFC','C','HSBA.L','BARC.L','LLOY.L','NWG.L','STAN.L'],
  'banking':              ['JPM','BAC','GS','WFC','C','HSBA.L','BARC.L','LLOY.L','NWG.L'],
  'finance':              ['JPM','BAC','GS','V','MA','PYPL','BLK','MS'],
  'investment banks':     ['GS','MS','JPM','BAC','C','BARC.L','HSBA.L'],
  'wealth management':    ['BLK','SCHW','MS','GS','STT','ABDN.L','IGGG.L'],
  'private equity':       ['BX','APO','KKR','CG','ARES','EQT.ST'],
  'asset management':     ['BLK','SCHW','STT','BEN','IVZ','ABDN.L'],
  'insurance':            ['AIG','MET','PRU','CB','TRV','LGEN.L','AV.L','PHNX.L'],
  'fintech':              ['SQ','PYPL','COIN','SOFI','WISE.L','NU','AFRM'],
  'payments':             ['V','MA','PYPL','SQ','WISE.L','GPN','FI'],

  // ── Technology ────────────────────────────────────────────
  'tech':                 ['AAPL','MSFT','GOOGL','META','AMZN','NVDA','TSLA','ORCL','CRM'],
  'technology':           ['AAPL','MSFT','GOOGL','META','AMZN','NVDA','TSLA','ORCL'],
  'big tech':             ['AAPL','MSFT','GOOGL','META','AMZN','NVDA'],
  'software':             ['MSFT','ORCL','CRM','NOW','ADBE','SAP','WDAY'],
  'cloud':                ['AMZN','MSFT','GOOGL','CRM','SNOW','NOW','MDB'],
  'semiconductors':       ['NVDA','AMD','INTC','QCOM','AMAT','TSM','ASML','ARM','MRVL'],
  'chips':                ['NVDA','AMD','INTC','QCOM','TSM','ARM','AMAT'],
  'artificial intelligence': ['NVDA','MSFT','GOOGL','META','PLTR','ARM','CRM','AMZN'],
  'ai':                   ['NVDA','MSFT','GOOGL','META','PLTR','ARM','CRM'],
  'cybersecurity':        ['CRWD','PANW','ZS','FTNT','S','OKTA','CYBR'],
  'cyber':                ['CRWD','PANW','ZS','FTNT','S','OKTA'],

  // ── Healthcare & Life Sciences ────────────────────────────
  'pharma':               ['JNJ','PFE','MRK','ABBV','AZN.L','GSK.L','NVS','LLY'],
  'pharmaceutical':       ['JNJ','PFE','MRK','ABBV','AZN.L','GSK.L','NVS','LLY'],
  'healthcare':           ['JNJ','UNH','ABT','MDT','AZN.L','GSK.L','CVS','HCA'],
  'biotech':              ['AMGN','GILD','REGN','VRTX','MRNA','BNTX','BIIB'],
  'drug':                 ['JNJ','PFE','MRK','ABBV','AMGN','LLY','BNTX'],
  'medtech':              ['MDT','ABT','SYK','ISRG','BSX','EW','ZBH'],
  'weight loss':          ['LLY','NVO','AMGN'],

  // ── Consumer & Retail ─────────────────────────────────────
  'retail':               ['AMZN','WMT','TGT','COST','TSCO.L','MKS.L','SBRY.L'],
  'shopping':             ['AMZN','WMT','TGT','COST','TSCO.L','SBRY.L'],
  'ecommerce':            ['AMZN','SHOP','ETSY','JD','MELI','SE'],
  'consumer staples':     ['PG','KO','PEP','ULVR.L','RECK.L','DGE.L'],
  'food':                 ['MCD','SBUX','YUM','CMG','DPZ','WING','QSR'],
  'restaurants':          ['MCD','SBUX','YUM','CMG','DPZ','WING'],
  'grocery':              ['WMT','COST','KR','TSCO.L','SBRY.L','MKS.L'],
  'tobacco':              ['BTI','MO','PM','BATS.L','IMB.L'],
  'drinks':               ['KO','PEP','DEO','BUD','SAB.L','ABEV'],
  'alcohol':              ['DEO','BUD','STZ','MO','SAB.L','ABEV'],

  // ── Media, Streaming & Entertainment ─────────────────────
  'streaming':            ['NFLX','DIS','SPOT','WBD','ROKU','PARA'],
  'media':                ['NFLX','DIS','PARA','WBD','NYT','NWSA'],
  'entertainment':        ['NFLX','DIS','SPOT','EA','TTWO','RBLX'],
  'social media':         ['META','SNAP','PINS','RDDT'],
  'gaming':               ['EA','TTWO','RBLX','NTDOY','SONY','MSFT'],
  'video games':          ['EA','TTWO','RBLX','NTDOY','SONY'],
  'music':                ['SPOT','SIRI','LYV','WMG'],

  // ── Transport & Travel ────────────────────────────────────
  'airlines':             ['DAL','UAL','AAL','LUV','IAG.L','EZJ.L','RYA.L'],
  'travel':               ['DAL','UAL','BKNG','ABNB','IAG.L','EZJ.L','EXPE'],
  'logistics':            ['UPS','FDX','XPO','GXO','DPDHL.DE'],
  'shipping':             ['ZIM','DAC','MATX','GSL'],

  // ── Autos & EVs ──────────────────────────────────────────
  'electric vehicles':    ['TSLA','RIVN','NIO','LCID','GM','F','STLA'],
  'ev':                   ['TSLA','RIVN','NIO','LCID','GM','F'],
  'cars':                 ['TSLA','GM','F','TM','STLA','HMC','RACE'],
  'autos':                ['TSLA','GM','F','TM','STLA','HMC'],

  // ── Crypto & Digital Assets ───────────────────────────────
  'crypto':               ['COIN','MSTR','RIOT','MARA','HOOD','BTBT'],
  'bitcoin':              ['COIN','MSTR','RIOT','MARA','BTBT'],
  'blockchain':           ['COIN','MSTR','RIOT','MARA'],

  // ── Real Estate & Property ────────────────────────────────
  'real estate':          ['PLD','AMT','SPG','SEGRO.L','BLND.L','LAND.L'],
  'property':             ['PLD','AMT','SPG','SEGRO.L','BLND.L','LAND.L'],
  'reits':                ['PLD','AMT','SPG','O','VICI','SEGRO.L'],

  // ── Mining & Commodities ──────────────────────────────────
  'mining':               ['RIO.L','AAL.L','GLEN.L','FCX','NEM','BHP','FRES.L'],
  'metals':               ['RIO.L','AAL.L','GLEN.L','FCX','NEM','BHP','VALE'],
  'gold':                 ['GLD','GDX','NEM','AEM','GOLD','WPM'],
  'commodities':          ['GLD','SLV','USO','FCX','GLEN.L','BHP'],
  'steel':                ['NUE','STLD','CLF','MT','BS.L'],
  'copper':               ['FCX','GLEN.L','SCCO','HBM','AAL.L'],

  // ── Luxury & Fashion ─────────────────────────────────────
  'luxury':               ['CPRI','TPR','RL','BRBY.L','BIRK','EL'],
  'fashion':              ['CPRI','TPR','RL','PVH','BRBY.L','TIF'],

  // ── UK-Listed Stocks ─────────────────────────────────────
  'london':               ['BP.L','SHEL.L','HSBA.L','BARC.L','AZN.L','GSK.L','RIO.L','LLOY.L','VOD.L','BT.L'],
  'ftse':                 ['BP.L','SHEL.L','HSBA.L','BARC.L','AZN.L','GSK.L','RIO.L','LLOY.L','NWG.L','DGE.L'],
  'uk stocks':            ['BP.L','SHEL.L','HSBA.L','BARC.L','AZN.L','GSK.L','RIO.L','LLOY.L','VOD.L','NWG.L'],
  'uk banks':             ['HSBA.L','BARC.L','LLOY.L','NWG.L','STAN.L'],
  'ftse 100':             ['BP.L','SHEL.L','HSBA.L','BARC.L','AZN.L','GSK.L','RIO.L','LLOY.L','NWG.L','GLEN.L'],

  // ── Telecoms & Utilities ──────────────────────────────────
  'telecom':              ['T','VZ','VOD.L','BT.L','TMUS','AMX'],
  'telecommunications':   ['T','VZ','VOD.L','BT.L','TMUS','AMX'],
  'utilities':            ['NEE','DUK','SO','AES','SSE.L','NG.L'],
  'infrastructure':       ['UNP','CSX','AMT','PLD','SEGRO.L','CRH.L'],
  'construction':         ['CRH.L','VMC','MLM','SUM','URI','CAT'],

  // ── Industrials ───────────────────────────────────────────
  'industrials':          ['HON','GE','MMM','CAT','DE','ETN','EMR'],
  'machinery':            ['CAT','DE','ETN','ROK','PH','IR'],
};


// ═══════════════════════════════════════════════════════════
//  TICKER → COMPANY NAME LOOKUP (for the stock browser)
// ═══════════════════════════════════════════════════════════
const TICKER_NAMES = {
  // Tech
  AAPL:'Apple',MSFT:'Microsoft',GOOGL:'Alphabet',META:'Meta',AMZN:'Amazon',
  NVDA:'NVIDIA',TSLA:'Tesla',ORCL:'Oracle',CRM:'Salesforce',NOW:'ServiceNow',
  ADBE:'Adobe',SAP:'SAP',WDAY:'Workday',SNOW:'Snowflake',MDB:'MongoDB',
  // AI / Cyber
  PLTR:'Palantir',ARM:'Arm Holdings',CRWD:'CrowdStrike',PANW:'Palo Alto Networks',
  ZS:'Zscaler',FTNT:'Fortinet',S:'SentinelOne',OKTA:'Okta',CYBR:'CyberArk',
  // Semiconductors
  AMD:'AMD',INTC:'Intel',QCOM:'Qualcomm',AMAT:'Applied Materials',
  TSM:'TSMC',ASML:'ASML',MRVL:'Marvell',
  // Finance (US)
  JPM:'JPMorgan Chase',BAC:'Bank of America',GS:'Goldman Sachs',WFC:'Wells Fargo',
  C:'Citigroup',MS:'Morgan Stanley',V:'Visa',MA:'Mastercard',PYPL:'PayPal',
  SQ:'Block',BLK:'BlackRock',SCHW:'Charles Schwab',STT:'State Street',
  BX:'Blackstone',APO:'Apollo Global',KKR:'KKR',CG:'Carlyle',ARES:'Ares Management',
  BEN:'Franklin Templeton',IVZ:'Invesco',AIG:'AIG',MET:'MetLife',PRU:'Prudential',
  CB:'Chubb',TRV:'Travelers',SOFI:'SoFi',NU:'Nu Holdings',AFRM:'Affirm',
  GPN:'Global Payments',FI:'Fiserv',
  // Finance (UK)
  'HSBA.L':'HSBC','BARC.L':'Barclays','LLOY.L':'Lloyds Banking',
  'NWG.L':'NatWest Group','STAN.L':'Standard Chartered',
  'LGEN.L':'Legal & General','AV.L':'Aviva','PHNX.L':'Phoenix Group',
  'ABDN.L':'abrdn','WISE.L':'Wise','IGGG.L':'IG Group',
  // Energy
  XOM:'Exxon Mobil',CVX:'Chevron',COP:'ConocoPhillips',OXY:'Occidental',
  TTE:'TotalEnergies',HES:'Hess',NEE:'NextEra Energy',ENPH:'Enphase Energy',
  SEDG:'SolarEdge',FSLR:'First Solar',PLUG:'Plug Power',BEP:'Brookfield Renewable',
  RUN:'Sunrun',CSIQ:'Canadian Solar',SPWR:'SunPower',
  'BP.L':'BP','SHEL.L':'Shell','SSE.L':'SSE','CNA.L':'Centrica',
  // Healthcare
  JNJ:'Johnson & Johnson',PFE:'Pfizer',MRK:'Merck',ABBV:'AbbVie',LLY:'Eli Lilly',
  NVS:'Novartis','AZN.L':'AstraZeneca','GSK.L':'GSK',UNH:'UnitedHealth',
  ABT:'Abbott',MDT:'Medtronic',CVS:'CVS Health',HCA:'HCA Healthcare',
  AMGN:'Amgen',GILD:'Gilead Sciences',REGN:'Regeneron',VRTX:'Vertex',
  MRNA:'Moderna',BNTX:'BioNTech',BIIB:'Biogen',SYK:'Stryker',
  ISRG:'Intuitive Surgical',BSX:'Boston Scientific',EW:'Edwards Lifesciences',
  // Consumer / Retail
  WMT:'Walmart',COST:'Costco',TGT:'Target',KR:'Kroger',
  'TSCO.L':'Tesco','SBRY.L':"Sainsbury's",'MKS.L':'M&S',
  SHOP:'Shopify',ETSY:'Etsy',JD:'JD.com',MELI:'MercadoLibre',SE:'Sea Limited',
  PG:'Procter & Gamble',KO:'Coca-Cola',PEP:'PepsiCo',
  'ULVR.L':'Unilever','RECK.L':'Reckitt','DGE.L':'Diageo',
  MCD:"McDonald's",SBUX:'Starbucks',YUM:'Yum! Brands',CMG:'Chipotle',
  DPZ:"Domino's",WING:'Wingstop',QSR:'Restaurant Brands',
  BTI:'British American Tobacco',MO:'Altria',PM:'Philip Morris',
  'BATS.L':'BAT','IMB.L':'Imperial Brands',
  DEO:'Diageo',BUD:'AB InBev',STZ:'Constellation Brands',
  CPRI:'Capri Holdings',TPR:'Tapestry',RL:'Ralph Lauren',PVH:'PVH Corp',
  'BRBY.L':'Burberry',BIRK:'Birkenstock',EL:'Estée Lauder',
  // Media / Entertainment
  NFLX:'Netflix',DIS:'Disney',SPOT:'Spotify',WBD:'Warner Bros Discovery',
  ROKU:'Roku',PARA:'Paramount',NYT:'New York Times',NWSA:'News Corp',
  SNAP:'Snap',PINS:'Pinterest',RDDT:'Reddit',EA:'Electronic Arts',
  TTWO:'Take-Two Interactive',RBLX:'Roblox',NTDOY:'Nintendo',SONY:'Sony',
  SIRI:'Sirius XM',LYV:'Live Nation',WMG:'Warner Music',
  // Transport / Autos / EV
  DAL:'Delta Air Lines',UAL:'United Airlines',AAL:'American Airlines',
  LUV:'Southwest Airlines','IAG.L':'IAG (British Airways)',
  'EZJ.L':'easyJet','RYA.L':'Ryanair',BKNG:'Booking Holdings',
  ABNB:'Airbnb',EXPE:'Expedia',UPS:'UPS',FDX:'FedEx',XPO:'XPO Logistics',
  GXO:'GXO Logistics',RIVN:'Rivian',NIO:'NIO',LCID:'Lucid Motors',
  GM:'General Motors',F:'Ford',STLA:'Stellantis',TM:'Toyota',HMC:'Honda',RACE:'Ferrari',
  // Crypto
  COIN:'Coinbase',MSTR:'MicroStrategy',RIOT:'Riot Platforms',
  MARA:'Marathon Digital',HOOD:'Robinhood',BTBT:'Bit Digital',
  // Real Estate
  PLD:'Prologis',AMT:'American Tower',SPG:'Simon Property Group',
  'SEGRO.L':'SEGRO','BLND.L':'British Land','LAND.L':'Land Securities',
  O:'Realty Income',VICI:'VICI Properties',
  // Mining / Metals / Gold
  'RIO.L':'Rio Tinto','AAL.L':'Anglo American','GLEN.L':'Glencore',
  FCX:'Freeport-McMoRan',NEM:'Newmont',BHP:'BHP Group',
  'FRES.L':'Fresnillo',VALE:'Vale',AEM:'Agnico Eagle',
  GOLD:'Barrick Gold',WPM:'Wheaton Precious Metals',GLD:'SPDR Gold ETF',
  GDX:'Gold Miners ETF',NUE:'Nucor',STLD:'Steel Dynamics',
  CLF:'Cleveland-Cliffs',MT:'ArcelorMittal',SCCO:'Southern Copper',
  // Defence / Aerospace
  LMT:'Lockheed Martin',RTX:'RTX Corp',NOC:'Northrop Grumman',
  GD:'General Dynamics',BA:'Boeing','BA.L':'BAE Systems',
  'QINETIQ.L':'QinetiQ',HII:'Huntington Ingalls',RKLB:'Rocket Lab',SPCE:'Virgin Galactic',
  // Telecoms / Utilities
  T:'AT&T',VZ:'Verizon','VOD.L':'Vodafone','BT.L':'BT Group',TMUS:'T-Mobile',
  DUK:'Duke Energy',SO:'Southern Company',AES:'AES Corp','NG.L':'National Grid',
  // Industrials
  HON:'Honeywell',GE:'GE Aerospace',MMM:'3M',CAT:'Caterpillar',
  DE:'John Deere',ETN:'Eaton',EMR:'Emerson',ROK:'Rockwell Automation',
  PH:'Parker Hannifin',IR:'Ingersoll Rand',URI:'United Rentals',
  VMC:'Vulcan Materials',MLM:'Martin Marietta',SUM:'Summit Materials','CRH.L':'CRH',
  // Private Equity
  'EQT.ST':'EQT',
};

// ═══════════════════════════════════════════════════════════
//  BROWSER CATEGORIES — grouped nav for the stock browser
// ═══════════════════════════════════════════════════════════
const BROWSER_CATEGORIES = [
  { group:'🤖 Technology', items:[
    {key:'big tech',       label:'Big Tech'},
    {key:'ai',             label:'Artificial Intelligence'},
    {key:'semiconductors', label:'Semiconductors'},
    {key:'software',       label:'Software'},
    {key:'cloud',          label:'Cloud Computing'},
    {key:'cybersecurity',  label:'Cybersecurity'},
  ]},
  { group:'💰 Finance', items:[
    {key:'investment banks',  label:'Investment Banks'},
    {key:'uk banks',          label:'UK Banks'},
    {key:'private equity',    label:'Private Equity'},
    {key:'wealth management', label:'Asset Management'},
    {key:'fintech',           label:'Fintech'},
    {key:'payments',          label:'Payments'},
    {key:'insurance',         label:'Insurance'},
  ]},
  { group:'⚡ Energy', items:[
    {key:'oil',          label:'Oil & Gas'},
    {key:'clean energy', label:'Clean Energy'},
    {key:'solar',        label:'Solar'},
    {key:'renewables',   label:'Renewables'},
  ]},
  { group:'💊 Healthcare', items:[
    {key:'pharma',   label:'Pharma'},
    {key:'biotech',  label:'Biotech'},
    {key:'medtech',  label:'Medtech'},
    {key:'weight loss', label:'Weight Loss'},
  ]},
  { group:'🛍 Consumer', items:[
    {key:'retail',           label:'Retail'},
    {key:'ecommerce',        label:'E-Commerce'},
    {key:'food',             label:'Food & Drink'},
    {key:'consumer staples', label:'Consumer Staples'},
    {key:'luxury',           label:'Luxury & Fashion'},
    {key:'tobacco',          label:'Tobacco'},
  ]},
  { group:'🇬🇧 UK Stocks', items:[
    {key:'ftse 100', label:'FTSE 100'},
    {key:'uk banks', label:'UK Banks'},
    {key:'london',   label:'All London'},
  ]},
  { group:'🎮 Media & Entertainment', items:[
    {key:'streaming',    label:'Streaming'},
    {key:'social media', label:'Social Media'},
    {key:'gaming',       label:'Gaming'},
    {key:'media',        label:'Media'},
  ]},
  { group:'✈️ Transport & Autos', items:[
    {key:'airlines',         label:'Airlines'},
    {key:'travel',           label:'Travel'},
    {key:'electric vehicles',label:'Electric Vehicles'},
    {key:'autos',            label:'Cars & Autos'},
  ]},
  { group:'₿ Crypto', items:[
    {key:'crypto',  label:'Crypto Stocks'},
    {key:'bitcoin', label:'Bitcoin Related'},
  ]},
  { group:'🪨 Commodities & Mining', items:[
    {key:'gold',       label:'Gold'},
    {key:'mining',     label:'Mining'},
    {key:'metals',     label:'Metals & Steel'},
    {key:'commodities',label:'Commodities'},
  ]},
  { group:'🏭 Other', items:[
    {key:'defence',        label:'Defence'},
    {key:'space',          label:'Space & Aerospace'},
    {key:'real estate',    label:'Real Estate'},
    {key:'telecom',        label:'Telecoms'},
    {key:'utilities',      label:'Utilities'},
    {key:'industrials',    label:'Industrials'},
  ]},
];

// ── Live Yahoo Finance autocomplete search ─────────────────────────────────
// Debounce timer per field
const _searchTimers = {};

function getCategoryMatches(query) {
  const q = query.toLowerCase().trim();
  for (const [keyword, tickers] of Object.entries(CATEGORY_MAP)) {
    if (q === keyword || q.includes(keyword) || keyword.includes(q)) {
      return { keyword, tickers };
    }
  }
  return null;
}

async function fetchTickerSearch(query) {
  try {
    const res = await fetch('/api/search?q=' + encodeURIComponent(query),
                            { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
  } catch { return []; }
}

const REFRESH_MS  = 5 * 60 * 1000;
const PICK_IDS      = ['pick-0','pick-1','pick-2'];
const JOIN_PICK_IDS = ['join-pick-0','join-pick-1','join-pick-2'];
const IJ_PICK_IDS   = ['ij-pick-0','ij-pick-1','ij-pick-2'];
const EP_PICK_IDS   = ['ep-pick-0','ep-pick-1','ep-pick-2'];

// ── Allocation pot constants ─────────────────────────────────────────────────
const ALLOC_TOTAL = 300;   // £ total pot per player
const ALLOC_MIN   = 50;    // £ minimum per pick
const ALLOC_MAX   = 150;   // £ maximum per pick
const ALLOC_STEP  = 10;    // £ increment/decrement step

// Allocation state for each form — reset to equal split on form open
const allocState = {
  pick: [100, 100, 100],
  join: [100, 100, 100],
  ij:   [100, 100, 100],
  ep:   [100, 100, 100],
};

const ALLOC_PICK_MAP = {
  pick: PICK_IDS,
  join: JOIN_PICK_IDS,
  ij:   IJ_PICK_IDS,
  ep:   EP_PICK_IDS,
};

// ── Allocation helpers ───────────────────────────────────────────────────────
function adjustAlloc(prefix, idx, delta) {
  const state  = allocState[prefix];
  const newVal = state[idx] + delta;
  if (newVal < ALLOC_MIN || newVal > ALLOC_MAX) return;
  state[idx] = newVal;
  renderAllocUI(prefix);
  if      (prefix === 'pick') updateAddBtn();
  else if (prefix === 'join') updateJoinBtn();
  else if (prefix === 'ij')   updateInlineJoinBtn();
  else if (prefix === 'ep')   updateEditSubmitBtn();
}

function getAllocTotal(prefix) {
  return allocState[prefix].reduce((a, b) => a + b, 0);
}

function isAllocValid(prefix) {
  return getAllocTotal(prefix) === ALLOC_TOTAL;
}

function renderAllocUI(prefix) {
  const state   = allocState[prefix];
  const pickIds = ALLOC_PICK_MAP[prefix];

  for (let i = 0; i < 3; i++) {
    const val     = state[i];
    const amtEl   = document.getElementById(`alloc-amt-${prefix}-${i}`);
    const minusEl = document.getElementById(`alloc-minus-${prefix}-${i}`);
    const plusEl  = document.getElementById(`alloc-plus-${prefix}-${i}`);
    const tickEl  = document.getElementById(`alloc-tick-${prefix}-${i}`);
    const nameEl  = document.getElementById(`alloc-name-${prefix}-${i}`);

    if (amtEl)   amtEl.textContent = '£' + val;
    if (minusEl) minusEl.disabled  = (val <= ALLOC_MIN);
    if (plusEl)  plusEl.disabled   = (val >= ALLOC_MAX);

    // Mirror the validated ticker symbol/name from the picker
    const ts = tickerState[pickIds?.[i]];
    if (tickEl) tickEl.textContent = (ts?.status === 'valid') ? ts.sym : `Pick ${i + 1}`;
    if (nameEl) nameEl.textContent = (ts?.status === 'valid') ? (ts.name.replace(/^✓\s*/,'')) : '';
  }

  const totalEl = document.getElementById(`alloc-total-${prefix}`);
  const total   = getAllocTotal(prefix);
  if (totalEl) {
    const ok = (total === ALLOC_TOTAL);
    totalEl.textContent = `£${total} ${ok ? '✓' : `(need £${ALLOC_TOTAL})`}`;
    totalEl.className   = 'alloc-total-val ' + (ok ? 'valid' : 'invalid');
  }
}

function resetAllocState(prefix) {
  allocState[prefix] = [100, 100, 100];
  renderAllocUI(prefix);
}

// ═══════════════════════════════════════════════════════════
//  DEMO DATA DEFINITIONS
// ═══════════════════════════════════════════════════════════
const DEMO_START = '2026-01-17';
const DEMO_END   = '2026-04-17';

const DEMO_PLAYERS = [
  {name:'Oscar',   picks:['AAPL','NVDA','TSLA']},
  {name:'Alice',   picks:['MSFT','AMZN','META']},
  {name:'Bob',     picks:['GOOGL','NFLX','SPOT']},
  {name:'Charlie', picks:['TSM','AMD','INTC']},
  {name:'Diana',   picks:['JPM','GS','V']},
  {name:'Eve',     picks:['BRK-B','WMT','COST']},
  {name:'Frank',   picks:['PLTR','RBLX','COIN']},
  {name:'Grace',   picks:['XOM','CVX','NEE']},
  {name:'Henry',   picks:['SPY','QQQ','IWM']},
  {name:'Isla',    picks:['PYPL','SQ','SOFI']},
];

const STOCK_DEFS = {
  AAPL:  {name:'Apple Inc.',              start:228,  gain:0.12,  vol:0.018},
  NVDA:  {name:'NVIDIA Corp.',            start:820,  gain:0.28,  vol:0.030},
  TSLA:  {name:'Tesla Inc.',              start:355,  gain:-0.08, vol:0.035},
  MSFT:  {name:'Microsoft Corp.',         start:418,  gain:0.15,  vol:0.016},
  AMZN:  {name:'Amazon.com Inc.',         start:224,  gain:0.10,  vol:0.020},
  META:  {name:'Meta Platforms Inc.',     start:595,  gain:0.22,  vol:0.025},
  GOOGL: {name:'Alphabet Inc.',           start:192,  gain:0.18,  vol:0.018},
  NFLX:  {name:'Netflix Inc.',            start:905,  gain:0.05,  vol:0.022},
  SPOT:  {name:'Spotify Technology SA',   start:475,  gain:-0.03, vol:0.025},
  TSM:   {name:'Taiwan Semiconductor',    start:182,  gain:0.25,  vol:0.022},
  AMD:   {name:'Advanced Micro Devices',  start:133,  gain:-0.15, vol:0.030},
  INTC:  {name:'Intel Corp.',             start:24,   gain:-0.20, vol:0.028},
  JPM:   {name:'JPMorgan Chase & Co.',    start:248,  gain:0.08,  vol:0.014},
  GS:    {name:'Goldman Sachs Group',     start:572,  gain:0.12,  vol:0.016},
  V:     {name:'Visa Inc.',               start:298,  gain:0.06,  vol:0.012},
  'BRK-B':{name:'Berkshire Hathaway B',  start:485,  gain:0.04,  vol:0.010},
  WMT:   {name:'Walmart Inc.',            start:94,   gain:0.02,  vol:0.012},
  COST:  {name:'Costco Wholesale Corp.',  start:958,  gain:0.07,  vol:0.014},
  PLTR:  {name:'Palantir Technologies',   start:88,   gain:0.45,  vol:0.040},
  RBLX:  {name:'Roblox Corp.',            start:52,   gain:-0.25, vol:0.040},
  COIN:  {name:'Coinbase Global Inc.',    start:318,  gain:0.35,  vol:0.045},
  XOM:   {name:'Exxon Mobil Corp.',       start:114,  gain:-0.05, vol:0.015},
  CVX:   {name:'Chevron Corp.',           start:158,  gain:-0.07, vol:0.014},
  NEE:   {name:'NextEra Energy Inc.',     start:79,   gain:-0.03, vol:0.014},
  SPY:   {name:'SPDR S&P 500 ETF',       start:582,  gain:0.10,  vol:0.012},
  QQQ:   {name:'Invesco QQQ Trust',      start:508,  gain:0.18,  vol:0.016},
  IWM:   {name:'iShares Russell 2000',   start:218,  gain:0.05,  vol:0.016},
  PYPL:  {name:'PayPal Holdings Inc.',   start:76,   gain:-0.18, vol:0.025},
  SQ:    {name:'Block Inc.',             start:67,   gain:-0.12, vol:0.030},
  SOFI:  {name:'SoFi Technologies Inc.', start:15,   gain:0.08,  vol:0.040},
  // Benchmark indices — used only for fund vs benchmark chart in demo mode
  '^FTSE':{name:'FTSE 100',              start:8500, gain:0.04,  vol:0.008},
  '^GSPC':{name:'S&P 500',              start:5800, gain:0.09,  vol:0.012},
};

const PLAYER_COLORS = [
  '#60a5fa','#34d399','#fbbf24','#f87171','#a78bfa',
  '#38bdf8','#fb923c','#f472b6','#a3e635','#818cf8',
];

// Returns an <img> for players with a Google photo, or a coloured initial circle otherwise.
// size — diameter in px.  style — extra inline style string on the wrapper.
function playerAvatar(p, size=26, style='') {
  const sz = `width:${size}px;height:${size}px;border-radius:50%;flex-shrink:0;`;
  if (p.photoURL) {
    return `<img src="${esc(p.photoURL)}" style="${sz}object-fit:cover;border:1.5px solid rgba(255,255,255,.12);${style}" onerror="this.outerHTML=playerAvatar({name:'${esc(p.name)}'},${size},'${style}')" />`;
  }
  // Deterministic colour from name
  const idx = [...(p.name||'')].reduce((a,c)=>a+c.charCodeAt(0),0) % PLAYER_COLORS.length;
  const bg  = PLAYER_COLORS[idx] || '#60a5fa';
  const fs  = Math.max(9, Math.floor(size * 0.42));
  const initial = (p.name||'?')[0].toUpperCase();
  return `<span style="${sz}background:${bg};display:inline-flex;align-items:center;justify-content:center;font-size:${fs}px;font-weight:800;color:#fff;font-family:var(--mono);${style}">${initial}</span>`;
}

// Benchmark tickers and their display metadata
const BENCHMARK_TICKERS = ['^FTSE', '^GSPC'];
const BENCHMARK_META = {
  '^FTSE': { name: 'FTSE 100', color: '#06b6d4' },
  '^GSPC': { name: 'S&P 500',  color: '#8b5cf6' },
};

// ═══════════════════════════════════════════════════════════
//  PRICE SIMULATION
// ═══════════════════════════════════════════════════════════
function seededRNG(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(1664525,s)+1013904223)>>>0; return s/4294967296; };
}

function symSeed(sym) {
  return sym.split('').reduce((a,c,i) => a + c.charCodeAt(0)*(i+7)*31, 17);
}

function generatePath(sym, nDays) {
  const {start, gain, vol} = STOCK_DEFS[sym];
  const rng      = seededRNG(symSeed(sym));
  const logDrift = Math.log(1 + gain) / nDays;
  const path     = [start];
  for (let i = 1; i < nDays; i++) {
    const u1 = Math.max(1e-10, rng());
    const u2 = rng();
    const z  = Math.sqrt(-2*Math.log(u1)) * Math.cos(2*Math.PI*u2);
    path.push(path[i-1] * Math.exp(logDrift + vol*z));
  }
  path.push(start * (1 + gain)); // exact endpoint
  return path;
}

function tradingDays(startStr, endStr) {
  const days=[], d=new Date(startStr), end=new Date(endStr);
  while (d <= end) {
    const dow=d.getDay();
    if (dow>=1&&dow<=5) days.push(d.toISOString().slice(0,10));
    d.setDate(d.getDate()+1);
  }
  return days;
}

// Pre-compute all history
const TRADING_DAYS  = tradingDays(DEMO_START, '2026-03-17');
const PRICE_HISTORY = {};
Object.keys(STOCK_DEFS).forEach(sym => { PRICE_HISTORY[sym] = generatePath(sym, TRADING_DAYS.length); });

// Legacy – kept for compatibility; no longer used directly (initChart uses £ values)
function portfolioIndexHistory(player) {
  return TRADING_DAYS.map((_, day) => {
    const sum = player.picks.reduce((a, sym) => a + (PRICE_HISTORY[sym][day] / PRICE_HISTORY[sym][0]), 0);
    return parseFloat((1000 * sum / player.picks.length).toFixed(2));
  });
}

// ═══════════════════════════════════════════════════════════
//  GAME STATE
// ═══════════════════════════════════════════════════════════
let S = {
  players:[], startPrices:{}, startDate:'', endDate:'', adminPwd:'',
  currencies:{},   // { sym: 'USD'|'GBp'|'EUR'|... } — locked at game start
  fxHistory:{},    // { date: { 'GBPUSD=X': rate, ... } } — daily FX snapshots
};
let prices        = {};
let isDemoMode    = false;
let adminUnlocked = false;
let refreshTimer  = null;
let myChart     = null;
let myFundChart = null;
let currentDashTab = 'standings';

// Setup state
let submittedPlayers = [];
let tickerState  = {};
let tickerCache  = {};
let tickerTimers = {};

// ═══════════════════════════════════════════════════════════
//  STORAGE
// ═══════════════════════════════════════════════════════════

// Save game state — Firestore if configured, localStorage otherwise
async function save() {
  if (USE_FIREBASE) {
    await db.collection('squaremile').doc('game').set(S);
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(S));
  }
}

// Local localStorage load (used when Firebase not configured)
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    if (d) S = {...S,...d};
    return !!d && S.players.length > 0;
  } catch { return false; }
}

// Firebase load (async, used when Firebase is configured)
async function loadFromFirebase() {
  try {
    const doc = await db.collection('squaremile').doc('game').get();
    if (!doc.exists || !doc.data().startDate) return false;
    S = {...S, ...doc.data()};
    return true;
  } catch(e) { console.error('Firebase load error:', e); return false; }
}

// Real-time listener — pushes updates to all connected browsers instantly
function startRealtimeSync() {
  if (!USE_FIREBASE) return;
  db.collection('squaremile').doc('game').onSnapshot(snapshot => {
    if (!snapshot.exists) return;
    const incoming = snapshot.data();
    const changed =
      JSON.stringify(incoming.players)     !== JSON.stringify(S.players) ||
      JSON.stringify(incoming.startPrices) !== JSON.stringify(S.startPrices);
    if (changed) {
      const wasLocked = Object.keys(S.startPrices || {}).length > 0;
      S = {...S, ...incoming};
      const nowLocked = Object.keys(S.startPrices || {}).length > 0;
      // If the game just started on another browser, reveal the game content
      if (!wasLocked && nowLocked) {
        hide('inline-join-panel');
        hide('faq-section');
        stopCountdown();
        show('game-content');
        refreshPrices();
      }
      renderDash();
      if (currentDashTab === 'stocks')   renderStockLeaderboard();
      if (currentDashTab === 'history')  { myChart = null; myFundChart = null; initChart(); initFundChart(); }
      updateJoinBtn();
      updateInlineJoinPanel();
      toast('🔄 Dashboard synced!');
    }
  });
}

// ═══════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════
async function init() {
  document.getElementById('start-date').value = todayStr();
  document.getElementById('ps-start-date').value = todayStr();
  PICK_IDS.forEach(id      => { tickerState[id] = {status:'idle',sym:'',name:''}; });
  JOIN_PICK_IDS.forEach(id => { tickerState[id] = {status:'idle',sym:'',name:''}; });
  IJ_PICK_IDS.forEach(id   => { tickerState[id] = {status:'idle',sym:'',name:''}; });
  EP_PICK_IDS.forEach(id   => { tickerState[id] = {status:'idle',sym:'',name:''}; });

  if (USE_FIREBASE) {
    // Track auth state in the background — does NOT block loading the game
    auth.onAuthStateChanged(user => {
      currentUser = user;
      updateUserBadge();
    });

    // Load the game immediately — no login required to view
    const loaded = await loadFromFirebase();
    if (loaded) {
      isDemoMode = false;
      startRealtimeSync();
      showDash();
      updateJoinBtn();
    } else {
      // No game exists yet — admin configures via pre-setup modal
      hide('setup-screen'); hide('dashboard-screen');
      openPresetup();
    }
  } else {
    // Local mode: fall back to localStorage, then demo data
    if (load()) {
      isDemoMode = false;
      showDash();
      updateJoinBtn();
    } else {
      loadDemoData();
      isDemoMode = true;
      showDash();
    }
  }
}

function updateUserBadge() {
  const badge   = document.getElementById('user-badge');
  const signBtn = document.getElementById('signin-topbar-btn');
  const adminBtn = document.getElementById('admin-btn');

  if (currentUser) {
    const nameEl   = document.getElementById('user-name');
    const avatarEl = document.getElementById('user-avatar');
    const emailEl  = document.getElementById('user-menu-email');
    if (badge)   badge.style.display = 'flex';
    if (signBtn) signBtn.style.display = 'none';
    if (nameEl)  nameEl.textContent = currentUser.displayName || currentUser.email || 'You';
    if (avatarEl && currentUser.photoURL) {
      avatarEl.src = currentUser.photoURL;
      avatarEl.style.display = 'block';
    }
    if (emailEl) emailEl.textContent = currentUser.email || '';
  } else {
    if (badge)    badge.style.display = 'none';
    if (signBtn)  signBtn.style.display = '';
  }

  // Only admins see the settings button
  const admin = isAdmin();
  if (adminBtn)  adminBtn.style.display = admin ? '' : 'none';

  // Setup screen: admin sees editable date fields; non-admins see read-only display
  const dateAdmin    = document.getElementById('setup-date-admin');
  const dateReadonly = document.getElementById('setup-date-readonly');
  const dateDisplay  = document.getElementById('setup-date-display');
  if (dateAdmin)    dateAdmin.style.display    = admin ? '' : 'none';
  if (dateReadonly) dateReadonly.style.display = (!admin && (S.startDate || S.endDate)) ? '' : 'none';
  if (dateDisplay && S.startDate && S.endDate) {
    const fmt = d => new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
    dateDisplay.textContent = `${fmt(S.startDate)} → ${fmt(S.endDate)}`;
  }

  // Setup screen: hide "Add Player" form if not signed in, show sign-in prompt instead
  const addPlayerSection  = document.getElementById('setup-add-player-section');
  const setupSigninPrompt = document.getElementById('setup-signin-prompt');
  if (addPlayerSection)  addPlayerSection.style.display  = currentUser ? '' : 'none';
  if (setupSigninPrompt) setupSigninPrompt.style.display = currentUser ? 'none' : '';
}

// Gate any participatory action behind auth — shows sign-in modal if needed
function requireAuth() {
  if (currentUser) return true;
  show('signin-screen');
  return false;
}

function todayStr() { return new Date().toISOString().slice(0,10); }

const DEMO_GBP_USD = 1.27;   // simulated GBP/USD rate for demo mode

function loadDemoData() {
  const lastDay = TRADING_DAYS.length - 1;
  const prevDay = lastDay - 1;

  // All demo stocks are priced in USD
  S.currencies = {};
  Object.keys(STOCK_DEFS).forEach(sym => {
    const path = PRICE_HISTORY[sym];
    prices[sym] = {
      price:    parseFloat(path[lastDay].toFixed(2)),
      name:     STOCK_DEFS[sym].name,
      change1d: (path[lastDay]/path[prevDay]-1)*100,
      currency: 'USD',
    };
    S.startPrices[sym] = path[0];
    S.currencies[sym]  = 'USD';
  });

  // Inject simulated FX rate so rawToGBP() works for USD stocks
  prices['GBPUSD=X'] = { price: DEMO_GBP_USD, name: 'GBP/USD', currency: 'USD', change1d: 0 };

  // Build demo players with equal £100/£100/£100 allocations and computed startShares
  S.players = DEMO_PLAYERS.map(p => {
    const allocations = [100, 100, 100];
    const startShares = {};
    p.picks.forEach((sym, j) => {
      const startPriceGBP  = STOCK_DEFS[sym].start / DEMO_GBP_USD;
      startShares[sym]     = allocations[j] / startPriceGBP;
    });
    return {
      ...p,
      names:       p.picks.map(sym => STOCK_DEFS[sym].name),
      allocations,
      startShares,
    };
  });

  S.startDate = DEMO_START;
  S.endDate   = DEMO_END;
  S.adminPwd  = '';
}

// ═══════════════════════════════════════════════════════════
//  LIVE SEARCH + AUTOCOMPLETE (Yahoo Finance + category map)
// ═══════════════════════════════════════════════════════════

let acActiveIdx = {};  // fieldId → highlighted dropdown index

function onPickSearch(input) {
  const id  = input.id;
  const q   = input.value.trim();

  if (!q) {
    applyTickerState(id,'idle','','');
    hideDropdown(id);
    updateAddBtn();
    clearTimeout(_searchTimers[id]);
    return;
  }

  // Already confirmed exact match — don't re-search unless text changed
  const currentSym = tickerState[id]?.sym;
  if (currentSym && q.toUpperCase() === currentSym && tickerState[id]?.status === 'valid') {
    hideDropdown(id);
    return;
  }

  applyTickerState(id, 'checking', q.toUpperCase(), '');
  updateAddBtn();

  // 1. Check category map first — instant results, no API needed
  const catMatch = getCategoryMatches(q);
  if (catMatch) {
    const catResults = catMatch.tickers.map(sym => ({ sym, name: sym, ex: 'Category: ' + catMatch.keyword, isCategory: true }));
    renderDropdown(id, catResults, catMatch.keyword);
    acActiveIdx[id] = -1;
  } else {
    // Show loading state while waiting for API
    renderDropdown(id, null); // null = show spinner
    acActiveIdx[id] = -1;
  }

  // 2. Debounce live API search (300ms)
  clearTimeout(_searchTimers[id]);
  _searchTimers[id] = setTimeout(async () => {
    const results = await fetchTickerSearch(q);
    // Only update if input value hasn't changed
    if (input.value.trim() !== q) return;
    if (results.length) {
      const formatted = results.map(r => ({
        sym: r.symbol,
        name: r.name,
        ex: r.exchange + (r.currency && r.currency !== 'USD' ? ' · ' + r.currency : ''),
      }));
      // If first result is exact ticker match, auto-confirm silently
      const exact = results.find(r => r.symbol.toUpperCase() === q.toUpperCase());
      if (exact) {
        confirmSelection(id, exact.symbol, exact.name, false);
        hideDropdown(id);
      } else {
        renderDropdown(id, formatted);
        acActiveIdx[id] = -1;
      }
    } else if (!catMatch) {
      // No results from either source
      renderDropdown(id, []);
    }
  }, 300);
}

function onPickFocus(input) {
  const id = input.id;
  const q = input.value.trim();
  if (!q) return;
  // Re-run search to restore dropdown
  onPickSearch(input);
}

function onPickKeydown(event, input) {
  const id = input.id;
  const dd = document.getElementById('dropdown-' + id);
  if (!dd || !dd.classList.contains('open')) return;
  const items = dd.querySelectorAll('.ac-item');
  if (!items.length) return;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    acActiveIdx[id] = Math.min((acActiveIdx[id] ?? -1) + 1, items.length - 1);
    acHighlight(id, items);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    acActiveIdx[id] = Math.max((acActiveIdx[id] ?? 0) - 1, 0);
    acHighlight(id, items);
  } else if (event.key === 'Enter' || event.key === 'Tab') {
    const idx = (acActiveIdx[id] >= 0) ? acActiveIdx[id] : 0;
    if (items[idx]) {
      event.preventDefault();
      const sym  = items[idx].dataset.sym;
      const name = items[idx].dataset.name;
      confirmSelection(id, sym, name, true);
    }
  } else if (event.key === 'Escape') {
    hideDropdown(id);
  }
}

function acHighlight(id, items) {
  items.forEach((item,i) => item.classList.toggle('ac-active', i === acActiveIdx[id]));
}

function acHover(id, idx) {
  acActiveIdx[id] = idx;
  const dd = document.getElementById('dropdown-' + id);
  if (dd) acHighlight(id, dd.querySelectorAll('.ac-item'));
}

function renderDropdown(id, results, categoryLabel) {
  const dd = document.getElementById('dropdown-' + id);
  if (!dd) return;

  // null = show loading spinner
  if (results === null) {
    dd.innerHTML = '<div class="ac-loading"><span style="animation:spin 0.8s linear infinite;display:inline-block">⟳</span> Searching…</div>';
    dd.classList.add('open');
    return;
  }
  if (!results.length) {
    dd.innerHTML = '<div class="ac-empty">No matches — try typing the ticker symbol directly (e.g. AAPL)</div>';
    dd.classList.add('open');
    return;
  }
  const labelHtml = categoryLabel
    ? `<div class="ac-category-label">📂 ${esc(categoryLabel)}</div>`
    : '';
  dd.innerHTML = labelHtml + results.map((r, i) =>
    `<div class="ac-item" data-idx="${i}" data-sym="${esc(r.sym)}" data-name="${esc(r.name)}"
          onmousedown="confirmSelection('${id}','${esc(r.sym)}','${esc(r.name)}',true)"
          onmouseover="acHover('${id}',${i})">
       <span class="ac-sym">${esc(r.sym)}</span>
       <span class="ac-cname">${esc(r.name)}</span>
       ${r.ex ? `<span class="ac-ex">${esc(r.ex)}</span>` : ''}
     </div>`
  ).join('');
  dd.classList.add('open');
}

function confirmSelection(id, sym, name, closeDropdown) {
  const input = document.getElementById(id);
  if (!input) return;
  input.value = sym;  // always store the ticker symbol in the field
  tickerCache[sym] = {valid:true, name};
  if (closeDropdown) hideDropdown(id);

  // Determine context: join modal, inline join panel, edit modal, or setup form?
  const isJoin   = JOIN_PICK_IDS.includes(id);
  const isInline = IJ_PICK_IDS.includes(id);
  const isEdit   = EP_PICK_IDS.includes(id);
  const currentSet = isJoin ? JOIN_PICK_IDS : isInline ? IJ_PICK_IDS : isEdit ? EP_PICK_IDS : PICK_IDS;

  // Self-duplicate check (other fields in the same form)
  const selfDupe = currentSet.some(pid => pid !== id && document.getElementById(pid)?.value.trim().toUpperCase() === sym);
  if (selfDupe) {
    applyTickerState(id, 'duplicate', sym, `⚡ You already entered ${sym}`);
  } else if (isJoin || isInline || isEdit) {
    // In join/inline/edit context: check against other live players (skip the player being edited)
    const editingIdx = isEdit ? (window._editingPlayerIdx ?? -1) : -1;
    const liveOwner = (S.players || []).find((p, i) => i !== editingIdx && p.picks.includes(sym))?.name;
    if (liveOwner) {
      applyTickerState(id, 'duplicate', sym, `⚡ Already picked by ${liveOwner}`);
    } else {
      applyTickerState(id, 'valid', sym, `✓ ${name}`);
      if (closeDropdown) {
        const idSet = isEdit ? EP_PICK_IDS : isInline ? IJ_PICK_IDS : JOIN_PICK_IDS;
        const nextEmpty = idSet.find(pid => !document.getElementById(pid)?.value.trim());
        if (nextEmpty && nextEmpty !== id) setTimeout(() => document.getElementById(nextEmpty)?.focus(), 60);
      }
    }
  } else {
    // In setup form: check against already-submitted players
    const owner = getTickerOwner(sym);
    if (owner) {
      applyTickerState(id, 'duplicate', sym, `⚡ Already picked by ${owner}`);
    } else {
      applyTickerState(id, 'valid', sym, `✓ ${name}`);
      if (closeDropdown) {
        const nextEmpty = PICK_IDS.find(pid => !document.getElementById(pid)?.value.trim());
        if (nextEmpty && nextEmpty !== id) setTimeout(() => document.getElementById(nextEmpty)?.focus(), 60);
      }
    }
  }

  if (isInline) { renderAllocUI('ij');   updateInlineJoinBtn(); }
  else if (isEdit) { renderAllocUI('ep'); updateEditSubmitBtn(); }
  else if (isJoin) { renderAllocUI('join'); updateJoinBtn(); }
  else             { renderAllocUI('pick'); updateAddBtn(); }
}

function hideDropdown(id) {
  const dd = document.getElementById('dropdown-' + id);
  if (dd) dd.classList.remove('open');
}

function hideDropdownDelay(input) {
  setTimeout(() => hideDropdown(input.id), 160);
}

function applyTickerState(id, status, sym, msg) {
  tickerState[id] = {status,sym,name:msg};
  const input=document.getElementById(id), iconEl=document.getElementById('icon-'+id), msgEl=document.getElementById('msg-'+id);
  if (!input) return;
  input.classList.remove('valid','invalid','duplicate','checking','unknown');
  iconEl.classList.remove('spinning');
  msgEl.className='pick-msg';
  const map = {
    idle:     ['','',''],
    checking: ['checking','↻','spinning'],
    valid:    ['valid','✓',''],
    invalid:  ['invalid','✗',''],
    duplicate:['duplicate','!',''],
    unknown:  ['unknown','?',''],
  };
  const [cls,icon,spin] = map[status]||map.idle;
  if (cls) input.classList.add(cls);
  iconEl.textContent=icon;
  iconEl.style.color = status==='valid'?'var(--green)':status==='invalid'?'var(--red)':status==='duplicate'?'var(--amber)':'var(--dim)';
  if (spin) iconEl.classList.add(spin);
  if (status==='valid'||status==='invalid'||status==='duplicate'||status==='unknown') msgEl.classList.add(status);
  msgEl.textContent=msg;
}

function getTickerOwner(sym) {
  for (const p of submittedPlayers) if (p.picks.includes(sym)) return p.name;
  return null;
}

function recheckCurrentInputs() {
  PICK_IDS.forEach(id => {
    const sym  = tickerState[id]?.sym;
    const name = tickerCache[sym]?.name || sym;
    if (sym && tickerState[id]?.status === 'valid') confirmSelection(id, sym, name, false);
  });
}

// ═══════════════════════════════════════════════════════════
//  SETUP FLOW
// ═══════════════════════════════════════════════════════════
function updateAddBtn() {
  const name=document.getElementById('player-name').value.trim(), hint=document.getElementById('add-hint'), btn=document.getElementById('add-btn');
  if (!name) { btn.disabled=true; hint.textContent='Enter a player name first.'; return; }
  const states=PICK_IDS.map(id=>tickerState[id]?.status||'idle');
  if (states.some(s=>s==='checking'))   { btn.disabled=true; hint.textContent='Checking tickers…'; return; }
  if (states.some(s=>s==='invalid'||s==='duplicate')) { btn.disabled=true; hint.textContent='Fix the errors above before adding.'; return; }
  const filled=PICK_IDS.filter(id=>document.getElementById(id).value.trim()).length;
  if (filled<3) { btn.disabled=true; hint.textContent=`Need all 3 picks — ${3-filled} more to go.`; return; }
  if (!states.every(s=>s==='valid'||s==='unknown')) { btn.disabled=true; hint.textContent='Waiting for ticker validation…'; return; }
  if (!isAllocValid('pick')) { btn.disabled=true; hint.textContent=`Allocation must total £${ALLOC_TOTAL} (currently £${getAllocTotal('pick')}).`; return; }
  btn.disabled=false; hint.textContent='All good — ready to add!';
}

function addPlayer() {
  const name=document.getElementById('player-name').value.trim();
  if (!name) return;
  const picks=[], names=[];
  for (const id of PICK_IDS) {
    const sym=document.getElementById(id).value.trim().toUpperCase();
    if (sym) { picks.push(sym); names.push(tickerCache[sym]?.name||sym); }
  }
  if (picks.length<3) return;
  if (!isAllocValid('pick')) { toast('⚡ Allocation must total £300 before adding.'); return; }
  if (submittedPlayers.some(p=>p.name.toLowerCase()===name.toLowerCase())) { toast('⚡ "'+name+'" already exists.'); return; }
  submittedPlayers.push({name, picks, names, allocations:[...allocState.pick]});
  renderSubmittedPlayers();
  document.getElementById('player-name').value='';
  PICK_IDS.forEach(id=>{ document.getElementById(id).value=''; applyTickerState(id,'idle','',''); });
  resetAllocState('pick');
  updateAddBtn();
  toast(`✅ ${name} added!`);
  document.getElementById('player-name').focus();
}

function removePlayer(idx) {
  const name=submittedPlayers[idx]?.name;
  submittedPlayers.splice(idx,1);
  renderSubmittedPlayers();
  recheckCurrentInputs();
  updateAddBtn();
  if (name) toast(`Removed ${name}`);
}

function renderSubmittedPlayers() {
  const section=document.getElementById('submitted-section'), list=document.getElementById('submitted-list'), countEl=document.getElementById('player-count');
  if (!submittedPlayers.length) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  countEl.textContent=submittedPlayers.length;
  list.innerHTML=submittedPlayers.map((p,i)=>`
    <div class="submitted-player">
      <span class="sp-index">${i+1}</span>
      ${playerAvatar(p, 20)}
      <span class="sp-name">${esc(p.name)}</span>
      <div class="sp-picks">${p.picks.map((s,j)=>`<span class="sp-pick" title="${esc(p.names[j]||s)} · £${p.allocations?.[j]||100}">${esc(s)}<span style="opacity:.6;font-size:9px"> £${p.allocations?.[j]||100}</span></span>`).join('')}</div>
      <button class="sp-remove" onclick="removePlayer(${i})">×</button>
    </div>`).join('');
}

async function startGame() {
  const startDate = document.getElementById('start-date').value;
  const endDate   = document.getElementById('end-date').value;
  if (!startDate) { showSetupError('Please choose a start date.'); return; }
  if (!endDate)   { showSetupError('Please choose an end date.'); return; }
  if (endDate <= startDate) { showSetupError('End date must be after start date.'); return; }
  if (!submittedPlayers.length) { showSetupError('Add at least one player first.'); return; }
  document.getElementById('setup-error').classList.add('hidden');
  S.players=submittedPlayers.map(p=>({...p}));
  S.startDate=startDate; S.endDate=endDate;
  S.startPrices={}; isDemoMode=false;
  await save();
  if (USE_FIREBASE) startRealtimeSync();
  showDash();
}

function showSetupError(msg) { const e=document.getElementById('setup-error'); e.textContent=msg; e.classList.remove('hidden'); }

// ═══════════════════════════════════════════════════════════
//  PRE-SETUP MODAL (first visitor creates the game)
// ═══════════════════════════════════════════════════════════
function openPresetup() { show('presetup-overlay'); }
function closePresetup() { hide('presetup-overlay'); }
function closePresetupIfOutside(e) { if (e.target.id === 'presetup-overlay') closePresetup(); }

async function submitPresetup() {
  const startDate = document.getElementById('ps-start-date').value;
  const endDate   = document.getElementById('ps-end-date').value;
  const errEl     = document.getElementById('presetup-error');

  if (!startDate) {
    errEl.textContent = 'Please choose a start date.';
    errEl.classList.remove('hidden'); return;
  }
  if (!endDate) {
    errEl.textContent = 'Please choose an end date.';
    errEl.classList.remove('hidden'); return;
  }
  if (endDate <= startDate) {
    errEl.textContent = 'End date must be after start date.';
    errEl.classList.remove('hidden'); return;
  }
  errEl.classList.add('hidden');

  S.startDate = startDate;
  S.endDate   = endDate;
  S.players   = [];
  S.startPrices = {};
  isDemoMode = false;

  await save();
  if (USE_FIREBASE) startRealtimeSync();
  closePresetup();
  // Show dashboard — the inline join panel will be visible automatically
  showDash();
}

// ═══════════════════════════════════════════════════════════
//  JOIN MODAL (players self-submit picks once game is set up)
// ═══════════════════════════════════════════════════════════
function openJoin() {
  // Only allow joining before start prices are locked
  if (Object.keys(S.startPrices||{}).length > 0) {
    toast('⚡ Game already started — picks are locked.'); return;
  }

  JOIN_PICK_IDS.forEach(id => {
    document.getElementById(id).value = '';
    applyTickerState(id, 'idle', '', '');
  });
  const errEl = document.getElementById('join-error');
  if (errEl) errEl.classList.add('hidden');

  // Render identity state
  const identityEl  = document.getElementById('join-identity');
  const signinEl    = document.getElementById('join-signin-prompt');
  const picksFormEl = document.getElementById('join-picks-form');
  const nameInput   = document.getElementById('join-name');
  const avatarEl    = document.getElementById('join-avatar');
  const nameEl      = document.getElementById('join-display-name');
  const emailEl     = document.getElementById('join-display-email');

  if (currentUser) {
    // Signed in — show identity badge, show picks form
    if (nameInput)   nameInput.value = currentUser.displayName || currentUser.email || '';
    if (nameEl)      nameEl.textContent  = currentUser.displayName || currentUser.email || '';
    if (emailEl)     emailEl.textContent = currentUser.email || '';
    if (avatarEl && currentUser.photoURL) {
      avatarEl.src = currentUser.photoURL;
      avatarEl.style.display = 'block';
    }
    if (identityEl)  identityEl.style.display  = 'flex';
    if (signinEl)    signinEl.style.display    = 'none';
    if (picksFormEl) picksFormEl.style.display = '';
  } else {
    // Not signed in — show sign-in prompt, hide picks form
    if (identityEl)  identityEl.style.display  = 'none';
    if (signinEl)    signinEl.style.display    = '';
    if (picksFormEl) picksFormEl.style.display = 'none';
  }

  updateJoinBtn();
  show('join-overlay');
}

function signOutAndCloseJoin() {
  closeJoin();
  if (auth) auth.signOut();
}

// ═══════════════════════════════════════════════════════════
//  STOCK BROWSER
// ═══════════════════════════════════════════════════════════
let _browserPickIds  = [];   // pick input IDs for the current context
let _browserCatKey   = null; // currently selected category key

function openStockBrowser(pickIds) {
  _browserPickIds = pickIds || [];
  _browserCatKey  = null;

  // Render category nav
  const nav = document.getElementById('sb-nav');
  nav.innerHTML = BROWSER_CATEGORIES.map(group =>
    `<div class="sb-nav-group">${esc(group.group)}</div>` +
    group.items.map(item =>
      `<button class="sb-nav-item" data-key="${esc(item.key)}" onclick="sbSelectCategory('${esc(item.key)}','${esc(item.label)}')">${esc(item.label)}</button>`
    ).join('')
  ).join('');

  document.getElementById('sb-grid').innerHTML = '';
  document.getElementById('sb-content-title').textContent = 'Select a category on the left';
  sbUpdateSlotIndicator();
  show('stock-browser-overlay');

  // Auto-open the first category for quick start
  if (BROWSER_CATEGORIES[0]?.items[0]) {
    const first = BROWSER_CATEGORIES[0].items[0];
    sbSelectCategory(first.key, first.label);
  }
}

function closeStockBrowser() { hide('stock-browser-overlay'); }
function closeBrowserIfOutside(e) { if (e.target.id === 'stock-browser-overlay') closeStockBrowser(); }

function sbUpdateSlotIndicator() {
  const el = document.getElementById('sb-slot-indicator');
  if (!el) return;
  // Find the next empty pick slot
  const emptyIdx = _browserPickIds.findIndex(id => {
    const state = tickerState[id]?.status;
    return !state || state === 'idle' || state === 'invalid';
  });
  if (emptyIdx === -1) {
    el.textContent = 'All picks filled ✓';
  } else {
    el.textContent = `Filling Pick ${emptyIdx + 1}`;
  }
}

function sbSelectCategory(key, label) {
  _browserCatKey = key;
  // Highlight active nav item
  document.querySelectorAll('.sb-nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.key === key);
  });
  document.getElementById('sb-content-title').textContent = label;

  const tickers = CATEGORY_MAP[key] || [];
  const selectedSyms = new Set(
    _browserPickIds.map(id => tickerState[id]?.sym).filter(Boolean)
  );

  const grid = document.getElementById('sb-grid');
  grid.innerHTML = tickers.map(sym => {
    const name     = TICKER_NAMES[sym] || tickerCache[sym]?.name || sym;
    const isSel    = selectedSyms.has(sym);
    const isDupe   = _browserPickIds.some(id => tickerState[id]?.sym === sym);
    return `
      <div class="sb-card ${isDupe ? 'selected' : ''}"
           onclick="sbPickStock('${esc(sym)}','${esc(name)}')"
           title="${esc(name)}">
        <div class="sb-card-ticker">${esc(sym)}</div>
        <div class="sb-card-name">${esc(name)}</div>
        ${isDupe ? '<div class="sb-card-check">✓</div>' : ''}
      </div>`;
  }).join('') || '<div style="color:var(--muted);font-size:12px;padding:8px 0">No tickers in this category</div>';
}

function sbPickStock(sym, name) {
  // Find next empty pick slot
  const targetId = _browserPickIds.find(id => {
    const state = tickerState[id]?.status;
    return !state || state === 'idle' || state === 'invalid';
  });
  if (!targetId) {
    toast('All 3 picks are already filled. Clear a pick first.');
    return;
  }

  // Fill the input and confirm the selection
  const input = document.getElementById(targetId);
  if (input) {
    input.value = sym;
    // Close any open dropdowns
    const dd = document.getElementById('dropdown-' + targetId);
    if (dd) dd.classList.remove('open');
  }
  confirmSelection(targetId, sym, name, false);

  // Refresh the grid to show updated selection state
  if (_browserCatKey) {
    const label = document.getElementById('sb-content-title').textContent;
    sbSelectCategory(_browserCatKey, label);
  }
  sbUpdateSlotIndicator();

  // Auto-close when all 3 picks are filled
  const allFilled = _browserPickIds.every(id => tickerState[id]?.status === 'valid');
  if (allFilled) {
    setTimeout(() => closeStockBrowser(), 400);
  }
}

function closeJoin() { hide('join-overlay'); }
function closeJoinIfOutside(e) { if (e.target.id === 'join-overlay') closeJoin(); }

function updateJoinBtn() {
  // Update topbar Join button visibility
  const topbarBtn = document.getElementById('join-game-btn');
  if (topbarBtn) {
    const gameConfigured = !!(S.startDate && S.endDate);
    const pricesLocked   = Object.keys(S.startPrices || {}).length > 0;
    const gameOver       = isGameOver();
    topbarBtn.style.display = (gameConfigured && !pricesLocked && !gameOver && !isDemoMode) ? '' : 'none';
  }
  // Update submit button inside the join modal
  const name  = document.getElementById('join-name')?.value.trim();
  const hint  = document.getElementById('join-hint');
  const btn   = document.getElementById('join-submit-btn');
  if (!btn) return;
  if (!name) { btn.disabled = true; if (hint) hint.textContent = 'Enter your full name first.'; return; }
  const states = JOIN_PICK_IDS.map(id => tickerState[id]?.status || 'idle');
  if (states.some(s => s === 'checking'))                      { btn.disabled = true; if (hint) hint.textContent = 'Checking tickers…'; return; }
  if (states.some(s => s === 'invalid' || s === 'duplicate'))  { btn.disabled = true; if (hint) hint.textContent = 'Fix the errors above first.'; return; }
  const filled = JOIN_PICK_IDS.filter(id => document.getElementById(id)?.value.trim()).length;
  if (filled < 3) { btn.disabled = true; if (hint) hint.textContent = `Need all 3 picks — ${3 - filled} more to go.`; return; }
  if (!states.every(s => s === 'valid' || s === 'unknown'))    { btn.disabled = true; if (hint) hint.textContent = 'Waiting for ticker validation…'; return; }
  if (!isAllocValid('join')) { btn.disabled = true; if (hint) hint.textContent = `Allocation must total £${ALLOC_TOTAL} (currently £${getAllocTotal('join')}).`; return; }
  btn.disabled = false; if (hint) hint.textContent = 'All good — ready to join!';
}

async function submitJoin() {
  const name   = document.getElementById('join-name').value.trim();
  const errEl  = document.getElementById('join-error');
  if (!name) { errEl.textContent='Please enter your full name.'; errEl.classList.remove('hidden'); return; }

  // Name uniqueness check
  if ((S.players||[]).some(p => p.name.toLowerCase() === name.toLowerCase())) {
    errEl.textContent = `"${name}" has already joined. Pick a different name.`;
    errEl.classList.remove('hidden'); return;
  }

  const picks = [], names = [];
  for (const id of JOIN_PICK_IDS) {
    const sym = document.getElementById(id).value.trim().toUpperCase();
    if (sym) { picks.push(sym); names.push(tickerCache[sym]?.name || sym); }
  }
  if (picks.length < 3) { errEl.textContent='Please enter all 3 picks.'; errEl.classList.remove('hidden'); return; }

  errEl.classList.add('hidden');
  const btn = document.getElementById('join-submit-btn');
  btn.disabled = true; btn.textContent = 'Joining…';

  if (!isAllocValid('join')) {
    errEl.textContent = 'Your allocation must total £300 before joining.';
    errEl.classList.remove('hidden'); return;
  }

  // Append to live players and save (include uid/email/photo for all-time tracking)
  S.players = [...(S.players||[]), {
    name, picks, names,
    allocations: [...allocState.join],
    uid:      currentUser?.uid      || null,
    email:    currentUser?.email    || null,
    photoURL: currentUser?.photoURL || null
  }];
  await save();

  btn.textContent = 'Join Game';
  resetAllocState('join');
  closeJoin();
  updateJoinBtn();
  toast(`✅ ${name} joined! Good luck!`);

  // If already on dashboard, re-render
  if (document.getElementById('dashboard-screen')?.style.display !== 'none') {
    renderDash();
    if (currentDashTab === 'stocks')  renderStockLeaderboard();
    if (currentDashTab === 'history') { myChart = null; myFundChart = null; initChart(); initFundChart(); }
  }
}

// ═══════════════════════════════════════════════════════════
//  INLINE JOIN PANEL (embedded in dashboard)
// ═══════════════════════════════════════════════════════════
function updateInlineJoinPanel() {
  const panel = document.getElementById('inline-join-panel');
  if (!panel) return;
  const pricesLocked = Object.keys(S.startPrices || {}).length > 0;
  const gameOver     = isGameOver();
  if (!pricesLocked && !gameOver && !isDemoMode && S.startDate) {
    panel.classList.remove('hidden');
  } else {
    panel.classList.add('hidden');
  }
  renderInlinePlayers();
  updateInlineJoinBtn();
}

let _openMenuIdx = -1;

function renderInlinePlayers() {
  const section  = document.getElementById('ij-players-section');
  const grid     = document.getElementById('ij-players-grid');
  const countEl  = document.getElementById('ij-players-count');
  if (!section || !grid) return;
  const players  = S.players || [];
  const pricesLocked = Object.keys(S.startPrices || {}).length > 0;
  if (!players.length) { section.style.display = 'none'; return; }
  section.style.display = '';
  if (countEl) countEl.textContent = players.length + ' joined';
  grid.innerHTML = players.map((p, i) => {
    const ijPaid = S.payments?.[i] === true;
    const ijPaidBadge = ijPaid
      ? `<span style="font-size:9px;font-family:var(--mono);font-weight:700;letter-spacing:.05em;color:var(--green);background:var(--green-bg);border:1px solid rgba(34,197,94,.25);border-radius:2px;padding:1px 5px;flex-shrink:0">£ PAID</span>`
      : `<span style="font-size:9px;font-family:var(--mono);font-weight:700;letter-spacing:.05em;color:var(--red);background:var(--red-bg);border:1px solid rgba(239,68,68,.2);border-radius:2px;padding:1px 5px;flex-shrink:0">£ UNPAID</span>`;
    return `
    <div class="ij-card" id="ij-card-${i}">
      <div class="ij-card-head">
        <div style="display:flex;align-items:center;gap:7px;min-width:0">
          ${playerAvatar(p, 22)}
          <div class="ij-card-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name)}</div>
          ${ijPaidBadge}
        </div>
        ${!pricesLocked && (isAdmin() || (currentUser && p.uid && currentUser.uid === p.uid)) ? `<button class="ij-card-menu-btn" onclick="togglePlayerMenu(${i},event)" title="Options">⋮</button>` : ''}
      </div>
      <div class="ij-card-picks">
        ${p.picks.map((sym, j) => `
          <div class="ij-card-pick">
            <span class="ij-card-ticker">${esc(sym)}</span>
            <span class="ij-card-fullname">${esc(p.names?.[j] || sym)}</span>
            ${p.allocations ? `<span style="font-size:10px;color:var(--dim);font-family:var(--mono);margin-left:auto;flex-shrink:0">£${p.allocations[j]||100}</span>` : ''}
          </div>`).join('')}
      </div>
      ${!pricesLocked && _openMenuIdx === i ? `
        <div class="ij-card-menu" id="ij-menu-${i}">
          <div class="ij-card-menu-item" onclick="editPlayerAtIdx(${i})">✏️ Edit picks</div>
          <div class="ij-card-menu-item danger" onclick="deletePlayerAtIdx(${i})">🗑 Remove player</div>
        </div>` : ''}
    </div>`; }).join('');
}

function togglePlayerMenu(idx, e) {
  e.stopPropagation();
  _openMenuIdx = (_openMenuIdx === idx) ? -1 : idx;
  renderInlinePlayers();
}

// Close any open menu on outside click
document.addEventListener('click', () => {
  if (_openMenuIdx !== -1) { _openMenuIdx = -1; renderInlinePlayers(); }
});

async function deletePlayerAtIdx(idx) {
  _openMenuIdx = -1;
  const p = S.players[idx];
  if (!p) return;
  if (!isAdmin() && !(currentUser && p.uid && currentUser.uid === p.uid)) {
    toast('⛔ You can only remove your own entry.');
    return;
  }
  if (!confirm(`Remove ${p.name} from the game?`)) return;
  S.players.splice(idx, 1);
  await save();
  renderInlinePlayers();
  updateInlineJoinBtn();
  toast(`Removed ${p.name}`);
}

// ── Edit player modal ───────────────────────────────────────
let _editingPlayerIdx = -1;
window._editingPlayerIdx = -1;

function editPlayerAtIdx(idx) {
  _openMenuIdx = -1;
  renderInlinePlayers();
  const p = S.players[idx];
  if (!p) return;
  if (!isAdmin() && !(currentUser && p.uid && currentUser.uid === p.uid)) {
    toast('⛔ You can only edit your own picks.');
    return;
  }
  _editingPlayerIdx = idx;
  window._editingPlayerIdx = idx;

  document.getElementById('edit-player-title').textContent = `Edit picks — ${p.name}`;
  document.getElementById('edit-player-error').classList.add('hidden');

  // Load existing allocations into stepper (or default to equal split)
  allocState.ep = p.allocations ? [...p.allocations] : [100, 100, 100];
  renderAllocUI('ep');

  // Show name field only for admins
  const epNameSection = document.getElementById('ep-name-section');
  const epNameInput = document.getElementById('ep-name');
  if (isAdmin()) {
    if (epNameSection) epNameSection.style.display = '';
    if (epNameInput) epNameInput.value = p.name;
  } else {
    if (epNameSection) epNameSection.style.display = 'none';
  }

  EP_PICK_IDS.forEach((id, j) => {
    const sym  = p.picks[j] || '';
    const name = p.names?.[j] || sym;
    const input = document.getElementById(id);
    if (input) input.value = sym;
    if (sym) {
      tickerCache[sym] = { valid: true, name };
      applyTickerState(id, 'valid', sym, `✓ ${name}`);
    } else {
      applyTickerState(id, 'idle', '', '');
    }
  });
  updateEditSubmitBtn();
  show('edit-player-overlay');
}

function closeEditPlayer() {
  hide('edit-player-overlay');
  _editingPlayerIdx = -1;
  window._editingPlayerIdx = -1;
  EP_PICK_IDS.forEach(id => applyTickerState(id, 'idle', '', ''));
}
function closeEditPlayerIfOutside(e) { if (e.target.id === 'edit-player-overlay') closeEditPlayer(); }

function updateEditSubmitBtn() {
  const btn = document.getElementById('ep-submit-btn');
  if (!btn) return;
  const states = EP_PICK_IDS.map(id => tickerState[id]?.status || 'idle');
  const filled = EP_PICK_IDS.filter(id => document.getElementById(id)?.value.trim()).length;
  const hasError = states.some(s => s === 'invalid' || s === 'duplicate');
  const checking = states.some(s => s === 'checking');
  btn.disabled = hasError || checking || filled < 3 || !isAllocValid('ep');
  btn.textContent = checking ? 'Checking…' : 'Save Changes';
}

async function submitEditPlayer() {
  const idx = _editingPlayerIdx;
  if (idx < 0 || !S.players[idx]) return;
  const errEl = document.getElementById('edit-player-error');
  const picks = [], names = [];
  for (const id of EP_PICK_IDS) {
    const sym = document.getElementById(id)?.value.trim().toUpperCase();
    if (sym) { picks.push(sym); names.push(tickerCache[sym]?.name || sym); }
  }
  if (picks.length < 3) { errEl.textContent = 'Please fill in all 3 picks.'; errEl.classList.remove('hidden'); return; }
  if (!isAllocValid('ep')) { errEl.textContent = 'Allocation must total £300.'; errEl.classList.remove('hidden'); return; }
  // Admin can edit player names; non-admins keep their existing name
  let updatedName = S.players[idx].name;
  if (isAdmin()) {
    const newName = document.getElementById('ep-name')?.value.trim();
    if (!newName) { errEl.textContent = 'Player name cannot be empty.'; errEl.classList.remove('hidden'); return; }
    updatedName = newName;
  }

  errEl.classList.add('hidden');
  S.players[idx] = { ...S.players[idx], name: updatedName, picks, names, allocations: [...allocState.ep] };
  await save();
  closeEditPlayer();
  renderInlinePlayers();
  toast(`✅ ${updatedName}'s picks updated!`);
}

function updateInlineJoinBtn() {
  const btn  = document.getElementById('ij-submit-btn');
  const hint = document.getElementById('ij-hint');
  if (!btn) return;
  const name = document.getElementById('ij-name')?.value.trim();
  if (!name) { btn.disabled = true; if (hint) hint.textContent = 'Enter your full name first.'; return; }
  const states = IJ_PICK_IDS.map(id => tickerState[id]?.status || 'idle');
  if (states.some(s => s === 'checking'))                     { btn.disabled = true; if (hint) hint.textContent = 'Checking tickers…'; return; }
  if (states.some(s => s === 'invalid' || s === 'duplicate')) { btn.disabled = true; if (hint) hint.textContent = 'Fix the errors above first.'; return; }
  const filled = IJ_PICK_IDS.filter(id => document.getElementById(id)?.value.trim()).length;
  if (filled < 3) { btn.disabled = true; if (hint) hint.textContent = `Need all 3 picks — ${3 - filled} more to go.`; return; }
  if (!states.every(s => s === 'valid' || s === 'unknown'))   { btn.disabled = true; if (hint) hint.textContent = 'Waiting for validation…'; return; }
  if (!isAllocValid('ij')) { btn.disabled = true; if (hint) hint.textContent = `Allocation must total £${ALLOC_TOTAL} (currently £${getAllocTotal('ij')}).`; return; }
  btn.disabled = false; if (hint) hint.textContent = 'Ready to join!';
}

async function submitInlineJoin() {
  if (!requireAuth()) return;
  const name   = document.getElementById('ij-name').value.trim();
  const errEl  = document.getElementById('inline-join-error');
  if (!name) { errEl.textContent = 'Please enter your full name.'; errEl.classList.remove('hidden'); return; }
  if ((S.players || []).some(p => p.name.toLowerCase() === name.toLowerCase())) {
    errEl.textContent = `"${name}" has already joined. Choose a different name.`;
    errEl.classList.remove('hidden'); return;
  }
  const picks = [], names = [];
  for (const id of IJ_PICK_IDS) {
    const sym = document.getElementById(id).value.trim().toUpperCase();
    if (sym) { picks.push(sym); names.push(tickerCache[sym]?.name || sym); }
  }
  if (picks.length < 3) { errEl.textContent = 'Please fill in all 3 picks.'; errEl.classList.remove('hidden'); return; }
  if (!isAllocValid('ij')) { errEl.textContent = 'Allocation must total £300 before joining.'; errEl.classList.remove('hidden'); return; }
  errEl.classList.add('hidden');

  const btn = document.getElementById('ij-submit-btn');
  btn.disabled = true; btn.textContent = 'Joining…';

  S.players = [...(S.players || []), {
    name, picks, names,
    allocations: [...allocState.ij],
    uid:      currentUser?.uid      || null,
    email:    currentUser?.email    || null,
    photoURL: currentUser?.photoURL || null
  }];
  await save();

  // Clear the form
  document.getElementById('ij-name').value = '';
  IJ_PICK_IDS.forEach(id => { document.getElementById(id).value = ''; applyTickerState(id, 'idle', '', ''); });
  resetAllocState('ij');
  btn.disabled = false; btn.textContent = 'Add Player';
  updateInlineJoinBtn();
  renderInlinePlayers();
  toast(`✅ ${name} joined! Good luck!`);
}

// ═══════════════════════════════════════════════════════════
//  START GAME
// ═══════════════════════════════════════════════════════════
async function startGameManually() {
  if (!S.players || S.players.length === 0) {
    toast('⚡ Add at least one player before starting.'); return;
  }
  // Admin check
  if (!isAdmin()) { toast('⛔ Only the admin can start the game.'); return; }
  if (!confirm(`Start the game now?\n\nThis will lock in today's prices as the starting point for all ${S.players.length} player(s). The leaderboard will become visible to everyone.`)) return;

  // Disable the admin panel start button while locking
  const startBtn = document.querySelector('#admin-panel .btn-primary');
  if (startBtn) { startBtn.disabled = true; startBtn.textContent = 'Locking prices…'; }

  try {
    const syms = allSymbols();
    if (!syms.length) { toast('⚡ No tickers to lock prices for.'); return; }
    // Fetch stock prices + benchmark indices together
    const p = await fetchPrices([...syms, ...BENCHMARK_TICKERS]);
    syms.forEach(s => { if (p[s]) S.startPrices[s] = p[s].price; });
    // Lock benchmark start prices so the fund chart can index from day 0
    BENCHMARK_TICKERS.forEach(b => { if (p[b]) S.startPrices[b] = p[b].price; });

    // Store currency per ticker (needed for GBP conversion throughout the season)
    S.currencies = {};
    syms.forEach(s => { if (p[s]?.currency) S.currencies[s] = p[s].currency; });

    // Fetch live FX rates needed for start-price conversion
    const fxSyms = getFXSymbols();
    const fxData = fxSyms.length ? await fetchPrices(fxSyms) : {};
    // Merge FX into live prices object
    Object.assign(p, fxData);
    prices = p;

    // Compute startShares for each player based on their allocations
    // startShares[sym] = allocation / startPriceGBP (fractional shares bought)
    S.players.forEach(player => {
      player.startShares = {};
      player.picks.forEach((sym, j) => {
        const rawPrice = S.startPrices[sym];
        if (!rawPrice) return;
        const cur      = S.currencies[sym] || 'USD';
        let priceGBP;
        if (cur === 'GBP')      priceGBP = rawPrice;
        else if (cur === 'GBp') priceGBP = rawPrice / 100;
        else {
          const fxKey  = 'GBP' + cur + '=X';
          const fxRate = fxData[fxKey]?.price;
          priceGBP = fxRate ? rawPrice / fxRate : rawPrice; // fallback: treat as GBP
        }
        const alloc           = (player.allocations?.[j] ?? 100);
        player.startShares[sym] = alloc / priceGBP;
      });
    });

    await save();

    // Hide pre-game section, reveal game content
    hide('inline-join-panel');
    hide('countdown-section');
    hide('faq-section');
    show('game-content');
    stopCountdown();

    // Render leaderboard
    hide('loading-state'); hide('error-state');
    renderDash(); show('dash-content');
    renderStockLeaderboard();
    setDot('live');
    document.getElementById('last-updated').textContent = 'Updated ' + new Date().toLocaleTimeString();

    // Kick off the normal refresh cycle
    if (!isGameOver()) refreshTimer = setTimeout(refreshPrices, REFRESH_MS);
    hide('admin-overlay');
    toast('🚀 Game started! Prices locked in.');
  } catch(e) {
    toast('❌ Failed to fetch prices: ' + e.message);
    if (startBtn) { startBtn.disabled = false; startBtn.textContent = '🚀 Start Game'; }
  }
}

// ═══════════════════════════════════════════════════════════
//  COUNTDOWN TIMER
// ═══════════════════════════════════════════════════════════
let countdownInterval = null;

function startCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);
  function tick() {
    const section = document.getElementById('countdown-section');
    if (!section) return;
    if (!S.startDate) { section.classList.add('hidden'); return; }
    const now   = new Date();
    const start = new Date(S.startDate);
    const diff  = start - now;
    if (diff <= 0 || isGameOver()) {
      section.classList.add('hidden');
      clearInterval(countdownInterval);
      countdownInterval = null;
      return;
    }
    section.classList.remove('hidden');
    const totalSecs = Math.floor(diff / 1000);
    const days  = Math.floor(totalSecs / 86400);
    const hours = Math.floor((totalSecs % 86400) / 3600);
    const mins  = Math.floor((totalSecs % 3600) / 60);
    const secs  = totalSecs % 60;
    document.getElementById('cd-days').textContent  = String(days).padStart(2, '0');
    document.getElementById('cd-hours').textContent = String(hours).padStart(2, '0');
    document.getElementById('cd-mins').textContent  = String(mins).padStart(2, '0');
    document.getElementById('cd-secs').textContent  = String(secs).padStart(2, '0');
  }
  tick();
  countdownInterval = setInterval(tick, 1000);
}

function stopCountdown() {
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
  const section = document.getElementById('countdown-section');
  if (section) section.classList.add('hidden');
}

// ═══════════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════════
function showDash() {
  hide('setup-screen'); show('dashboard-screen');
  if (isDemoMode) show('demo-notice'); else hide('demo-notice');
  if (USE_FIREBASE && !isDemoMode) show('firebase-notice'); else hide('firebase-notice');
  updateProgress();
  updateJoinBtn();
  updateInlineJoinPanel();
  startCountdown();

  const pricesLocked = Object.keys(S.startPrices || {}).length > 0;

  if (isDemoMode) {
    hide('faq-section');
    show('game-content');
    setDot('live');
    document.getElementById('last-updated').textContent = 'Simulated data';
    hide('loading-state'); hide('error-state');
    renderDash(); show('dash-content');
    renderStockLeaderboard();
  } else if (pricesLocked) {
    // Game already started — show tabs and fetch prices as normal
    hide('faq-section');
    show('game-content');
    refreshPrices();
  } else {
    // Game not yet started — hide game tabs, show pre-game view only
    hide('game-content');
    show('faq-section');
    hide('loading-state');
  }
}

function updateProgress() {
  const start=new Date(S.startDate), end=new Date(S.endDate), now=new Date();
  const total=(end-start)/864e5, elapsed=Math.max(0,(now-start)/864e5);
  const pct=Math.min(100,(elapsed/total)*100), daysLeft=Math.max(0,Math.ceil((end-now)/864e5));
  const fmt=d=>d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  document.getElementById('game-dates').textContent=fmt(start)+' → '+fmt(end);
  const fillEl = document.getElementById('progress-fill');
  fillEl.style.width=pct+'%';
  fillEl.style.background = pct>=100 ? 'linear-gradient(90deg,var(--green),var(--green))' : '';
  document.getElementById('progress-days').textContent=daysLeft>0?`Day ${Math.round(elapsed)} of ${Math.round(total)} · ${daysLeft} days left`:'🏁 Game over!';
}

// ═══════════════════════════════════════════════════════════
//  TABS
// ═══════════════════════════════════════════════════════════
function switchDashTab(tab) {
  currentDashTab=tab;
  ['standings','stocks','history'].forEach(t=>{
    document.getElementById('dt-'+t).classList.toggle('hidden',t!==tab);
    document.getElementById('dt-btn-'+t).classList.toggle('active',t===tab);
  });
  if (tab==='history') { initChart(); initFundChart(); }
  if (tab==='stocks')  renderStockLeaderboard();
}

// ═══════════════════════════════════════════════════════════
//  PRICE FETCHING (real game)
// ═══════════════════════════════════════════════════════════
function allSymbols() { return [...new Set(S.players.flatMap(p=>p.picks))]; }


async function refreshPrices() {
  if (isDemoMode) return;
  if (refreshTimer) clearTimeout(refreshTimer);
  setDot('stale'); show('loading-state'); hide('dash-content'); hide('error-state');
  const stockSyms = allSymbols();
  if (!stockSyms.length) { hide('loading-state'); return; }
  try {
    // Fetch stock prices + FX cross-rate pairs (e.g. GBPUSD=X) in one batch
    const allSyms = allSymbolsWithFX();
    prices = await fetchPrices(allSyms);

    // Save daily price + FX snapshot (once per calendar day, weekdays only)
    const todayKey     = new Date().toISOString().slice(0,10);
    const todayDow     = new Date().getUTCDay();
    const isTradingDay = todayDow !== 0 && todayDow !== 6;
    if (Object.keys(S.startPrices).length && isTradingDay) {
      if (!S.priceHistory) S.priceHistory = {};
      if (!S.fxHistory)    S.fxHistory    = {};
      // Always overwrite today's snapshot with the latest prices so the chart
      // reflects the most recent data (cron at 21:30 captures final close).
      S.priceHistory[todayKey] = {};
      stockSyms.forEach(s => { if (prices[s]) S.priceHistory[todayKey][s] = prices[s].price; });
      BENCHMARK_TICKERS.forEach(b => { if (prices[b]) S.priceHistory[todayKey][b] = prices[b].price; });
      const fxSyms = getFXSymbols();
      if (fxSyms.length) {
        S.fxHistory[todayKey] = {};
        fxSyms.forEach(s => { if (prices[s]) S.fxHistory[todayKey][s] = prices[s].price; });
      }
      save(); // fire-and-forget — persist to Firebase
    }
    if (isGameOver()) {
      setDot('stale');
      document.getElementById('last-updated').textContent = 'Final prices · game over';
    } else {
      setDot('live');
      document.getElementById('last-updated').textContent='Updated '+new Date().toLocaleTimeString();
    }
    hide('loading-state'); hide('error-state');
    renderDash(); show('dash-content');
    renderStockLeaderboard();
    // Refresh fund chart if currently visible
    if (currentDashTab === 'history') { myFundChart = null; initFundChart(); }
  } catch(e) {
    setDot('error');
    document.getElementById('last-updated').textContent='Failed to update';
    hide('loading-state');
    document.getElementById('error-msg').textContent='⚠️ Could not fetch prices ('+e.message+'). Showing last known values.';
    show('error-state');
    if (Object.keys(S.startPrices).length>0) { renderDash(); show('dash-content'); renderStockLeaderboard(); }
  }
  // Stop refreshing once the game has ended — standings are frozen
  if (!isGameOver()) {
    refreshTimer = setTimeout(refreshPrices, REFRESH_MS);
  }
}

function setDot(state) {
  const d = document.getElementById('live-dot');
  d.className = 'live-dot' + (state !== 'live' ? ' ' + state : '');
  const labels = {
    live:  'Prices are live and up to date',
    stale: 'Prices may be slightly stale',
    error: 'Price update failed — showing last known values',
  };
  const label = labels[state] || 'Loading prices…';
  d.setAttribute('aria-label', label);
  const wrap = document.getElementById('live-status-wrap');
  if (wrap) wrap.title = label;
}

// ═══════════════════════════════════════════════════════════
//  FX HELPERS
// ═══════════════════════════════════════════════════════════

// Build list of GBPXXX=X tickers needed for all non-GBP currencies in the game
function getFXSymbols() {
  if (!S.currencies) return [];
  const curs = new Set(Object.values(S.currencies));
  curs.delete('GBP'); curs.delete('GBp');
  return [...curs].map(c => 'GBP' + c + '=X');
}

// All tickers to fetch prices for: stocks + FX cross-rates + benchmark indices
function allSymbolsWithFX() {
  return [...new Set([...allSymbols(), ...getFXSymbols(), ...BENCHMARK_TICKERS])];
}

// Convert a raw price in its native currency to GBP using the live prices object
// GBp (British pence) → divide by 100
// Other currencies → divide by GBP/XXX cross-rate from Yahoo (e.g. GBPUSD=X = USD per 1 GBP)
function rawToGBP(rawPrice, currency) {
  if (!rawPrice) return null;
  currency = currency || 'USD';
  if (currency === 'GBP') return rawPrice;
  if (currency === 'GBp') return rawPrice / 100;   // pence → pounds
  const fxKey  = 'GBP' + currency + '=X';
  const fxRate = prices[fxKey]?.price;
  if (!fxRate) return null;
  return rawPrice / fxRate;
}

// ═══════════════════════════════════════════════════════════
//  CALCULATIONS  (£-based, multi-currency)
// ═══════════════════════════════════════════════════════════

// Per-stock % gain from locked start price (used in All Stocks tab)
function gainPct(sym) {
  const start = S.startPrices[sym];
  const cur   = prices[sym]?.price;
  if (!start || !cur) return null;
  return ((cur - start) / start) * 100;
}

// Current GBP value of a player's position in one stock
//   shares = player.startShares[sym] (fractional shares bought at game start)
//   price  = current price in native currency converted to GBP via live FX rate
function stockValueGBP(player, sym) {
  let shares = player.startShares?.[sym];

  // Fallback for games set up before the startShares system was introduced.
  // Compute fractional share count on-the-fly from the locked startPrices.
  if (!shares) {
    const startRaw = S.startPrices?.[sym];
    if (!startRaw) return null;
    const j      = player.picks.indexOf(sym);
    const alloc  = player.allocations?.[j] ?? 100;   // default £100 equal-weight
    const cur    = S.currencies?.[sym] || prices[sym]?.currency || 'USD';
    let startGBP;
    if      (cur === 'GBP') startGBP = startRaw;
    else if (cur === 'GBp') startGBP = startRaw / 100;
    else {
      const fxKey  = 'GBP' + cur + '=X';
      const fxRate = prices[fxKey]?.price;
      startGBP = fxRate ? startRaw / fxRate : startRaw; // treat as GBP if no FX
    }
    if (!startGBP) return null;
    shares = alloc / startGBP;
  }

  const raw = prices[sym]?.price;
  const cur = prices[sym]?.currency || S.currencies?.[sym] || 'USD';
  const gbp = rawToGBP(raw, cur);
  if (gbp === null) return null;
  return shares * gbp;
}

// Total portfolio value in GBP across all 3 picks
function portfolioValueGBP(player) {
  const vals = player.picks.map(sym => stockValueGBP(player, sym));
  if (vals.some(v => v === null)) return null;
  return vals.reduce((a, b) => a + b, 0);
}

// £ gain/loss on the £300 starting pot
function portfolioGainGBP(player) {
  const pv = portfolioValueGBP(player);
  if (pv === null) return null;
  return pv - ALLOC_TOTAL;
}

// % gain/loss on the £300 starting pot
function portfolioGainPct(player) {
  const pg = portfolioGainGBP(player);
  if (pg === null) return null;
  return (pg / ALLOC_TOTAL) * 100;
}

// Aliases used in legacy call sites
function portfolioGain(player)  { return portfolioGainPct(player); }
function portfolioValue(player) { return portfolioValueGBP(player); }

// ── Formatters ───────────────────────────────────────────────────────────────

function fmtGBP(val, showSign = false) {
  if (val === null || val === undefined) return '–';
  const abs = Math.abs(val);
  const str = abs < 1000 ? abs.toFixed(2) : abs.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (showSign ? (val >= 0 ? '+' : '−') : '') + '£' + str;
}

function fmtPct(g) {
  if (g === null || g === undefined) return '';
  return (g > 0 ? '+' : '') + g.toFixed(1) + '%';
}

function fmt(g) {  // kept for All Stocks % display
  if (g === null || g === undefined) return '–';
  return (g > 0 ? '+' : '') + g.toFixed(2) + '%';
}

function gainCls(g) {
  if (g === null || g === undefined) return '';
  return g > 0 ? 'green' : g < 0 ? 'red' : '';
}

// ═══════════════════════════════════════════════════════════
//  RENDER — STANDINGS
// ═══════════════════════════════════════════════════════════
const MEDALS=['🥇','🥈','🥉'];

function isGameOver() {
  if (!S.endDate) return false;
  return new Date() >= new Date(S.endDate);
}

let _confettiFired = false;

function renderWinnerBanner(sorted) {
  const el = document.getElementById('winner-banner');
  if (!el) return;
  if (!isGameOver() || isDemoMode || !sorted.length) { el.classList.add('hidden'); el.innerHTML=''; return; }

  const winner  = sorted[0];
  const gainTxt = winner.pv !== null
    ? `${fmtGBP(winner.pv)} &nbsp;<span style="color:var(--muted);font-size:14px">(${fmtGBP(winner.pg, true)} · ${fmtPct(winner.pct)})</span>`
    : '—';
  const endFmt  = new Date(S.endDate).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});

  const podium = sorted.slice(1, 3).map((p, i) =>
    `<span style="display:inline-flex;align-items:center;gap:5px">${MEDALS[i+1]} ${playerAvatar(p,18,'vertical-align:middle')} ${esc(p.name)}</span>${p.pv !== null
      ? ` <span style="color:var(--muted)">${fmtGBP(p.pv)}</span>` : ''}`
  ).join('<span style="color:var(--dim);margin:0 10px">·</span>');

  const wasHidden = el.classList.contains('hidden');
  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="winner-banner">
      <div class="winner-trophy">🏆</div>
      <div class="winner-body">
        <div class="winner-label">🎉 Game Over · Final Result</div>
        <div class="winner-name" style="display:flex;align-items:center;gap:9px">${playerAvatar(winner, 36)} ${esc(winner.name)} wins!</div>
        <div class="winner-gain">${gainTxt}</div>
        ${podium ? `<div class="winner-sub" style="margin-top:8px">${podium}</div>` : ''}
        <div class="winner-sub">Game ended ${endFmt} · standings frozen at final prices</div>
      </div>
    </div>
    <div class="game-over-note">The season has ended. Ask the admin to archive it to the Medal Table, then reset for the next round.</div>`;

  // Fire confetti once when the banner first appears
  if (wasHidden && !_confettiFired) { _confettiFired = true; fireConfetti(); }
}

// Calculate previous-day rankings from the most recent priceHistory snapshot
function getPreviousDayRanking() {
  const history = S.priceHistory || {};
  const todayKey = new Date().toISOString().slice(0, 10);
  // Get all dates before today, sorted descending
  const prevDates = Object.keys(history).filter(d => d < todayKey).sort().reverse();
  if (!prevDates.length) return null; // Day 1 — no previous data

  const prevDate = prevDates[0];
  const snap = history[prevDate];
  const fxSnap = (S.fxHistory || {})[prevDate] || {};

  // Calculate each player's portfolio value using the previous snapshot
  const ranked = S.players.map((p, idx) => {
    const total = p.picks.reduce((sum, sym, j) => {
      const shares = p.startShares?.[sym];
      const raw = snap?.[sym];
      if (!shares || !raw) return sum + (p.allocations?.[j] ?? 100);
      const cur = S.currencies?.[sym] || 'USD';
      let priceGBP;
      if (cur === 'GBP') priceGBP = raw;
      else if (cur === 'GBp') priceGBP = raw / 100;
      else {
        const fxKey = 'GBP' + cur + '=X';
        const fxRate = fxSnap[fxKey] ?? prices[fxKey]?.price;
        priceGBP = fxRate ? raw / fxRate : null;
      }
      return sum + (priceGBP !== null ? shares * priceGBP : (p.allocations?.[j] ?? 100));
    }, 0);
    return { origIdx: idx, pv: total };
  });

  ranked.sort((a, b) => b.pv - a.pv);
  // Return a map of origIdx → previous rank (1-based)
  const rankMap = {};
  ranked.forEach((r, i) => { rankMap[r.origIdx] = i + 1; });
  return rankMap;
}

function renderDash() {
  const sorted = S.players.map((p, idx) => ({
    ...p,
    origIdx: idx,
    pv:  portfolioValueGBP(p),     // current £ value
    pg:  portfolioGainGBP(p),      // £ gain/loss
    pct: portfolioGainPct(p),      // % gain/loss
  })).sort((a, b) => {
    if (a.pv === null && b.pv === null) return 0;
    if (a.pv === null) return 1;
    if (b.pv === null) return -1;
    return b.pv - a.pv;   // sort by highest portfolio value
  });
  renderWinnerBanner(sorted);
  renderLeaderboard(sorted);
  renderCards(sorted);
  renderStackedBarChart();

  // Hide separate cards section — picks now shown in expandable leaderboard rows
  const cardsSection = document.getElementById('cards-grid');
  const cardsSectionTitle = cardsSection?.previousElementSibling;
  if (cardsSection) cardsSection.style.display = 'none';
  if (cardsSectionTitle) cardsSectionTitle.style.display = 'none';
}

function renderLeaderboard(sorted) {
  const prevRanking = getPreviousDayRanking();
  document.getElementById('leaderboard').innerHTML = sorted.map((p, i) => {
    const currentRank = i + 1;
    const rankEl = i < 3
      ? `<span style="font-size:24px">${MEDALS[i]}</span>`
      : `<span style="font-size:14px;font-weight:700;color:var(--dim)">#${i+1}</span>`;

    // Position change arrow
    let posChangeEl = '';
    if (prevRanking) {
      const prevRank = prevRanking[p.origIdx];
      if (prevRank != null) {
        const diff = prevRank - currentRank; // positive = moved up
        if (diff > 0) {
          posChangeEl = `<span style="font-size:11px;font-weight:700;color:#16a34a;font-family:var(--mono);margin-left:0">▲${diff}</span>`;
        } else if (diff < 0) {
          posChangeEl = `<span style="font-size:11px;font-weight:700;color:#dc2626;font-family:var(--mono);margin-left:0">▼${Math.abs(diff)}</span>`;
        }
      }
    }

    const gainEl = p.pv !== null
      ? `<div class="lb-gain-wrap">
           <div class="lb-gain ${gainCls(p.pg)}">${fmtGBP(p.pv)}</div>
           <div class="lb-value ${gainCls(p.pg)}">${fmtGBP(p.pg, true)} &nbsp;<span style="color:var(--muted)">${fmtPct(p.pct)}</span></div>
         </div>`
      : `<div class="lb-gain waiting">Waiting…</div>`;
    const rowCls = i === 0 ? 'top-1' : i === 1 ? 'top-2' : i === 2 ? 'top-3' : '';

    // Add win/loss tinting classes
    const tintCls = p.pg > 0 ? 'positive' : p.pg < 0 ? 'negative' : '';

    // Add highlighted class for current signed-in user
    const isMe = currentUser && p.name && currentUser.displayName &&
      p.name.toLowerCase() === currentUser.displayName.toLowerCase();
    const meCls = isMe ? 'highlighted' : '';

    // Build expandable picks section
    const expandPicks = p.picks.map((sym, j) => {
      const svGBP = stockValueGBP(p, sym);
      const alloc = p.allocations?.[j] ?? 100;
      const data = prices[sym];
      const d1 = data?.change1d;
      const label = (p.names && p.names[j]) || data?.name || sym;
      const dayLabel = d1 != null
        ? `<span class="day-gain ${d1 >= 0 ? 'green' : 'red'}">${d1 >= 0 ? '+' : ''}${d1.toFixed(2)}% today</span>` : '';
      return `<div class="asset-row">
        <div>
          <div class="asset-name-label">${esc(label)}</div>
          <div class="asset-ticker muted">${esc(sym)}</div>
        </div>
        <div class="asset-right">
          <div class="asset-gain ${gainCls(svGBP !== null ? svGBP - alloc : null)}">${svGBP !== null ? fmtGBP(svGBP) : '—'}</div>
          ${dayLabel}
        </div>
      </div>`;
    }).join('');

    return `<div class="lb-row ${rowCls} ${tintCls} ${meCls}" onclick="toggleExpand(${i})" style="animation-delay:${i * 0.03}s">
      <div class="lb-rank">${rankEl}${posChangeEl}</div>
      <div style="display:flex;align-items:center;gap:8px;min-width:0">
        ${playerAvatar(p, 30)}
        <div style="min-width:0">
          <div class="lb-name">${esc(p.name)}</div>
          <div class="lb-picks muted">${p.picks.map(esc).join(' · ')}</div>
        </div>
      </div>
      ${gainEl}
    </div>
    <div class="lb-expand" id="lb-expand-${i}">${expandPicks}</div>`;
  }).join('');
}

function toggleExpand(idx) {
  const el = document.getElementById('lb-expand-' + idx);
  if (el) el.classList.toggle('open');
}

function renderCards(sorted) {
  document.getElementById('cards-grid').innerHTML = sorted.map((p, i) => {
    const sortedPicks = [...p.picks.map((sym, j) => ({sym, j}))].sort((a, b) => {
      const va = stockValueGBP(p, a.sym) ?? -Infinity;
      const vb = stockValueGBP(p, b.sym) ?? -Infinity;
      return vb - va;
    });
    const assets = sortedPicks.map(({sym, j}) => {
      const svGBP  = stockValueGBP(p, sym);
      const alloc  = p.allocations?.[j] ?? 100;
      const gPct   = gainPct(sym);
      const data   = prices[sym];
      const d1     = data?.change1d;
      const cur    = data?.currency || S.currencies?.[sym] || '';
      const rawPx  = data?.price;
      const dayLabel = d1 != null
        ? `<span class="day-gain ${d1 >= 0 ? 'green' : 'red'}">${d1 >= 0 ? '+' : ''}${d1.toFixed(2)}% today</span>` : '';
      const label  = (p.names && p.names[j]) || data?.name || sym;
      const curBadge = cur && cur !== 'USD' ? `<span style="font-size:9px;color:var(--muted);background:var(--surface2);border:1px solid var(--border);border-radius:2px;padding:1px 4px;font-family:var(--mono);margin-left:4px">${cur}</span>` : '';
      // Price display — GBp (pence) shown in p, others use native symbol
      const priceStr = rawPx != null
        ? (cur === 'GBp' ? `${rawPx.toFixed(0)}p` : `${rawPx.toFixed(2)}`)
        : '—';
      return `<div class="asset-row">
        <div>
          <div class="asset-name-label">${esc(label)}</div>
          <div class="asset-ticker muted">${esc(sym)}${curBadge}</div>
        </div>
        <div class="asset-right">
          <div class="asset-gain ${gainCls(svGBP !== null ? svGBP - alloc : null)}">${svGBP !== null ? fmtGBP(svGBP) : '—'}</div>
          <div style="display:flex;align-items:center;gap:6px;justify-content:flex-end">
            ${dayLabel}
            <div class="asset-price muted">${priceStr}</div>
          </div>
          <div style="font-size:10px;color:var(--muted);font-family:var(--mono);margin-top:1px">${fmtGBP(svGBP !== null ? svGBP - alloc : null, true)} on £${alloc}</div>
        </div>
      </div>`;
    }).join('');
    const rankBadge = i < 3
      ? `<span class="card-rank-medal">${MEDALS[i]}</span>`
      : `<span class="card-rank-num">${i + 1}</span>`;
    return `<div class="player-card">
      <div class="card-head">
        <div style="display:flex;align-items:center;gap:8px;min-width:0">
          ${rankBadge}
          ${playerAvatar(p, 28)}
          <div class="card-name">${esc(p.name)}</div>
        </div>
        <div class="card-gain ${gainCls(p.pg)}">${p.pv !== null ? fmtGBP(p.pv) : '—'}</div>
      </div>
      <div class="card-body">${assets}</div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════
//  RENDER — STOCK LEADERBOARD
// ═══════════════════════════════════════════════════════════
function renderStockLeaderboard() {
  const all=[];
  // Build sym→name lookup from stored player names (most reliable source)
  const nameMap = {};
  S.players.forEach(p => p.picks.forEach((sym,j) => {
    if (!nameMap[sym]) nameMap[sym] = p.names?.[j] || sym;
  }));

  S.players.forEach(p=>{
    p.picks.forEach(sym=>{
      const name = nameMap[sym] || prices[sym]?.name || sym;
      all.push({sym, name, gain:gainPct(sym), day:prices[sym]?.change1d, cur:prices[sym]?.price, player:p.name});
    });
  });
  all.sort((a,b)=>(b.gain??-999)-(a.gain??-999));

  if (!all.length) {
    document.getElementById('stock-leaderboard').innerHTML = `<div class="empty-state"><div class="icon">📊</div>Prices not yet loaded — refresh to fetch latest data.</div>`;
    return;
  }
  document.getElementById('stock-leaderboard').innerHTML=all.map((s,i)=>{
    const isPos=s.gain>=0;
    const dayHtml = s.day!=null
      ? `<div class="slb-pct ${s.day>=0?'green':'red'}" style="font-size:11px">${s.day>=0?'+':''}${s.day.toFixed(2)}%</div>`
      : `<div class="slb-pct muted">—</div>`;
    return `<div class="slb-row">
      <div class="slb-rank">${i+1}</div>
      <div class="slb-ticker ${isPos?'green':'red'}">${esc(s.sym)}</div>
      <div class="slb-name">${esc(s.name)}</div>
      <div class="slb-pct ${isPos?'green':'red'}">${fmt(s.gain)}</div>
      ${dayHtml}
      <div class="slb-player">${esc(s.player)}</div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════
//  CHART — SELF-CONTAINED CANVAS LINE CHART
// ═══════════════════════════════════════════════════════════
class LineChart {
  constructor(canvasId, opts) {
    this.canvas   = document.getElementById(canvasId);
    this.ctx      = this.canvas.getContext('2d');
    this.labels   = [];
    this.datasets = [];
    this.hidden   = new Set();
    this.hovered  = null;
    this.uiPrefix = (opts && opts.uiPrefix) || 'chart'; // prefix for zoom button IDs
    this.vs = 0;   // viewStart index (X range — always full)
    this.ve = 0;   // viewEnd index
    this.yZoom = 1.0;  // Y-axis zoom: 1.0 = default range; lower = zoomed in (tighter)
    this.yPan  = 0;    // Y-axis pan offset in data units (0 = centred on data)
    this.dragging   = false;
    this.dragY0     = 0;
    this.dragYPan0  = 0;
    this.dragDPP    = 1;  // data-units per pixel at drag start
    this._bindEvents();
    window.addEventListener('resize', ()=>this._resize());
  }

  setData(labels, datasets) {
    this.labels   = labels;
    this.datasets = datasets;
    this.vs = 0;
    this.ve = Math.max(0, labels.length - 1);
    this.yZoom = 1.0;
    this.yPan  = 0;
    this._resize();
    this._updateUI();
  }

  resetZoom() {
    this.yZoom = 1.0;
    this.yPan  = 0;
    this._updateUI(); this.draw();
  }

  isZoomed() { return this.yZoom < 0.99 || Math.abs(this.yPan) > 0.5; }

  _resize() {
    const w = this.canvas.parentElement.clientWidth || 800;
    this.canvas.width  = w;
    this.canvas.height = Math.min(460, Math.max(300, Math.round(w * 0.46)));
    this.draw();
  }

  _m()  { return {t:24, r:24, b:54, l:58}; }
  _p()  { const m=this._m(), W=this.canvas.width, H=this.canvas.height; return {x:m.l,y:m.t,w:W-m.l-m.r,h:H-m.t-m.b}; }

  _yRange() {
    const vis = this.datasets.filter((_,i)=>!this.hidden.has(i)).flatMap(d=>d.data.slice(this.vs, this.ve+1));
    if (!vis.length) return {mn:880,mx:1120};
    const mn=Math.min(...vis), mx=Math.max(...vis);
    const range = mx - mn;
    const pad = Math.max(range * 0.08, 3); // Tighter 8% padding, min 3 units
    const baseMn = mn - pad, baseMx = mx + pad;
    const mid = (baseMn + baseMx) / 2, halfSpan = (baseMx - baseMn) / 2;
    const z = Math.max(0.07, Math.min(1.5, this.yZoom));
    const zHalf = halfSpan * z;
    const centre = mid + this.yPan;
    // Smart rounding: use £1 steps for tight ranges, £5 for medium, £10 for wide
    const span = zHalf * 2;
    const roundTo = span < 20 ? 1 : span < 60 ? 2 : span < 150 ? 5 : 10;
    return {mn:Math.floor((centre-zHalf)/roundTo)*roundTo, mx:Math.ceil((centre+zHalf)/roundTo)*roundTo};
  }

  _xS(i,p) { const r=Math.max(1,this.ve-this.vs); return p.x+((i-this.vs)/r)*p.w; }
  _yS(v,p,r){ return p.y+p.h-((v-r.mn)/(r.mx-r.mn))*p.h; }

  draw() {
    const ctx=this.ctx, p=this._p(), r=this._yRange();
    const vs=this.vs, ve=this.ve;
    ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
    ctx.font='11px -apple-system,BlinkMacSystemFont,sans-serif';

    // Theme-aware chart colors
    const _cs = getComputedStyle(document.documentElement);
    const _grid = _cs.getPropertyValue('--border2').trim() || '#1c2840';
    const _lbl  = _cs.getPropertyValue('--muted').trim() || '#5a6e96';
    const _dim  = _cs.getPropertyValue('--dim').trim() || '#3a4e72';

    // Y grid + labels — adaptive step size for finer gridlines
    const ySpan = r.mx - r.mn;
    const targetLines = 8;
    const rawStep = ySpan / targetLines;
    // Pick a nice step: 1, 2, 5, 10, 20, 50, 100...
    const niceSteps = [1, 2, 5, 10, 20, 50, 100, 200, 500];
    const yStep = niceSteps.find(s => s >= rawStep) || Math.ceil(rawStep / 100) * 100;
    for (let v = Math.ceil(r.mn / yStep) * yStep; v <= r.mx + 0.01; v += yStep) {
      const y=this._yS(v,p,r);
      ctx.strokeStyle=_grid; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(p.x,y); ctx.lineTo(p.x+p.w,y); ctx.stroke();
      ctx.fillStyle=_lbl; ctx.textAlign='right';
      const label = yStep < 1 ? v.toFixed(1) : v.toFixed(0);
      ctx.fillText(label, p.x-7, y+4);
    }

    // X grid + labels (visible range only)
    const visLen=ve-vs+1, xStep=Math.max(1,Math.ceil(visLen/9));
    ctx.font='12px -apple-system,BlinkMacSystemFont,sans-serif';
    for (let i=vs; i<=ve; i+=xStep) {
      const x=this._xS(i,p);
      ctx.strokeStyle=_grid; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(x,p.y); ctx.lineTo(x,p.y+p.h); ctx.stroke();
      ctx.fillStyle=_lbl; ctx.textAlign='center';
      ctx.fillText(this.labels[i], x, p.y+p.h+20);
    }
    ctx.font='11px -apple-system,BlinkMacSystemFont,sans-serif';

    // Clip all drawn content to chart area
    ctx.save();
    ctx.beginPath(); ctx.rect(p.x,p.y,p.w,p.h); ctx.clip();

    // Baseline reference line (configurable via this.baseline; default 1000 for legacy portfolio chart)
    const baselineVal = (this.baseline !== undefined) ? this.baseline : 1000;
    const y0=this._yS(baselineVal,p,r);
    if (y0>=p.y&&y0<=p.y+p.h) {
      ctx.setLineDash([5,4]); ctx.strokeStyle=_dim; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(p.x,y0); ctx.lineTo(p.x+p.w,y0); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle=_dim; ctx.textAlign='left'; ctx.font='10px sans-serif';
      ctx.fillText('start', p.x+5, y0-5);
    }

    // Dataset lines (1 point buffer beyond view for clean clip)
    ctx.lineJoin='round'; ctx.lineCap='round';
    this.datasets.forEach((ds,i)=>{
      if (this.hidden.has(i)) return;
      const j0=Math.max(0,vs-1), j1=Math.min(ds.data.length-1,ve+1);
      const isDashed = ds.label === 'Fund Average';
      if (isDashed) ctx.setLineDash([8, 4]);
      ctx.beginPath(); ctx.strokeStyle=ds.color; ctx.lineWidth=isDashed ? 3 : 2.5;
      for (let j=j0; j<=j1; j++) {
        const x=this._xS(j,p), y=this._yS(ds.data[j],p,r);
        j===j0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
      }
      ctx.stroke();
      if (isDashed) ctx.setLineDash([]);
    });

    // Hover crosshair + dots
    if (this.hovered!==null && this.hovered>=vs && this.hovered<=ve) {
      const x=this._xS(this.hovered,p);
      ctx.setLineDash([3,3]); ctx.strokeStyle=_lbl; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(x,p.y); ctx.lineTo(x,p.y+p.h); ctx.stroke();
      ctx.setLineDash([]);
      const _isFT = document.documentElement.getAttribute('data-theme') === 'ft';
      this.datasets.forEach((ds,i)=>{
        if (this.hidden.has(i)) return;
        const v=ds.data[this.hovered], ys=this._yS(v,p,r);
        ctx.beginPath(); ctx.fillStyle=ds.color;
        ctx.arc(x,ys,4.5,0,Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.strokeStyle=_isFT?'rgba(0,0,0,.15)':'rgba(255,255,255,.25)'; ctx.lineWidth=1.5;
        ctx.arc(x,ys,4.5,0,Math.PI*2); ctx.stroke();
      });
    }
    ctx.restore();
  }

  // factor < 1 = zoom in (tighter Y range, differences look bigger)
  // factor > 1 = zoom out (wider Y range)
  _zoom(factor) {
    this.yZoom = Math.max(0.07, Math.min(1.5, this.yZoom * factor));
    this._updateUI(); this.draw();
  }

  _updateUI() {
    this.canvas.style.cursor = this.dragging ? 'grabbing' : (this.yZoom < 0.99 ? 'grab' : 'crosshair');
    const zoomed = this.isZoomed();
    const pfx = this.uiPrefix;

    // Reset button: hidden when not zoomed; glows when active
    const resetBtn = document.getElementById(pfx + '-reset-zoom');
    if (resetBtn) {
      if (zoomed) {
        resetBtn.style.display = 'inline-flex';
        resetBtn.style.background = 'var(--accent)';
        resetBtn.style.color = '#fff';
        resetBtn.style.borderColor = 'var(--accent)';
        resetBtn.style.boxShadow = '0 0 10px rgba(59,130,246,.45)';
        resetBtn.style.fontWeight = '700';
      } else {
        resetBtn.style.display = 'none';
        resetBtn.style.background = '';
        resetBtn.style.color = '';
        resetBtn.style.borderColor = '';
        resetBtn.style.boxShadow = '';
        resetBtn.style.fontWeight = '';
      }
    }

    const zoomIn  = document.getElementById(pfx + '-zoom-in');
    const zoomOut = document.getElementById(pfx + '-zoom-out');
    const hint    = document.getElementById(pfx + '-zoom-hint');
    if (zoomIn)  zoomIn.disabled  = this.yZoom <= 0.08;
    if (zoomOut) zoomOut.disabled = this.yZoom >= 1.49;
    if (hint) hint.textContent = 'scroll or + / − to zoom · drag to pan up/down';
  }

  _bindEvents() {
    const c = this.canvas;

    // Scroll wheel = Y-axis zoom (up = zoom in, down = zoom out)
    c.addEventListener('wheel', e=>{
      e.preventDefault();
      this._zoom(e.deltaY > 0 ? 1.3 : 0.77);
    }, {passive:false});

    // Double-click = reset zoom + pan
    c.addEventListener('dblclick', ()=>this.resetZoom());

    // Mousedown — start drag pan (only when zoomed in)
    c.addEventListener('mousedown', e=>{
      if (this.yZoom >= 0.99) return;   // only pan when zoomed in
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      this.dragging  = true;
      this.dragY0    = (e.clientY - rect.top) * (c.height / rect.height);
      this.dragYPan0 = this.yPan;
      const r = this._yRange(), p = this._p();
      this.dragDPP   = (r.mx - r.mn) / p.h;   // data-units per pixel, fixed at drag start
      this._updateUI();
    });

    c.addEventListener('mouseup',   ()=>{ this.dragging = false; this._updateUI(); });
    c.addEventListener('mouseleave', e=>{
      if (!this.dragging) {
        this.hovered = null;
        this.draw();
        const t=document.getElementById('chart-tooltip'); if(t)t.style.display='none';
      }
    });

    c.addEventListener('mousemove', e=>{
      const rect = c.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (c.width  / rect.width);
      const cy = (e.clientY - rect.top)  * (c.height / rect.height);
      const p  = this._p();

      if (this.dragging) {
        // Drag up → see higher values (pan up): subtract pixel delta × DPP
        this.yPan = this.dragYPan0 + (this.dragY0 - cy) * this.dragDPP;
        this._updateUI(); this.draw();
        return;
      }

      const fi = this.vs + (mx - p.x) / p.w * (this.ve - this.vs);
      this.hovered = Math.max(this.vs, Math.min(this.ve, Math.round(fi)));
      this.draw(); this._showTip(e, this.hovered);
    });
  }

  _showTip(e,idx) {
    const tip=document.getElementById('chart-tooltip'); if(!tip)return;
    const sorted=[...this.datasets
      .map((ds,i)=>({name:ds.label,v:ds.data[idx],color:ds.color,i}))
      .filter(d=>!this.hidden.has(d.i))]
      .sort((a,b)=>b.v-a.v);
    tip.innerHTML=`
      <div style="font-size:11px;color:#5a6e96;font-weight:600;margin-bottom:8px">${this.labels[idx]}</div>
      ${sorted.map(d=>`
        <div style="display:flex;align-items:center;gap:7px;padding:2px 0">
          <div style="width:8px;height:8px;border-radius:50%;background:${d.color};flex-shrink:0"></div>
          <span style="font-size:12px;color:#9ca3af;flex:1;white-space:nowrap">${d.name}</span>
          <span style="font-size:12px;font-weight:700;color:${d.v>=ALLOC_TOTAL?'#10b981':'#ef4444'}">£${d.v.toFixed(2)}</span>
        </div>`).join('')}`;
    tip.style.display='block';
    const rect=this.canvas.getBoundingClientRect();
    let lft=e.clientX-rect.left+16, top=Math.max(4,e.clientY-rect.top-24);
    if (lft+185>rect.width) lft=e.clientX-rect.left-200;
    tip.style.left=lft+'px'; tip.style.top=top+'px';
  }

  toggle(idx) {
    this.hidden.has(idx)?this.hidden.delete(idx):this.hidden.add(idx);
    this.draw();
  }
}

// ═══════════════════════════════════════════════════════════
//  STACKED BAR CHART — Portfolio Breakdown
// ═══════════════════════════════════════════════════════════
function parseHex(hex) {
  const h = hex.replace('#','');
  return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
}

function wrapText(ctx, text, maxWidth, maxLines) {
  // Split text into lines that fit within maxWidth, up to maxLines
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length >= maxLines) break;
    } else {
      line = test;
    }
  }
  if (line && lines.length < maxLines) {
    lines.push(line);
  } else if (line && lines.length >= maxLines) {
    // Truncate last line if needed
    let last = lines[lines.length - 1];
    const remaining = last + ' ' + line;
    if (ctx.measureText(remaining).width > maxWidth) {
      // Truncate with ellipsis
      let truncated = last;
      for (let i = line.length; i > 0; i--) {
        truncated = last + ' ' + line.slice(0, i) + '…';
        if (ctx.measureText(truncated).width <= maxWidth) break;
      }
      lines[lines.length - 1] = truncated;
    } else {
      lines[lines.length - 1] = remaining;
    }
  }
  return lines;
}

function renderStackedBarChart() {
  const canvas = document.getElementById('breakdown-chart');
  if (!canvas || !S.players?.length) return;

  const playerData = S.players.map((p, pidx) => {
    const stocks = p.picks.map((sym, j) => {
      const svGBP = stockValueGBP(p, sym);
      const gPct  = gainPct(sym);
      return { sym, name: p.names?.[j] || sym, g: gPct, value: svGBP };
    });
    const known = stocks.filter(s => s.value !== null);
    if (!known.length) return null;
    const total = known.reduce((a, s) => a + s.value, 0);
    return { p, pidx, stocks, total };
  }).filter(Boolean);

  if (!playerData.length) return;

  playerData.sort((a, b) => a.total - b.total);

  const maxTotal = Math.max(...playerData.map(d => d.total));
  const yMax = Math.max(320, maxTotal + Math.max(15, maxTotal * 0.12));
  const yMin = 0;
  const yRange = yMax - yMin;

  // Horizontal scroll: ensure minimum column width per player
  const minColW = 70;
  const wrapper = document.getElementById('breakdown-scroll-wrapper');
  const containerW = (wrapper ? wrapper.clientWidth : canvas.parentElement?.clientWidth) || 700;

  const dpr = window.devicePixelRatio || 1;
  const padL = 44, padR = 16, padT = 24, padB = 62; // Extra padB for wrapped labels
  const naturalChartW = containerW - padL - padR;
  const naturalColW = naturalChartW / playerData.length;
  const needsScroll = naturalColW < minColW;
  const colW = needsScroll ? minColW : naturalColW;
  const cssW = needsScroll ? (padL + padR + colW * playerData.length) : containerW;
  const cssH = 320;

  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const W = cssW, H = cssH;

  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const barW = Math.min(60, colW * 0.62);
  const yPos = val => padT + chartH * (1 - (val - yMin) / yRange);

  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#0f1b35';
  ctx.fillRect(0, 0, W, H);

  const _cs = getComputedStyle(document.documentElement);
  const _gridCol = _cs.getPropertyValue('--border2').trim() || '#1e2d4d';
  const _labelCol = _cs.getPropertyValue('--muted').trim() || '#566a8a';
  const _accentCol = _cs.getPropertyValue('--accent').trim() || '#f97316';

  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const val = yMin + (yRange * i / ticks);
    const y = yPos(val);
    ctx.strokeStyle = _gridCol; ctx.lineWidth = 0.5; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = _labelCol; ctx.font = '10px monospace'; ctx.textAlign = 'right';
    ctx.fillText('£' + val.toFixed(0), padL - 4, y + 3.5);
  }

  const refY = yPos(300);
  ctx.strokeStyle = _accentCol + '99'; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(padL, refY); ctx.lineTo(W - padR, refY); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = _accentCol + 'CC'; ctx.font = '9px monospace'; ctx.textAlign = 'left';
  ctx.fillText('£300 start', padL + 4, refY - 4);

  canvas._barAreas = [];

  playerData.forEach(({ p, pidx, stocks, total }, i) => {
    const cx = padL + colW * (i + 0.5);
    const { r, g, b } = parseHex(PLAYER_COLORS[pidx % PLAYER_COLORS.length]);
    const sortedStocks = [...stocks].sort((a, b) => (b.g ?? -Infinity) - (a.g ?? -Infinity));
    let stackY = yPos(0);

    sortedStocks.forEach((s, j) => {
      if (s.value === null) return;
      const segH = (s.value / yRange) * chartH;
      const segY = stackY - segH;
      ctx.fillStyle = `rgba(${r},${g},${b},${1 - j * 0.27})`;
      ctx.fillRect(cx - barW / 2, segY, barW, segH);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(cx - barW / 2, segY, barW, 1);
      stackY = segY;
    });

    const topY = yPos(total);
    ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = total >= ALLOC_TOTAL ? (_cs.getPropertyValue('--green').trim() || '#4ade80') : (_cs.getPropertyValue('--red').trim() || '#f87171');
    ctx.fillText('£' + total.toFixed(0), cx, topY - 5);

    // Player name — wrap up to 3 lines
    ctx.fillStyle = _labelCol; ctx.font = '10px monospace'; ctx.textAlign = 'center';
    const labelMaxW = colW - 6;
    const lines = wrapText(ctx, p.name, labelMaxW, 3);
    const lineH = 12;
    const labelStartY = H - padB + 14;
    lines.forEach((line, li) => {
      ctx.fillText(line, cx, labelStartY + li * lineH);
    });

    canvas._barAreas.push({ x1: cx - colW / 2, x2: cx + colW / 2, p, pidx, stocks, total });
  });

  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) * (W / rect.width);
    const tip = document.getElementById('breakdown-tooltip');
    if (!tip) return;
    const hit = (canvas._barAreas || []).find(a => mouseX >= a.x1 && mouseX <= a.x2);
    if (!hit) { tip.style.display = 'none'; return; }
    const hex = PLAYER_COLORS[hit.pidx % PLAYER_COLORS.length];
    const rows = hit.stocks.map(s => {
      if (s.value === null) return '';
      const alloc = hit.p.allocations?.[hit.p.picks.indexOf(s.sym)] ?? 100;
      const diff = s.value - alloc;
      const col = diff >= 0 ? 'color:var(--green)' : 'color:var(--red)';
      return `<div style="display:flex;justify-content:space-between;gap:16px;margin-top:4px">
        <span style="color:var(--muted);font-size:11px">${esc(s.name)} <span style="color:var(--dim)">(£${alloc})</span></span>
        <span style="font-family:var(--mono);font-weight:700;${col}">${fmtGBP(s.value)}</span>
      </div>`;
    }).join('');
    const gainGBP = hit.total - ALLOC_TOTAL;
    const totalCol = gainGBP >= 0 ? 'var(--green)' : 'var(--red)';
    tip.innerHTML = `
      <div style="font-weight:700;color:${hex};margin-bottom:6px;font-size:12px">${esc(hit.p.name)}</div>
      ${rows}
      <div style="margin-top:8px;padding-top:7px;border-top:1px solid var(--border);display:flex;justify-content:space-between;gap:16px">
        <span style="color:var(--muted);font-size:11px">Portfolio value</span>
        <span style="font-family:var(--mono);font-weight:700;color:${totalCol}">${fmtGBP(hit.total)} <span style="font-size:10px">(${fmtGBP(gainGBP, true)})</span></span>
      </div>`;
    const tipW = 210;
    const scrollLeft = wrapper ? wrapper.scrollLeft : 0;
    const wrapperRect = wrapper ? wrapper.getBoundingClientRect() : rect;
    const tipX = e.clientX - wrapperRect.left + scrollLeft;
    const offsetX = (tipX + tipW + 16 > W) ? -tipW - 8 : 16;
    tip.style.display = 'block';
    tip.style.left = (tipX + offsetX) + 'px';
    tip.style.top = Math.max(0, e.clientY - rect.top - 20) + 'px';
  };
  canvas.onmouseleave = () => {
    const tip = document.getElementById('breakdown-tooltip');
    if (tip) tip.style.display = 'none';
  };
}

function initChart() {
  if (myChart) return;

  if (isDemoMode) {
    // Demo mode: build history from simulated price paths using £ values
    const labels = TRADING_DAYS.map(d => new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short'}));
    const datasets = S.players.map((p, i) => {
      const data = TRADING_DAYS.map((_, day) => {
        // Each pick: shares × simulated price / GBPUSD
        const total = p.picks.reduce((sum, sym) => {
          const path   = PRICE_HISTORY[sym];
          const shares = p.startShares?.[sym];
          if (!path || !shares) return sum;
          return sum + shares * (path[day] / DEMO_GBP_USD);
        }, 0);
        return parseFloat(total.toFixed(2));
      });
      return { label: p.name, data, color: PLAYER_COLORS[i % PLAYER_COLORS.length] };
    });
    // Add Fund Average dataset (average of all players at each time point)
    if (datasets.length) {
      const avgData = datasets[0].data.map((_, di) => {
        const vals = datasets.map(ds => ds.data[di]).filter(v => v != null);
        return vals.length ? parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : 0;
      });
      datasets.push({ label: 'Fund Average', data: avgData, color: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#f97316' });
    }

    myChart = new LineChart('portfolio-chart');
    myChart.setData(labels, datasets);
    buildChartLegend(S.players);
    return;
  }

  // Real game — build chart from stored daily snapshots + today's live price
  const hasStart = Object.keys(S.startPrices||{}).length > 0;
  const hasLive  = Object.keys(prices||{}).length > 0;

  if (!hasStart) {
    const canvas = document.getElementById('portfolio-chart');
    if (!canvas) return;
    canvas.width  = canvas.offsetWidth  || 900;
    canvas.height = canvas.offsetHeight || 440;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#3a4e72';
    ctx.font = '15px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Lock start prices first (⚙ → Lock Current Prices) to enable the chart.', canvas.width/2, canvas.height/2);
    return;
  }

  // Merge stored daily snapshots with today's live prices
  const history = S.priceHistory || {};
  const todayKey = new Date().toISOString().slice(0,10);

  // Build the combined snapshot map: date → {sym: price}
  const allSnapshots = {...history};
  if (hasLive) {
    allSnapshots[todayKey] = allSnapshots[todayKey] || {};
    allSymbols().forEach(s => { if (prices[s]) allSnapshots[todayKey][s] = prices[s].price; });
  }

  // Merge stored FX history alongside price history for accurate GBP conversion
  const fxHistory = S.fxHistory || {};
  const allFXSnaps = {...fxHistory};

  // Use the FX rates stored at lock time for the start baseline (guarantees £300 start).
  // Fall back to live FX only if startFX was never saved (legacy games).
  const startFXSnap = S.startFX ? {...S.startFX} : {};
  if (!Object.keys(startFXSnap).length) {
    getFXSymbols().forEach(fx => { if (prices[fx]?.price) startFXSnap[fx] = prices[fx].price; });
  }
  if (Object.keys(startFXSnap).length) allFXSnaps['0000-00-00'] = startFXSnap;

  // Always inject a guaranteed "Game Start" baseline using the exact locked startPrices.
  // Key '0000-00-00' sorts before every real ISO date so this is always the first point.
  const startSnap = {};
  allSymbols().forEach(s => { if (S.startPrices[s]) startSnap[s] = S.startPrices[s]; });
  allSnapshots['0000-00-00'] = startSnap;

  // Filter out weekend dates (markets closed — flat lines add no information)
  const sortedDates = Object.keys(allSnapshots).sort().filter(d => {
    if (d === '0000-00-00') return true; // always keep the start baseline
    const dow = new Date(d + 'T12:00:00Z').getUTCDay(); // noon UTC avoids timezone edge cases
    return dow !== 0 && dow !== 6; // drop Saturday (6) and Sunday (0)
  });
  if (!sortedDates.length) {
    const canvas = document.getElementById('portfolio-chart');
    if (!canvas) return;
    canvas.width  = canvas.offsetWidth  || 900;
    canvas.height = canvas.offsetHeight || 440;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#3a4e72'; ctx.font = '15px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Prices loading…', canvas.width/2, canvas.height/2);
    return;
  }

  const labels = sortedDates.map(d => {
    if (d === '0000-00-00') return 'Start';
    return new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short'});
  });

  const datasets = S.players.map((p, i) => {
    const data = sortedDates.map(date => {
      // The start baseline is always exactly £300 by definition
      if (date === '0000-00-00') return 300;
      const snap   = allSnapshots[date];
      const fxSnap = allFXSnaps[date] || allFXSnaps['0000-00-00'] || {};
      const total  = p.picks.reduce((sum, sym) => {
        const shares = p.startShares?.[sym];
        const raw    = snap?.[sym];
        if (!shares || !raw) return sum + (p.allocations?.[p.picks.indexOf(sym)] ?? 100); // hold flat
        const cur = S.currencies?.[sym] || 'USD';
        let priceGBP;
        if (cur === 'GBP')      priceGBP = raw;
        else if (cur === 'GBp') priceGBP = raw / 100;
        else {
          const fxKey  = 'GBP' + cur + '=X';
          const fxRate = fxSnap[fxKey] ?? prices[fxKey]?.price;
          priceGBP = fxRate ? raw / fxRate : null;
        }
        return sum + (priceGBP !== null ? shares * priceGBP : (p.allocations?.[p.picks.indexOf(sym)] ?? 100));
      }, 0);
      return parseFloat(total.toFixed(2));
    });
    return { label: p.name, data, color: PLAYER_COLORS[i % PLAYER_COLORS.length] };
  });

  // Add Fund Average dataset (average of all players at each time point)
  if (datasets.length) {
    const avgData = datasets[0].data.map((_, di) => {
      const vals = datasets.map(ds => ds.data[di]).filter(v => v != null);
      return vals.length ? parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : 0;
    });
    datasets.push({ label: 'Fund Average', data: avgData, color: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#f97316' });
  }

  myChart = new LineChart('portfolio-chart');
  myChart.setData(labels, datasets);
  buildChartLegend(S.players);
  renderStackedBarChart();
}

// Leaderboard ranking helper — returns array of player indices sorted by current portfolio value (best first)
function getLeaderboardRanking() {
  if (!S.players?.length) return [];
  return S.players.map((p, i) => {
    const total = p.picks.reduce((sum, sym) => {
      const v = stockValueGBP(p, sym);
      return sum + (v !== null ? v : (p.allocations?.[p.picks.indexOf(sym)] ?? 100));
    }, 0);
    return { idx: i, total };
  }).sort((a, b) => b.total - a.total).map(x => x.idx);
}

function buildChartLegend(playerList) {
  if (!myChart) return;
  const fundAvgIdx = myChart.datasets.length - 1; // Fund Average is always last dataset
  const isFundHidden = myChart.hidden.has(fundAvgIdx);

  let html = '';

  // Fund Average checkbox first
  html += `<label class="legend-item" id="li-${fundAvgIdx}" style="cursor:pointer;user-select:none">
    <input type="checkbox" ${isFundHidden ? '' : 'checked'} onchange="toggleDataset(${fundAvgIdx})"
      style="margin:0;accent-color:var(--accent);cursor:pointer" />
    <div class="legend-dot" style="background:var(--accent);border:1px dashed var(--accent)"></div>
    <span style="font-weight:700">Fund Average</span>
  </label>`;

  // Individual player checkboxes
  playerList.forEach((p, i) => {
    const isHidden = myChart.hidden.has(i);
    html += `<label class="legend-item${isHidden ? ' faded' : ''}" id="li-${i}" style="cursor:pointer;user-select:none">
      <input type="checkbox" ${isHidden ? '' : 'checked'} onchange="toggleDataset(${i})"
        style="margin:0;accent-color:${PLAYER_COLORS[i % PLAYER_COLORS.length]};cursor:pointer" />
      <div class="legend-dot" style="background:${PLAYER_COLORS[i % PLAYER_COLORS.length]}"></div>
      <span>${esc(p.name)}</span>
    </label>`;
  });

  document.getElementById('chart-legend').innerHTML = html;
}

function toggleDataset(idx) {
  if (!myChart) return;
  myChart.toggle(idx);
  // Update checkbox and faded state
  const li = document.getElementById('li-' + idx);
  if (li) {
    const cb = li.querySelector('input[type="checkbox"]');
    if (cb) cb.checked = !myChart.hidden.has(idx);
    li.classList.toggle('faded', myChart.hidden.has(idx));
  }
}

function chartGroupSelect(group) {
  if (!myChart || !S.players?.length) return;
  const playerCount = S.players.length;
  const fundAvgIdx = myChart.datasets.length - 1;
  const ranking = getLeaderboardRanking(); // array of player indices, best first

  // Determine which player indices to show
  let showIndices = new Set();

  if (group === 'all') {
    for (let i = 0; i < playerCount; i++) showIndices.add(i);
  } else if (group === 'none') {
    // Show nothing (empty set)
  } else if (group === 'boardroom') {
    ranking.slice(0, 10).forEach(i => showIndices.add(i));
  } else if (group === 'middle') {
    // Middle positions: if 24 players, positions 6-15 (0-indexed: 5-14 in ranking)
    const start = Math.max(0, Math.floor(playerCount / 2) - 5);
    const end = Math.min(playerCount, start + 10);
    ranking.slice(start, end).forEach(i => showIndices.add(i));
  } else if (group === 'interns') {
    ranking.slice(Math.max(0, ranking.length - 10)).forEach(i => showIndices.add(i));
  }

  // Apply: hide all players first, then show selected ones
  for (let i = 0; i < playerCount; i++) {
    if (showIndices.has(i)) {
      myChart.hidden.delete(i);
    } else {
      myChart.hidden.add(i);
    }
  }

  // Always show Fund Average line unless "none"
  if (group === 'none') {
    myChart.hidden.add(fundAvgIdx);
  } else {
    myChart.hidden.delete(fundAvgIdx);
  }

  myChart.draw();
  buildChartLegend(S.players);
}

// ═══════════════════════════════════════════════════════════
//  FUND vs BENCHMARKS CHART
// ═══════════════════════════════════════════════════════════
function initFundChart() {
  if (myFundChart) return;

  if (isDemoMode) {
    const labels = TRADING_DAYS.map(d =>
      new Date(d).toLocaleDateString('en-GB', {day:'numeric', month:'short'})
    );

    // Fund line: average of all player portfolio values indexed to 100 at day 0
    const fundData = TRADING_DAYS.map((_, day) => {
      const totalValue = S.players.reduce((psum, p) => {
        const pv = p.picks.reduce((sum, sym) => {
          const path   = PRICE_HISTORY[sym];
          const shares = p.startShares?.[sym];
          if (!path || !shares) return sum;
          return sum + shares * (path[day] / DEMO_GBP_USD);
        }, 0);
        return psum + pv;
      }, 0);
      const avg = totalValue / S.players.length;
      return parseFloat(((avg / ALLOC_TOTAL) * 100).toFixed(2));
    });

    // Benchmark lines: price path indexed to 100 at day 0
    const benchDatasets = BENCHMARK_TICKERS.map(sym => {
      const path = PRICE_HISTORY[sym];
      if (!path) return null;
      const base = path[0];
      const data = TRADING_DAYS.map((_, d) =>
        parseFloat(((path[d] / base) * 100).toFixed(2))
      );
      return { label: BENCHMARK_META[sym].name, data, color: BENCHMARK_META[sym].color };
    }).filter(Boolean);

    const datasets = [
      { label: 'SMB Fund', data: fundData, color: '#f97316' },
      ...benchDatasets,
    ];

    myFundChart = new LineChart('fund-chart', { uiPrefix: 'fund' });
    myFundChart.baseline = 100;
    myFundChart.setData(labels, datasets);
    buildFundChartLegend(datasets);
    return;
  }

  // ── Real game ──────────────────────────────────────────────
  const hasStart = Object.keys(S.startPrices || {}).length > 0;
  if (!hasStart) {
    const canvas = document.getElementById('fund-chart');
    if (!canvas) return;
    canvas.width  = canvas.offsetWidth || 900;
    canvas.height = 260;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#3a4e72';
    ctx.font = '14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Lock start prices to enable the fund chart.', canvas.width / 2, 130);
    return;
  }

  const history   = S.priceHistory || {};
  const fxHistory = S.fxHistory    || {};
  const todayKey  = new Date().toISOString().slice(0, 10);

  // Merge stored history with live prices for today
  const allSnapshots = {...history};
  if (Object.keys(prices || {}).length) {
    allSnapshots[todayKey] = allSnapshots[todayKey] || {};
    allSymbols().forEach(s => { if (prices[s]) allSnapshots[todayKey][s] = prices[s].price; });
    BENCHMARK_TICKERS.forEach(b => { if (prices[b]) allSnapshots[todayKey][b] = prices[b].price; });
  }

  // FX snapshots — use stored lock-time FX for baseline (guarantees index=100 at start)
  const allFXSnaps = {...fxHistory};
  const startFXSnap = S.startFX ? {...S.startFX} : {};
  if (!Object.keys(startFXSnap).length) {
    getFXSymbols().forEach(fx => { if (prices[fx]?.price) startFXSnap[fx] = prices[fx].price; });
  }
  if (Object.keys(startFXSnap).length) allFXSnaps['0000-00-00'] = startFXSnap;

  // Baseline snapshot at game start
  const startSnap = {};
  allSymbols().forEach(s => { if (S.startPrices[s]) startSnap[s] = S.startPrices[s]; });
  BENCHMARK_TICKERS.forEach(b => { if (S.startPrices[b]) startSnap[b] = S.startPrices[b]; });
  allSnapshots['0000-00-00'] = startSnap;

  // Filter to weekdays only (same logic as portfolio chart)
  const sortedDates = Object.keys(allSnapshots).sort().filter(d => {
    if (d === '0000-00-00') return true;
    const dow = new Date(d + 'T12:00:00Z').getUTCDay();
    return dow !== 0 && dow !== 6;
  });
  if (!sortedDates.length) return;

  const labels = sortedDates.map(d =>
    d === '0000-00-00' ? 'Start' : new Date(d).toLocaleDateString('en-GB', {day:'numeric', month:'short'})
  );

  // Fund: average portfolio value in GBP, indexed to 100 at start
  const fundData = sortedDates.map(date => {
    // Start baseline is always exactly 100 by definition
    if (date === '0000-00-00') return 100;
    const snap   = allSnapshots[date];
    const fxSnap = allFXSnaps[date] || allFXSnaps['0000-00-00'] || {};
    const total  = S.players.reduce((psum, p) => {
      const pv = p.picks.reduce((sum, sym) => {
        const shares = p.startShares?.[sym];
        const raw    = snap?.[sym];
        if (!shares || !raw) return sum + (p.allocations?.[p.picks.indexOf(sym)] ?? 100);
        const cur = S.currencies?.[sym] || 'USD';
        let priceGBP;
        if (cur === 'GBP')      priceGBP = raw;
        else if (cur === 'GBp') priceGBP = raw / 100;
        else {
          const fxKey  = 'GBP' + cur + '=X';
          const fxRate = fxSnap[fxKey] ?? prices[fxKey]?.price;
          priceGBP = fxRate ? raw / fxRate : null;
        }
        return sum + (priceGBP !== null ? shares * priceGBP : (p.allocations?.[p.picks.indexOf(sym)] ?? 100));
      }, 0);
      return psum + pv;
    }, 0);
    const avg = total / S.players.length;
    return parseFloat(((avg / ALLOC_TOTAL) * 100).toFixed(2));
  });

  // Benchmarks: indexed to 100 at game start; S&P GBP-adjusted via GBPUSD=X
  const startFXBase = (allFXSnaps['0000-00-00'] || {})['GBPUSD=X'] ?? prices['GBPUSD=X']?.price;
  const benchDatasets = BENCHMARK_TICKERS.map(sym => {
    const startPrice = S.startPrices[sym];
    if (!startPrice) return null;
    const isFTSE = sym === '^FTSE'; // FTSE is in GBP already; S&P is in USD
    const data = sortedDates.map(date => {
      // Start baseline is always exactly 100 by definition
      if (date === '0000-00-00') return 100;
      const snap   = allSnapshots[date];
      const fxSnap = allFXSnaps[date] || allFXSnaps['0000-00-00'] || {};
      const raw    = snap?.[sym];
      if (!raw) return 100; // hold flat when no data
      if (isFTSE) {
        return parseFloat(((raw / startPrice) * 100).toFixed(2));
      } else {
        // GBP-adjust: compare S&P in sterling terms to capture FX effect
        const fxNow  = fxSnap['GBPUSD=X'] ?? prices['GBPUSD=X']?.price;
        const fxBase = startFXBase ?? fxNow;
        if (!fxNow || !fxBase) return parseFloat(((raw / startPrice) * 100).toFixed(2)); // USD fallback
        return parseFloat((((raw / fxNow) / (startPrice / fxBase)) * 100).toFixed(2));
      }
    });
    return { label: BENCHMARK_META[sym].name, data, color: BENCHMARK_META[sym].color };
  }).filter(Boolean);

  const datasets = [
    { label: 'SMB Fund', data: fundData, color: '#f97316' },
    ...benchDatasets,
  ];

  myFundChart = new LineChart('fund-chart', { uiPrefix: 'fund' });
  myFundChart.baseline = 100;
  myFundChart.setData(labels, datasets);
  buildFundChartLegend(datasets);
}

function buildFundChartLegend(datasets) {
  const el = document.getElementById('fund-legend');
  if (!el) return;
  el.innerHTML = datasets.map((ds, i) => `
    <div class="legend-item" id="fli-${i}" onclick="toggleFundDataset(${i})">
      <div class="legend-dot" style="background:${ds.color}"></div>
      <span>${esc(ds.label)}</span>
    </div>`).join('');
}

function toggleFundDataset(idx) {
  if (!myFundChart) return;
  myFundChart.toggle(idx);
  document.getElementById('fli-' + idx)?.classList.toggle('faded', myFundChart.hidden.has(idx));
}


// ═══════════════════════════════════════════════════════════
//  ADMIN — email whitelist auth
// ═══════════════════════════════════════════════════════════
function openAdmin() {
  if (!isAdmin()) {
    toast('⛔ Admin access is restricted to authorised accounts.');
    return;
  }
  renderAdminPanel();
  show('admin-overlay');
  hide('admin-auth');
  show('admin-panel');
}
function closeAdmin() { hide('admin-overlay'); }
function closeAdminIfOutside(e) { if(e.target.id==='admin-overlay') closeAdmin(); }


function renderAdminPanel() {
  const panel       = document.getElementById('admin-panel');
  const pricesLocked = Object.keys(S.startPrices || {}).length > 0;
  const gameOver    = isGameOver();
  const inSeason    = pricesLocked && !gameOver;
  const notStarted  = !pricesLocked && !gameOver;

  let html = '';

  // ── Game Dates (always editable by admin) ────────────────
  html += `
    <div class="modal-section">
      <div class="modal-section-title">📅 Game Dates</div>
      <div class="modal-desc">Set or update the start and end dates for the current season.</div>
      <div class="grid-2" style="margin:10px 0 12px">
        <div>
          <label class="form-label">Start Date</label>
          <input class="form-input" id="admin-start-date" type="date" value="${S.startDate||''}" />
        </div>
        <div>
          <label class="form-label">End Date</label>
          <input class="form-input" id="admin-end-date" type="date" value="${S.endDate||''}" />
        </div>
      </div>
      <button class="btn btn-secondary" onclick="saveGameDates()">Save Dates</button>
    </div>
    <div class="divider" style="margin:16px 0"></div>`;

  // ── Start Game / Lock prices ─────────────────────────────
  // Only show before the game has started
  if (notStarted) {
    html += `
      <div class="modal-section">
        <div class="modal-section-title">🚀 Start Game</div>
        <div class="modal-desc">Lock in today's prices as the starting point for all players. The leaderboard will become visible to everyone.</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">
          <button class="btn btn-primary" onclick="startGameManually()" style="padding:9px 22px;font-size:13px;font-weight:700">🚀 Start Game</button>
          <button class="btn btn-secondary" onclick="lockStartPrices()">🔒 Lock Prices Only</button>
        </div>
      </div>
      <div class="divider" style="margin:16px 0"></div>`;
  }

  // ── In-season actions ────────────────────────────────────
  if (inSeason) {
    html += `
      <div class="modal-section">
        <div class="modal-section-title">⏱ End Season Early</div>
        <div class="modal-desc">Stop the season now and use current prices as the final standings.</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">
          <button class="btn btn-primary" onclick="endSeason()">🏁 End Now &amp; Archive</button>
          <button class="btn btn-secondary" onclick="endSeasonNoArchive()">🗑 End Now &amp; Don't Archive</button>
        </div>
      </div>
      <div class="divider" style="margin:16px 0"></div>`;
  }

  // ── Post-season actions ──────────────────────────────────
  if (gameOver) {
    html += `
      <div class="modal-section">
        <div class="modal-section-title">🏆 Season Complete</div>
        <div class="modal-desc">Save the final standings to the Medal Table, or discard this season without recording the results.</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">
          <button class="btn btn-primary" onclick="endSeason()">📦 Archive</button>
          <button class="btn btn-secondary" onclick="deleteSeasonNoArchive()">🗑 Delete &amp; Don't Archive</button>
        </div>
      </div>
      <div class="divider" style="margin:16px 0"></div>`;
  }

  // ── Payment Status (collapsible) ────────────────────────────
  if (S.players && S.players.length > 0) {
    const paidCount = S.players.filter((_, i) => S.payments?.[i] === true).length;
    html += `
      <div class="modal-section">
        <details>
          <summary style="cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:8px">
            <div class="modal-section-title" style="margin:0">💳 Payment Status</div>
            <span style="font-size:11px;font-family:var(--mono);font-weight:700;color:var(--muted)">${paidCount}/${S.players.length} paid ▾</span>
          </summary>
          <div class="modal-desc" style="margin-top:8px">Track who has paid their £10 entry fee.</div>
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">
            ${S.players.map((p, i) => {
              const paid = S.payments?.[i] === true;
              return `<label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:9px 12px;background:${paid ? 'var(--green-bg)' : 'var(--red-bg)'};border:1px solid ${paid ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.2)'};border-radius:var(--radius);transition:background .15s">
                <input type="checkbox" ${paid ? 'checked' : ''} onchange="togglePayment(${i}, this.checked)" style="accent-color:var(--green);width:16px;height:16px;cursor:pointer;flex-shrink:0" />
                <span style="font-size:13px;font-weight:600;flex:1;color:var(--text)">${esc(p.name)}</span>
                <span style="font-size:10px;font-family:var(--mono);font-weight:700;letter-spacing:.06em;${paid ? 'color:var(--green)' : 'color:var(--red)'}">${paid ? '✓ PAID' : '✗ UNPAID'}</span>
              </label>`;
            }).join('')}
          </div>
        </details>
      </div>
      <div class="divider" style="margin:16px 0"></div>`;
  }

  // ── Edit Player Names (collapsible) ────────────────────────
  if (S.players && S.players.length > 0) {
    html += `
      <div class="modal-section">
        <details>
          <summary style="cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:8px">
            <div class="modal-section-title" style="margin:0">✏️ Player Names</div>
            <span style="font-size:11px;font-family:var(--mono);font-weight:700;color:var(--muted)">${S.players.length} players ▾</span>
          </summary>
          <div class="modal-desc" style="margin-top:8px">Edit any player's display name.</div>
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">
            ${S.players.map((p, i) => {
              return `<div style="display:flex;align-items:center;gap:8px">
                <input class="form-input" id="admin-name-${i}" value="${esc(p.name)}" style="flex:1;font-size:13px;padding:8px 10px" />
                <button class="btn btn-secondary" onclick="adminSaveName(${i})" style="padding:7px 14px;font-size:11px;text-transform:none;letter-spacing:0;white-space:nowrap">Save</button>
              </div>`;
            }).join('')}
          </div>
        </details>
      </div>
      <div class="divider" style="margin:16px 0"></div>`;
  }


  // ── Danger zone (always visible) ─────────────────────────
  html += `
    <div class="modal-section" style="margin-bottom:0">
      <div class="modal-section-title">⚠️ Danger Zone</div>
      <div class="modal-desc">Permanently wipe all current game data. Archived seasons are kept.</div>
      <button class="btn btn-danger" onclick="resetEverything()">🗑 Reset All Game Data</button>
    </div>`;

  panel.innerHTML = html;
}

async function togglePayment(idx, paid) {
  if (!S.payments) S.payments = {};
  S.payments[idx] = paid;
  await save();
  renderAdminPanel();
  if (Object.keys(S.startPrices || {}).length > 0) renderDash();
}

async function adminSaveName(idx) {
  if (!S.players?.[idx]) return;
  const input = document.getElementById('admin-name-' + idx);
  if (!input) return;
  const newName = input.value.trim();
  if (!newName) { toast('⚠️ Name cannot be empty.'); return; }
  const oldName = S.players[idx].name;
  S.players[idx].name = newName;
  await save();
  renderAdminPanel();
  renderInlinePlayers();
  if (Object.keys(S.startPrices || {}).length > 0) renderDash();
  toast(`✅ Renamed "${oldName}" → "${newName}"`);
}

async function saveGameDates() {
  const startDate = document.getElementById('admin-start-date')?.value;
  const endDate   = document.getElementById('admin-end-date')?.value;
  if (!startDate || !endDate) { toast('⚠️ Please fill in both dates.'); return; }
  if (endDate <= startDate)   { toast('⚠️ End date must be after start date.'); return; }
  S.startDate = startDate;
  S.endDate   = endDate;
  await save();
  toast('✅ Dates updated.');
  closeAdmin();
  renderDash();
}

async function lockStartPrices() {
  if (!confirm('Overwrite start prices with today\'s current prices?\n\nThis will recalculate each player\'s share count based on their allocations and the new prices.')) return;
  try {
    const syms = allSymbols();
    const p    = await fetchPrices([...syms, ...BENCHMARK_TICKERS]);
    syms.forEach(s => { if (p[s]) S.startPrices[s] = p[s].price; });
    // Also update benchmark start prices for fund chart indexing
    BENCHMARK_TICKERS.forEach(b => { if (p[b]) S.startPrices[b] = p[b].price; });

    // Update stored currencies
    S.currencies = {};
    syms.forEach(s => { if (p[s]?.currency) S.currencies[s] = p[s].currency; });

    // Fetch FX rates and store them as the baseline for chart calculations
    const fxSyms = getFXSymbols();
    const fxData = fxSyms.length ? await fetchPrices(fxSyms) : {};
    Object.assign(p, fxData);
    prices = p;

    // Save the FX rates at lock time so charts always start at exactly £300 / 100
    S.startFX = {};
    fxSyms.forEach(fx => { if (fxData[fx]?.price) S.startFX[fx] = fxData[fx].price; });

    // Recompute startShares using current prices + allocations
    S.players.forEach(player => {
      player.startShares = {};
      player.picks.forEach((sym, j) => {
        const rawPrice = S.startPrices[sym];
        if (!rawPrice) return;
        const cur      = S.currencies[sym] || 'USD';
        let priceGBP;
        if (cur === 'GBP')      priceGBP = rawPrice;
        else if (cur === 'GBp') priceGBP = rawPrice / 100;
        else {
          const fxKey  = 'GBP' + cur + '=X';
          const fxRate = fxData[fxKey]?.price;
          priceGBP = fxRate ? rawPrice / fxRate : rawPrice;
        }
        const alloc             = (player.allocations?.[j] ?? 100);
        player.startShares[sym] = alloc / priceGBP;
      });
    });

    await save();
    toast('✅ Start prices locked! Share counts updated.');
    closeAdmin();
    renderDash();
  } catch(e) { toast('❌ Failed: ' + e.message); }
}

async function endSeason() {
  const seasonName = prompt('Name this season (e.g. "Season 1" or "Q1 2026"):');
  if (!seasonName) return;
  if (!confirm(`Archive "${seasonName}" and save final standings? The game state will be preserved — use Reset to start fresh.`)) return;
  try {
    // Build final standings — track both £ value and % gain
    const finalStandings = S.players.map(p => ({
      name:           p.name,
      uid:            p.uid || null,
      email:          p.email || null,
      picks:          p.picks,
      finalValueGBP:  portfolioValueGBP(p) ?? ALLOC_TOTAL,
      finalGainGBP:   portfolioGainGBP(p)  ?? 0,
      finalReturn:    portfolioGainPct(p)   ?? 0,   // % gain (kept for legacy)
    })).sort((a, b) => b.finalValueGBP - a.finalValueGBP);

    const seasonData = {
      name:           seasonName,
      startDate:      S.startDate || null,
      endDate:        new Date().toISOString().slice(0,10),
      archivedAt:     Date.now(),
      finalStandings
    };

    if (USE_FIREBASE) {
      // Save to seasons collection
      const seasonId = seasonName.toLowerCase().replace(/[^a-z0-9]+/g,'-');
      await db.collection('seasons').doc(seasonId).set(seasonData);

      // Update player all-time stats in players collection
      for (const s of finalStandings) {
        if (!s.uid) continue;
        const ref = db.collection('players').doc(s.uid);
        const snap = await ref.get();
        const existing = snap.exists ? snap.data() : { seasons:0, gold:0, silver:0, bronze:0, totalGainGBP:0, totalReturn:0, bestGainGBP:-Infinity };
        const rank = finalStandings.indexOf(s);
        await ref.set({
          displayName:  s.name,
          email:        s.email || null,
          uid:          s.uid,
          seasons:      (existing.seasons||0) + 1,
          gold:         (existing.gold||0)   + (rank===0 ? 1 : 0),
          silver:       (existing.silver||0) + (rank===1 ? 1 : 0),
          bronze:       (existing.bronze||0) + (rank===2 ? 1 : 0),
          totalGainGBP: (existing.totalGainGBP||0) + s.finalGainGBP,
          totalReturn:  (existing.totalReturn||0)  + s.finalReturn,
          bestGainGBP:  Math.max(existing.bestGainGBP ?? -Infinity, s.finalGainGBP),
          bestReturn:   Math.max(existing.bestReturn  ?? -Infinity, s.finalReturn),
          bestSeason:   s.finalGainGBP >= (existing.bestGainGBP ?? -Infinity) ? seasonName : (existing.bestSeason || seasonName)
        }, { merge: true });
      }
      toast('✅ Season archived!');
    } else {
      toast('⚠️ Firebase required to archive seasons.');
    }
    closeAdmin();
  } catch(e) { toast('❌ Failed: '+e.message); console.error(e); }
}

async function endSeasonNoArchive() {
  if (!confirm('End the season now without archiving?\n\nFinal standings will NOT be saved to the Medal Table. This cannot be undone.')) return;
  try {
    S.endDate = new Date().toISOString().slice(0,10);
    await save();
    toast('Season ended. Standings not archived.');
    closeAdmin();
    renderDash();
  } catch(e) { toast('❌ Failed: ' + e.message); }
}

async function deleteSeasonNoArchive() {
  if (!confirm('Delete this season\'s data without archiving?\n\nFinal standings will NOT be saved to the Medal Table. This cannot be undone.')) return;
  try {
    if (USE_FIREBASE) {
      await db.collection('squaremile').doc('game').delete();
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    closeAdmin();
    location.reload();
  } catch(e) { toast('❌ Failed: ' + e.message); }
}

async function resetEverything() {
  if (!confirm('Delete ALL current game data permanently? (Archived seasons are kept.)')) return;
  if (USE_FIREBASE) {
    await db.collection('squaremile').doc('game').delete();
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
  location.reload();
}

// ═══════════════════════════════════════════════════════════
//  TOAST / UTILS
// ═══════════════════════════════════════════════════════════
let toastTimer;
function toast(msg) {
  const el=document.getElementById('toast'); if (!el) return; el.textContent=msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),3000);
}
function show(id) { const el = document.getElementById(id); if (el) el.classList.remove('hidden'); }
function hide(id) { const el = document.getElementById(id); if (el) el.classList.add('hidden'); }
function esc(s) { const d=document.createElement('div'); d.textContent=s||'–'; return d.innerHTML; }

// ═══════════════════════════════════════════════════════════
//  CONFETTI
// ═══════════════════════════════════════════════════════════
function fireConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  // Respect reduced-motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const ctx = canvas.getContext('2d');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

  const COLORS = ['#f6c90e','#4ade80','#60a5fa','#f97316','#a78bfa','#f472b6','#34d399','#fb923c'];
  const pieces = Array.from({length: 120}, () => ({
    x:   Math.random() * canvas.width,
    y:   -Math.random() * canvas.height * 0.4,
    w:   6 + Math.random() * 8,
    h:   10 + Math.random() * 6,
    r:   Math.random() * Math.PI * 2,
    vx:  (Math.random() - 0.5) * 3,
    vy:  2 + Math.random() * 4,
    vr:  (Math.random() - 0.5) * 0.18,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    alpha: 1,
  }));

  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    pieces.forEach(p => {
      p.x  += p.vx;
      p.y  += p.vy;
      p.vy += 0.06; // gravity
      p.r  += p.vr;
      if (p.y > canvas.height * 0.75) p.alpha = Math.max(0, p.alpha - 0.025);
      if (p.alpha <= 0 || p.y > canvas.height + 20) return;
      alive = true;
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
      ctx.restore();
    });
    frame++;
    if (alive && frame < 300) requestAnimationFrame(draw);
    else { ctx.clearRect(0, 0, canvas.width, canvas.height); }
  }
  requestAnimationFrame(draw);
}

// ═══════════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════════
init();
