const express = require('express');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const obGlobal = {
  obErori: null,
  obGalerie: null,
  caleGalerieAbsoluta: null,
  caleCacheGalerie: null,
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

function verificaProprietatiDuplicateInJsonString(jsonText, caleFisier) {
  try {
    function extrageBloc(text, startIndex, openChar, closeChar) {
      if (startIndex < 0 || text[startIndex] !== openChar) {
        return null;
      }

      let depth = 0;
      let inString = false;
      let escaped = false;

      for (let i = startIndex; i < text.length; i += 1) {
        const ch = text[i];

        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (ch === '\\') {
            escaped = true;
          } else if (ch === '"') {
            inString = false;
          }
          continue;
        }

        if (ch === '"') {
          inString = true;
          continue;
        }

        if (ch === openChar) {
          depth += 1;
        } else if (ch === closeChar) {
          depth -= 1;
          if (depth === 0) {
            return text.slice(startIndex, i + 1);
          }
        }
      }

      return null;
    }

    function extrageCheiTopNivel(obiectText) {
      const chei = [];
      let i = 0;
      let depth = 0;

      while (i < obiectText.length) {
        const ch = obiectText[i];

        if (ch === '"') {
          let j = i + 1;
          while (j < obiectText.length) {
            if (obiectText[j] === '\\') {
              j += 2;
              continue;
            }
            if (obiectText[j] === '"') {
              break;
            }
            j += 1;
          }

          if (depth === 1) {
            let k = j + 1;
            while (k < obiectText.length && /\s/.test(obiectText[k])) {
              k += 1;
            }
            if (obiectText[k] === ':') {
              chei.push(obiectText.slice(i + 1, j));
            }
          }

          i = j + 1;
          continue;
        }

        if (ch === '{' || ch === '[') {
          depth += 1;
        } else if (ch === '}' || ch === ']') {
          depth -= 1;
        }

        i += 1;
      }

      return chei;
    }

    function verificaDuplicate(chei, eticheta) {
      const frecvente = {};
      for (const cheie of chei) {
        frecvente[cheie] = (frecvente[cheie] || 0) + 1;
      }

      const duplicate = Object.keys(frecvente).filter((cheie) => frecvente[cheie] > 1);
      if (duplicate.length > 0) {
        throw new Error(`Proprietate duplicata in ${eticheta}: ${duplicate.join(', ')}.`);
      }
    }

    verificaDuplicate(extrageCheiTopNivel(jsonText), 'radacina');

    const matchEroareDefault = jsonText.match(/"eroare_default"\s*:/);
    if (matchEroareDefault) {
      const startDefault = jsonText.indexOf('{', matchEroareDefault.index);
      const blocDefault = extrageBloc(jsonText, startDefault, '{', '}');
      if (blocDefault) {
        verificaDuplicate(extrageCheiTopNivel(blocDefault), 'eroare_default');
      }
    }

    const matchInfoErori = jsonText.match(/"info_erori"\s*:/);
    if (matchInfoErori) {
      const startInfoErori = jsonText.indexOf('[', matchInfoErori.index);
      const blocInfoErori = extrageBloc(jsonText, startInfoErori, '[', ']');

      if (blocInfoErori) {
        let cursor = 0;
        let indexEroare = 0;

        while (cursor < blocInfoErori.length) {
          if (blocInfoErori[cursor] === '{') {
            const blocEroare = extrageBloc(blocInfoErori, cursor, '{', '}');
            if (blocEroare) {
              verificaDuplicate(extrageCheiTopNivel(blocEroare), `info_erori[${indexEroare}]`);
              cursor += blocEroare.length;
              indexEroare += 1;
              continue;
            }
          }
          cursor += 1;
        }
      }
    }
  } catch (error) {
    console.error(
      `[Eroare initializare] JSON invalid in ${caleFisier}. ${error.message}`
    );
    process.exit(1);
  }
}

