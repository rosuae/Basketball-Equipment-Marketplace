const express = require('express');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const sass = require('sass');
const pg = require('pg');

const client = new pg.Client({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME
});
// Cache pentru valorile ENUM-ului categ_produs (se incarca o singura data la pornire)
let categoriiCache = [];

async function incarcaCategoriiEnum() {
  try {
    const rez = await client.query("SELECT unnest(enum_range(NULL::categ_produs))::text AS categorie");
    categoriiCache = rez.rows.map(r => r.categorie);
    console.log('Categorii ENUM incarcate:', categoriiCache);
  } catch (err) {
    console.error('Eroare la incarcarea categoriilor ENUM:', err);
  }
}

client.connect()
  .then(() => {
    console.log('Conectat la baza de date');
    return incarcaCategoriiEnum();
  })
  .catch(err => console.error('Eroare conectare baza de date:', err));

const obGlobal = {
  obErori: null,
  obGalerie: null,
  caleGalerieAbsoluta: null,
  caleCacheGalerie: null,
  folderScss: path.join(__dirname, 'src', 'css'),
  folderCss: path.join(__dirname, 'src', 'css'),
};
const vect_foldere = ['temp', 'logs', 'backup', 'fisiere_uploadate'];

const TIMPURI_GALERIE = new Set(['dimineata', 'zi', 'noapte']);
const DIMENSIUNI_GALERIE = {
  small: 220,
  medium: 340,
};
const EXTENSII_IMAGINI_ACCEPTATE = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const server = express();
const PORT = process.env.PORT || 8080;

vect_foldere.forEach((numeFolder) => {
  const caleFolder = path.join(__dirname, numeFolder);
  if (!fs.existsSync(caleFolder)) {
    fs.mkdirSync(caleFolder);
  }
});

function compileazaScss(caleScss, caleCss) {
  let caleScssAbsoluta;
  if (path.isAbsolute(caleScss)) {
    caleScssAbsoluta = caleScss;
  } else {
    caleScssAbsoluta = path.join(obGlobal.folderScss, caleScss);
  }

  let caleCssAbsoluta;
  if (caleCss) {
    if (path.isAbsolute(caleCss)) {
      caleCssAbsoluta = caleCss;
    } else {
      caleCssAbsoluta = path.join(obGlobal.folderCss, caleCss);
    }
  } else {
    const numeFarExtensie = path.basename(caleScss, path.extname(caleScss));
    caleCssAbsoluta = path.join(obGlobal.folderCss, numeFarExtensie + '.css');
  }

  if (fs.existsSync(caleCssAbsoluta) && fs.statSync(caleCssAbsoluta).isFile()) {
    try {
      // ===== BONUS fisierul salvat in backup contine timestamp =====
      const numeOriginal = path.basename(caleCssAbsoluta);
      const extensieBackup = path.extname(numeOriginal);
      const numeFaraExtensieBackup = path.basename(numeOriginal, extensieBackup);
      const timestampBackup = Date.now();
      const numeBackup = `${numeFaraExtensieBackup}_${timestampBackup}${extensieBackup}`;
      const caleBackup = path.join(__dirname, 'backup', 'resurse', 'css', numeBackup);
      fs.mkdirSync(path.dirname(caleBackup), { recursive: true });
      fs.copyFileSync(caleCssAbsoluta, caleBackup);
      console.log(`[SCSS Backup] Salvat backup cu timestamp: ${numeBackup}`);
    } catch (eroare) {
      console.error(`[SCSS] Eroare la backup pentru ${caleCssAbsoluta}: ${eroare.message}`);
    }
  }

  const rezultat = sass.compile(caleScssAbsoluta, {
    style: 'expanded',
    quietDeps: true,
    silenceDeprecations: ['import', 'global-builtin', 'color-functions', 'if-function'],
  });

  fs.mkdirSync(path.dirname(caleCssAbsoluta), { recursive: true });
  fs.writeFileSync(caleCssAbsoluta, rezultat.css);
}

