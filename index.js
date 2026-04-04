const express = require('express');
const fs = require('fs');
const path = require('path');

const obGlobal = {
  obErori: null,
};
const vect_foldere = ['temp', 'logs', 'backup', 'fisiere_uploadate'];

const server = express();
const PORT = process.env.PORT || 8080;

vect_foldere.forEach((numeFolder) => {
  const caleFolder = path.join(__dirname, numeFolder);
  if (!fs.existsSync(caleFolder)) {
    fs.mkdirSync(caleFolder);
  }
});

function initErori() {
  const continut = fs.readFileSync(path.join(__dirname, 'src/json/erori.json'), 'utf-8');
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

initErori();

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

server.get(['/', '/index', '/home'], (req, res) => {
  res.render('pagini/index', {
    title: 'Basketball Equipment Marketplace',
    heading: 'Bine ai venit in magazinul de echipament pentru baschet',
  });
});

server.get('/:pagina', (req, res) => {
  const { pagina } = req.params;

  res.render(`pagini/${pagina}`, function (eroare, rezultatRandare) {
    if (eroare) {
      if (eroare.message.startsWith('Failed to lookup view')) {
        return afisareEroare(res, 404);
      }

      return afisareEroare(res, 500);
    }

    return res.send(rezultatRandare);
  });
});

server.listen(PORT, () => {
  console.log(`Serverul ruleaza pe portul ${PORT}`);
});