function verificaFisierEroriLaPornire() {
  const caleEroriJson = path.join(__dirname, 'src/json/erori.json');

  if (!fs.existsSync(caleEroriJson)) {
    console.error(
      '[Eroare initializare] Fisierul obligatoriu de configurare a erorilor lipseste: src/json/erori.json. Verifica daca fisierul exista, numele este corect si calea nu a fost modificata.'
    );
    process.exit(1);
  }

  const continut = fs.readFileSync(caleEroriJson, 'utf-8');
  verificaProprietatiDuplicateInJsonString(continut, 'src/json/erori.json');
  const obErori = JSON.parse(continut);
  const proprietatiObligatorii = ['info_erori', 'cale_baza', 'eroare_default'];
  const proprietatiLipsa = proprietatiObligatorii.filter(
    (proprietate) => !Object.prototype.hasOwnProperty.call(obErori, proprietate)
  );

  if (proprietatiLipsa.length > 0) {
    console.error(
      `[Eroare initializare] Structura invalida in src/json/erori.json. Lipsesc proprietatile obligatorii: ${proprietatiLipsa.join(', ')}. Completeaza fisierul cu toate cheile cerute: info_erori, cale_baza, eroare_default.`
    );
    process.exit(1);
  }

  const proprietatiDefaultObligatorii = ['titlu', 'text', 'imagine'];
  const proprietatiDefaultLipsa = proprietatiDefaultObligatorii.filter(
    (proprietate) => !Object.prototype.hasOwnProperty.call(obErori.eroare_default, proprietate)
  );

  if (proprietatiDefaultLipsa.length > 0) {
    console.error(
      `[Eroare initializare] Structura invalida pentru eroarea default in src/json/erori.json. Lipsesc proprietatile obligatorii: ${proprietatiDefaultLipsa.join(', ')}. Completeaza campul eroare_default cu cheile: titlu, text, imagine.`
    );
    process.exit(1);
  }

  const caleBazaRelativa = String(obErori.cale_baza).replace(/^[/\\]+/, '');
  const caleBazaAbsoluta = path.join(__dirname, caleBazaRelativa);

  if (!fs.existsSync(caleBazaAbsoluta) || !fs.statSync(caleBazaAbsoluta).isDirectory()) {
    console.error(
      `[Eroare initializare] Folderul indicat in "cale_baza" nu exista in sistemul de fisiere: ${obErori.cale_baza}. Calea verificata pe disc este: ${caleBazaAbsoluta}. Creeaza folderul sau corecteaza valoarea din erori.json.`
    );
    process.exit(1);
  }

  const imaginiErori = [
    { sursa: 'eroare_default.imagine', fisier: obErori.eroare_default.imagine },
    ...obErori.info_erori.map((eroare, index) => ({
      sursa: `info_erori[${index}].imagine`,
      fisier: eroare.imagine,
    })),
  ];

  const imaginiLipsa = imaginiErori.filter(({ fisier }) => {
    const caleImagine = path.join(caleBazaAbsoluta, String(fisier));
    return !fs.existsSync(caleImagine) || !fs.statSync(caleImagine).isFile();
  });

  if (imaginiLipsa.length > 0) {
    const detaliiImaginiLipsa = imaginiLipsa
      .map(({ sursa, fisier }) => `${sursa} -> ${fisier}`)
      .join('; ');

    console.error(
      `[Eroare initializare] Unele imagini asociate erorilor nu exista in sistemul de fisiere. Verifica fisierele indicate in src/json/erori.json: ${detaliiImaginiLipsa}. Folder verificat: ${caleBazaAbsoluta}.`
    );
    process.exit(1);
  }

  const imaginiDuplicate = imaginiErori.reduce((acc, { fisier }) => {
    const numeFisier = String(fisier);
    acc[numeFisier] = (acc[numeFisier] || 0) + 1;
    return acc;
  }, {});
  const fisiereDuplicate = Object.keys(imaginiDuplicate).filter(
    (numeFisier) => imaginiDuplicate[numeFisier] > 1
  );

  if (fisiereDuplicate.length > 0) {
    console.error(
      `[Eroare initializare] Configuratie invalida in src/json/erori.json. Fiecare eroare trebuie sa aiba o imagine diferita, dar urmatoarele fisiere sunt folosite de mai multe erori: ${fisiereDuplicate.join(', ')}.`
    );
    process.exit(1);
  }

  const mapIdentificatori = new Map();

  obErori.info_erori.forEach((eroare, index) => {
    const id = eroare.identificator;
    if (!mapIdentificatori.has(id)) {
      mapIdentificatori.set(id, []);
    }

    const { identificator: _identificatorOmis, ...proprietatiFaraIdentificator } = eroare;
    mapIdentificatori.get(id).push({
      index,
      proprietati: proprietatiFaraIdentificator,
    });
  });

  const grupuriIdentificatoriDuplicati = Array.from(mapIdentificatori.entries()).filter(
    ([, aparitii]) => aparitii.length > 1
  );

  if (grupuriIdentificatoriDuplicati.length > 0) {
    const detaliiDuplicate = grupuriIdentificatoriDuplicati
      .map(([id, aparitii]) => {
        const detaliiAparitii = aparitii
          .map(
            ({ index, proprietati }) =>
              `info_erori[${index}] -> ${JSON.stringify(proprietati)}`
          )
          .join('; ');

        return `identificator ${JSON.stringify(id)}: ${detaliiAparitii}`;
      })
      .join(' | ');

    console.error(
      `[Eroare initializare] Configuratie invalida in src/json/erori.json. Exista mai multe erori in vectorul info_erori cu acelasi identificator. Pentru fiecare identificator duplicat, sunt listate toate proprietatile obiectelor (fara identificator): ${detaliiDuplicate}.`
    );
    process.exit(1);
  }
}

verificaFisierEroriLaPornire();
initErori();
verificaFisierGalerieLaPornire();
initGalerie();

server.set('view engine', 'ejs');
server.set('views', path.join(__dirname, 'views'));
server.use('/src', express.static(path.join(__dirname, 'src')));
server.use((req, res, next) => {
  res.locals.ipUtilizator = req.ip;
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

  res.render('pagini/index', {
    title: 'Basketball Equipment Marketplace',
    heading: 'Bine ai venit in magazinul de echipament pentru baschet',
    galerieStatica: dateGalerie.galerieStatica,
    intervalGalerie: dateGalerie.intervalGalerie,
  });
});

server.get('/produse', (req, res) => {
  const dateGalerie = obtineDateGaleriePentruRandare();

  res.render('pagini/produse', {
    title: 'Produse Iverson Era',
    heading: 'Produse si galerie statica',
    galerieStatica: dateGalerie.galerieStatica,
    intervalGalerie: dateGalerie.intervalGalerie,
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