function compileazaInitialToateScss() {
  const fisiere = fs.readdirSync(obGlobal.folderScss);

  fisiere.forEach((numeFisier) => {
    if (path.extname(numeFisier).toLowerCase() === '.scss') {
      const caleCss = numeFisier.replace(/\.scss$/i, '.css');
      compileazaScss(numeFisier, caleCss);
    }
  });
}

function pornesteWatchScss() {
  fs.watch(obGlobal.folderScss, { recursive: true }, (eveniment, numeFisier) => {
    if (!numeFisier || path.extname(numeFisier).toLowerCase() !== '.scss') {
      return;
    }

    const caleAbsoluta = path.join(obGlobal.folderScss, numeFisier);
    if (!fs.existsSync(caleAbsoluta)) {
      return;
    }

    try {
      const caleCss = numeFisier.replace(/\.scss$/i, '.css');
      compileazaScss(numeFisier, caleCss);
    } catch (eroare) {
      console.error(`[SCSS] Eroare la compilarea ${numeFisier}: ${eroare.message}`);
    }
  });
}

function initErori() {
  const caleEroriJson = path.join(__dirname, 'src/json/erori.json');
  const continut = fs.readFileSync(caleEroriJson, 'utf-8');
  const obErori = JSON.parse(continut);

  obErori.eroare_default.imagine = path.posix.join(
    obErori.cale_baza,
    obErori.eroare_default.imagine
  );
  obErori.info_erori = obErori.info_erori.map((eroare) => ({
    ...eroare,
    imagine: path.posix.join(obErori.cale_baza, eroare.imagine),
  }));

  obGlobal.obErori = obErori;
}

function verificaFisierGalerieLaPornire() {
  const caleGalerieJson = path.join(__dirname, 'src/json/galerie.json');

  if (!fs.existsSync(caleGalerieJson)) {
    console.error(
      '[Eroare initializare] Fisierul obligatoriu al galeriei lipseste: src/json/galerie.json.'
    );
    process.exit(1);
  }

  const continut = fs.readFileSync(caleGalerieJson, 'utf-8');
  const obGalerie = JSON.parse(continut);
  const proprietatiObligatorii = ['cale_galerie', 'imagini'];
  const proprietatiLipsa = proprietatiObligatorii.filter(
    (proprietate) => !Object.prototype.hasOwnProperty.call(obGalerie, proprietate)
  );

  if (proprietatiLipsa.length > 0) {
    console.error(
      `[Eroare initializare] Structura invalida in src/json/galerie.json. Lipsesc proprietatile: ${proprietatiLipsa.join(', ')}.`
    );
    process.exit(1);
  }

  if (!Array.isArray(obGalerie.imagini) || obGalerie.imagini.length === 0) {
    console.error(
      '[Eroare initializare] Proprietatea imagini din src/json/galerie.json trebuie sa fie un vector nevid.'
    );
    process.exit(1);
  }

  const caleGalerieRelativa = String(obGalerie.cale_galerie).replace(/^[/\\]+/, '');
  const caleGalerieAbsoluta = path.join(__dirname, caleGalerieRelativa);

  if (!fs.existsSync(caleGalerieAbsoluta) || !fs.statSync(caleGalerieAbsoluta).isDirectory()) {
    console.error(
      `[Eroare initializare] Folderul galeriei nu exista: ${obGalerie.cale_galerie}. Cale verificata: ${caleGalerieAbsoluta}.`
    );
    process.exit(1);
  }

  const campuriImagineObligatorii = ['cale_relativa', 'nume', 'descriere', 'timp'];
  obGalerie.imagini.forEach((imagine, index) => {
    const campuriLipsa = campuriImagineObligatorii.filter(
      (camp) => !Object.prototype.hasOwnProperty.call(imagine, camp)
    );

    if (campuriLipsa.length > 0) {
      console.error(
        `[Eroare initializare] Imagine invalida in src/json/galerie.json la index ${index}. Lipsesc campurile: ${campuriLipsa.join(', ')}.`
      );
      process.exit(1);
    }

    if (!TIMPURI_GALERIE.has(imagine.timp)) {
      console.error(
        `[Eroare initializare] Imagine invalida in src/json/galerie.json la index ${index}. Valoarea timp trebuie sa fie una dintre: dimineata, zi, noapte.`
      );
      process.exit(1);
    }

    const numeFisier = path.basename(String(imagine.cale_relativa));
    const extensie = path.extname(numeFisier).toLowerCase();
    if (!EXTENSII_IMAGINI_ACCEPTATE.has(extensie)) {
      console.error(
        `[Eroare initializare] Imagine invalida in src/json/galerie.json la index ${index}. Extensia ${extensie} nu este acceptata.`
      );
      process.exit(1);
    }

    const caleImagine = path.join(caleGalerieAbsoluta, numeFisier);
    if (!fs.existsSync(caleImagine) || !fs.statSync(caleImagine).isFile()) {
      console.error(
        `[Eroare initializare] Fisier imagine inexistent pentru src/json/galerie.json la index ${index}: ${numeFisier}.`
      );
      process.exit(1);
    }
  });
}

function initGalerie() {
  const caleGalerieJson = path.join(__dirname, 'src/json/galerie.json');
  const continut = fs.readFileSync(caleGalerieJson, 'utf-8');
  const obGalerie = JSON.parse(continut);

  obGlobal.obGalerie = {
    cale_galerie: String(obGalerie.cale_galerie),
    imagini: obGalerie.imagini.map((imagine) => ({
      ...imagine,
      cale_relativa: path.basename(String(imagine.cale_relativa)),
    })),
  };

  const caleGalerieRelativa = String(obGalerie.cale_galerie).replace(/^[/\\]+/, '');
  obGlobal.caleGalerieAbsoluta = path.join(__dirname, caleGalerieRelativa);
  obGlobal.caleCacheGalerie = path.join(__dirname, 'temp', 'galerie_statica');
  fs.mkdirSync(obGlobal.caleCacheGalerie, { recursive: true });
}

function obtineIntervalGalerieDinOra(ora) {
  if (ora >= 5 && ora < 12) {
    return 'dimineata';
  }

  if (ora >= 12 && ora < 20) {
    return 'zi';
  }

  return 'noapte';
}

function completeazaLaMinimSaseImagini(imagini) {
  if (imagini.length === 0) {
    return [];
  }

  const selectie = [...imagini];
  let index = 0;

  while (selectie.length < 6) {
    selectie.push(imagini[index % imagini.length]);
    index += 1;
  }

  return selectie;
}

function trunchiazaLaMultipluDe3(imagini) {
  const multipluDe3 = imagini.length - (imagini.length % 3);
  if (multipluDe3 === 0) {
    return imagini;
  }

  return imagini.slice(0, multipluDe3);
}

function pregatesteImagineGaleriePentruTemplate(imagine, index) {
  const numeFisier = path.basename(imagine.cale_relativa);
  const numeCodificat = encodeURIComponent(numeFisier);

  return {
    ...imagine,
    indexNumeric: index + 1,
    altText: imagine.alt && String(imagine.alt).trim() ? imagine.alt : imagine.nume,
    sursaMare: path.posix.join(obGlobal.obGalerie.cale_galerie, numeFisier),
    sursaMedie: `/galerie-statica/imagini/medium/${numeCodificat}`,
    sursaMica: `/galerie-statica/imagini/small/${numeCodificat}`,
  };
}

function genereazaNumarParAleator(min, max) {
  const minPar = min % 2 === 0 ? min : min + 1;
  const maxPar = max % 2 === 0 ? max : max - 1;

  const nrPosibilitati = (maxPar - minPar) / 2 + 1;
  const indexAleator = Math.floor(Math.random() * nrPosibilitati);
  return minPar + indexAleator * 2;
}

function obtineDateGalerieAnimata() {
  const numarImagini = genereazaNumarParAleator(6, 12);
  console.log(`[Galerie Animata] Numar imagini generat: ${numarImagini}`);

  const intervalCurent = obtineIntervalGalerieDinOra(new Date().getHours());

  let imaginiDisponibile = obGlobal.obGalerie.imagini.filter(
    (imagine) => imagine.timp === intervalCurent
  );

  if (imaginiDisponibile.length < numarImagini) {
    const imaginiSuplimentare = obGlobal.obGalerie.imagini.filter(
      (imagine) => imagine.timp !== intervalCurent
    );
    imaginiDisponibile = [...imaginiDisponibile, ...imaginiSuplimentare];
  }

  const imaginiAmestecate = [...imaginiDisponibile];
  for (let i = imaginiAmestecate.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [imaginiAmestecate[i], imaginiAmestecate[j]] = [imaginiAmestecate[j], imaginiAmestecate[i]];
  }

  const selectie = imaginiAmestecate.slice(0, numarImagini);

  return selectie.map(pregatesteImagineGaleriePentruTemplate);
}

function obtineDateGaleriePentruRandare() {
  const intervalCurent = obtineIntervalGalerieDinOra(new Date().getHours());
  const imaginiInterval = obGlobal.obGalerie.imagini.filter(
    (imagine) => imagine.timp === intervalCurent
  );
  const minimSase = completeazaLaMinimSaseImagini(imaginiInterval);
  const selectieFinala = trunchiazaLaMultipluDe3(minimSase);

  return {
    intervalGalerie: intervalCurent,
    galerieStatica: selectieFinala.map(pregatesteImagineGaleriePentruTemplate),
  };
}

// ===== Bonus F:
function extrageBloc(text, startIndex, deschis, inchis) {
  if (text[startIndex] !== deschis) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIndex; i < text.length; i++) {
    let ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === deschis) depth++;
    else if (ch === inchis) { depth--; if (depth === 0) return text.slice(startIndex, i + 1); }
  }
  return null;
}

function extrageCheiTopNivel(bloc) {
  let chei = [];
  let depth = 0;
  let i = 0;

  while (i < bloc.length) {
    let ch = bloc[i];

    if (ch === '"') {
      let j = i + 1;
      while (j < bloc.length && bloc[j] !== '"') {
        if (bloc[j] === '\\') j++;
        j++;
      }

      if (depth === 1) {
        let k = j + 1;
        while (k < bloc.length && /\s/.test(bloc[k])) k++;
        if (bloc[k] === ':') chei.push(bloc.slice(i + 1, j));
      }
      i = j + 1;
      continue;
    }

    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') depth--;
    i++;
  }
  return chei;
}

// Verifica daca o lista de chei contine duplicate
function verificaDuplicateCheie(chei, eticheta) {
  let frecvente = {};
  for (let cheie of chei) frecvente[cheie] = (frecvente[cheie] || 0) + 1;
  let duplicate = Object.keys(frecvente).filter(function (c) { return frecvente[c] > 1; });
  if (duplicate.length > 0) {
    console.error("[Eroare initializare] Proprietate duplicata in " + eticheta + ": " + duplicate.join(", ") + ".");
    process.exit(1);
  }
}

function verificaDuplicateJSON(continut) {
  // Radacina
  verificaDuplicateCheie(extrageCheiTopNivel(continut), "radacina");

  // eroare_default
  let matchDefault = continut.match(/"eroare_default"\s*:/);
  if (matchDefault) {
    let blocDefault = extrageBloc(continut, continut.indexOf('{', matchDefault.index), '{', '}');
    if (blocDefault) verificaDuplicateCheie(extrageCheiTopNivel(blocDefault), "eroare_default");
  }

  // Fiecare obiect din info_erori
  let matchInfo = continut.match(/"info_erori"\s*:/);
  if (matchInfo) {
    let blocVector = extrageBloc(continut, continut.indexOf('[', matchInfo.index), '[', ']');
    if (blocVector) {
      let cursor = 0;
      let idx = 0;
      while (cursor < blocVector.length) {
        if (blocVector[cursor] === '{') {
          let blocEroare = extrageBloc(blocVector, cursor, '{', '}');
          if (blocEroare) {
            verificaDuplicateCheie(extrageCheiTopNivel(blocEroare), "info_erori[" + idx + "]");
            cursor += blocEroare.length;
            idx++;
            continue;
          }
        }
        cursor++;
      }
    }
  }
}

function verificaFisierEroriLaPornire() {
  let caleErori = path.join(__dirname, "src/json/erori.json");

  // --- Bonus A:
  if (!fs.existsSync(caleErori)) {
    console.error("Eroare Critica: Nu exista fisierul erori.json la calea " + caleErori);
    process.exit(1);
  }

  let continut = fs.readFileSync(caleErori, "utf-8");

  // --- Bonus F:
  verificaDuplicateJSON(continut);

  let eroriObj = JSON.parse(continut);

  // --- Bonus B: lipseste info_erori, cale_baza sau eroare_default ---
  if (!eroriObj.hasOwnProperty("info_erori") || !eroriObj.hasOwnProperty("cale_baza") || !eroriObj.hasOwnProperty("eroare_default")) {
    console.error("Eroare: Lipsesc una sau mai multe proprietati esentiale (info_erori, cale_baza, eroare_default) din erori.json.");
    process.exit(1);
  }

  // --- Bonus C: in eroare_default lipseste titlu, text sau imagine ---
  let errDef = eroriObj.eroare_default;
  if (!errDef.hasOwnProperty("titlu") || !errDef.hasOwnProperty("text") || !errDef.hasOwnProperty("imagine")) {
    console.error("Eroare: Pentru eroarea default lipseste una dintre proprietatile obligatorii: titlu, text sau imagine.");
    process.exit(1);
  }

  // --- Bonus D: folderul din cale_baza nu exista pe disc ---
  let rawCaleBaza = eroriObj.cale_baza.startsWith("/") ? eroriObj.cale_baza.substring(1) : eroriObj.cale_baza;
  let caleBazaAbs = path.join(__dirname, rawCaleBaza);
  if (!fs.existsSync(caleBazaAbs) || !fs.statSync(caleBazaAbs).isDirectory()) {
    console.error("Eroare: Folderul specificat in \"cale_baza\" (" + eroriObj.cale_baza + ") nu exista in sistemul de fisiere.");
    process.exit(1);
  }

  // --- Bonus E: 
  if (!fs.existsSync(path.join(caleBazaAbs, eroriObj.eroare_default.imagine))) {
    console.error("Eroare: Fisierul imagine pentru eroarea default (" + eroriObj.eroare_default.imagine + ") nu exista fizic in " + caleBazaAbs + ".");
    process.exit(1);
  }

  for (let err of eroriObj.info_erori) {
    if (!fs.existsSync(path.join(caleBazaAbs, err.imagine))) {
      console.error("Eroare: Fisierul imagine pentru eroarea " + err.identificator + " (" + err.imagine + ") nu exista fizic in " + caleBazaAbs + ".");
      process.exit(1);
    }
  }

  // fiecare eroare trebuie sa aiba o imagine DIFERITA
  let numarImagini = {};
  numarImagini[eroriObj.eroare_default.imagine] = 1;
  for (let err of eroriObj.info_erori) {
    numarImagini[err.imagine] = (numarImagini[err.imagine] || 0) + 1;
  }
  for (let fisier in numarImagini) {
    if (numarImagini[fisier] > 1) {
      console.error("Eroare: Imaginea " + fisier + " este folosita de mai multe erori. Fiecare eroare trebuie sa aiba o imagine diferita.");
      process.exit(1);
    }
  }

  // --- Bonus G: mai multe erori cu acelasi identificator ---
  let idCount = {};
  for (let err of eroriObj.info_erori) {
    idCount[err.identificator] = (idCount[err.identificator] || 0) + 1;
  }

  for (let id in idCount) {
    if (idCount[id] > 1) {
      let duplicates = eroriObj.info_erori.filter(function (e) { return e.identificator == id; });
      let props = duplicates.map(function (d) {
        let clone = { ...d };
        delete clone.identificator;
        return JSON.stringify(clone);
      }).join(" | ");
      console.error("Eroare: Exista mai multe erori cu identificatorul [" + id + "]. Proprietatile acestora sunt: " + props);
      process.exit(1);
    }
  }
}

verificaFisierEroriLaPornire();
initErori();
verificaFisierGalerieLaPornire();
initGalerie();
compileazaInitialToateScss();
pornesteWatchScss();

server.set('view engine', 'ejs');
server.set('views', path.join(__dirname, 'views'));
server.use('/src', express.static(path.join(__dirname, 'src')));
server.use((req, res, next) => {
  res.locals.ipUtilizator = req.ip;
  res.locals.categorii_menu = categoriiCache;
  next();
});

console.log('Folder fisier index.js (__dirname):', __dirname);
console.log('Calea fisierului (__filename):', __filename);
console.log('Folder curent de lucru (process.cwd()):', process.cwd());

function afisareEroare(res, identificator, titlu, text, imagine) {
  let eroare = null;

  if (identificator !== undefined && identificator !== null) {
    eroare = obGlobal.obErori.info_erori.find((elem) => elem.identificator === identificator);
  }

  const eroareFinala = eroare || obGlobal.obErori.eroare_default;
  const titluFinal = titlu ?? eroareFinala.titlu;
  const textFinal = text ?? eroareFinala.text;
  const imagineFinala = imagine ?? eroareFinala.imagine;

  if (eroare && eroare.status) {
    res.status(identificator);
  }

  res.render('pagini/eroare', {
    titlu: titluFinal,
    text: textFinal,
    imagine: imagineFinala,
  });
}

server.use((req, res, next) => {
  if (req.path.endsWith('.ejs')) {
    return afisareEroare(res, 400);
  }

  return next();
});

server.use('/resurse', (req, res, next) => {
  if (!path.extname(req.path)) {
    return afisareEroare(res, 403);
  }

  return next();
});

server.use('/resurse', express.static(path.join(__dirname, 'src'), { index: false }));

server.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'images', 'favicon', 'favicon.ico'));
});

server.get('/galerie-statica/imagini/:dimensiune/:fisier', async (req, res) => {
  try {
    const { dimensiune } = req.params;
    const latime = DIMENSIUNI_GALERIE[dimensiune];

    if (!latime) {
      return afisareEroare(res, 400, 'Cerere invalida', 'Dimensiune imagine invalida.');
    }

    const fisierDecodat = decodeURIComponent(String(req.params.fisier || ''));
    const fisierSigur = path.basename(fisierDecodat);
    if (!fisierSigur || fisierSigur !== fisierDecodat) {
      return afisareEroare(res, 400, 'Cerere invalida', 'Nume de fisier invalid.');
    }

    const extensie = path.extname(fisierSigur).toLowerCase();
    if (!EXTENSII_IMAGINI_ACCEPTATE.has(extensie)) {
      return afisareEroare(res, 400, 'Cerere invalida', 'Extensie imagine neacceptata.');
    }

    const caleOriginala = path.join(obGlobal.caleGalerieAbsoluta, fisierSigur);
    if (!fs.existsSync(caleOriginala) || !fs.statSync(caleOriginala).isFile()) {
      return afisareEroare(res, 404, 'Imagine indisponibila', 'Imaginea ceruta nu exista.');
    }

    const subfolderCache = path.join(obGlobal.caleCacheGalerie, dimensiune);
    fs.mkdirSync(subfolderCache, { recursive: true });
    const numeCache = `${path.parse(fisierSigur).name}-${dimensiune}${extensie}`;
    const caleCache = path.join(subfolderCache, numeCache);

    if (!fs.existsSync(caleCache)) {
      await sharp(caleOriginala)
        .resize({ width: latime })
        .toFile(caleCache);
    }

    return res.sendFile(caleCache);
  } catch (error) {
    console.error('[Eroare galerie] Nu s-a putut genera imaginea redimensionata.', error);
    return afisareEroare(res, 500);
  }
});

server.get(['/', '/index', '/home'], (req, res) => {
  const dateGalerie = obtineDateGaleriePentruRandare();

  const galerieAnimata = obtineDateGalerieAnimata();

  try {
    compileazaScss('galerie-animata.scss', 'galerie-animata.css');
    console.log(`[Galerie Animata] CSS compilat cu succes pentru ${galerieAnimata.length} imagini.`);
  } catch (eroare) {
    console.error(`[Galerie Animata] Eroare la compilarea SCSS: ${eroare.message}`);
  }

  res.render('pagini/index', {
    title: 'Basketball Equipment Marketplace',
    heading: 'Bine ai venit in magazinul de echipament pentru baschet',
    galerieStatica: dateGalerie.galerieStatica,
    intervalGalerie: dateGalerie.intervalGalerie,
    galerieAnimata: galerieAnimata,
  });
});

server.get('/produse', async (req, res) => {
  try {
    const categorieCeruta = req.query.categorie;
    let querySQL, params;

    if (categorieCeruta && categorieCeruta !== 'toate' && categoriiCache.includes(categorieCeruta)) {
      querySQL = 'SELECT * FROM produse WHERE categorie_mare = $1';
      params = [categorieCeruta];
    } else {
      querySQL = 'SELECT * FROM produse';
      params = [];
    }

    const result = await client.query(querySQL, params);

    const rezPret = await client.query('SELECT MIN(pret) AS minim, MAX(pret) AS maxim FROM produse');
    const rezSubcat = await client.query('SELECT DISTINCT subcategorie FROM produse WHERE subcategorie IS NOT NULL ORDER BY subcategorie');
    const rezCulori = await client.query('SELECT DISTINCT culoare_dominanta FROM produse WHERE culoare_dominanta IS NOT NULL ORDER BY culoare_dominanta');
    const rezMat = await client.query("SELECT DISTINCT btrim(unnest(string_to_array(materiale, ','))) AS material FROM produse WHERE materiale IS NOT NULL ORDER BY material");
    const rezCateg = await client.query("SELECT unnest(enum_range(NULL::categ_produs))::text AS categorie");

    const pretMinGlobal = rezPret.rows[0].minim || 0;
    const pretMaxGlobal = rezPret.rows[0].maxim || 1000;
    const subcategoriiSortate = rezSubcat.rows.map(r => r.subcategorie);
    const culoriSortate = rezCulori.rows.map(r => r.culoare_dominanta);
    const materialeSortate = rezMat.rows.map(r => r.material);
    const categoriiSortate = rezCateg.rows.map(r => r.categorie);

    res.render('pagini/produse', {
      title: categorieCeruta && categorieCeruta !== 'toate' ? `Produse - ${categorieCeruta}` : 'Produse',
      produse: result.rows,
      categorie_curenta: categorieCeruta || 'toate',
      pretMinGlobal,
      pretMaxGlobal,
      subcategoriiSortate,
      culoriSortate,
      materialeSortate,
      categoriiSortate
    });
  } catch (err) {
    console.error(err);
    return afisareEroare(res, 500, "Eroare la preluarea produselor");
  }
});

server.get('/produs/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return afisareEroare(res, 400, "ID produs invalid");
  }
  client.query('SELECT * FROM produse WHERE id = $1', [id], (err, result) => {
    if (err) {
      console.error(err);
      return afisareEroare(res, 500, "Eroare la preluarea produsului");
    }
    if (result.rowCount === 0) {
      return afisareEroare(res, 404, "Produs inexistent", "Produsul cerut nu a putut fi gasit.");
    }

    // Regula stricta: Transmiterea datelor prin obiectul locals
    res.locals.produs = result.rows[0];
    res.render('pagini/produs', { title: res.locals.produs.nume });
  });
});

server.get('/:pagina', (req, res) => {
  const { pagina } = req.params;
  const paginaCuratata = String(pagina || '').trim();

  if (/\.html$/i.test(paginaCuratata)) {
    const numeFaraExtensie = paginaCuratata.replace(/\.html$/i, '');

    if (/^(index|home)$/i.test(numeFaraExtensie) || numeFaraExtensie.length === 0) {
      return res.redirect('/');
    }

    return res.redirect(`/${numeFaraExtensie}`);
  }

  res.render(
    `pagini/${pagina}`,
    {
      galerieStatica: [],
      intervalGalerie: obtineIntervalGalerieDinOra(new Date().getHours()),
    },
    function (eroare, rezultatRandare) {
      if (eroare) {
        if (eroare.message.startsWith('Failed to lookup view')) {
          return afisareEroare(res, 404);
        }
        return afisareEroare(res, 500);
      }
      return res.send(rezultatRandare);
    }
  );
});

server.listen(PORT, () => {
  console.log(`Serverul ruleaza pe portul ${PORT}`);
});
