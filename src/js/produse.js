// Levenshtein distance
function levenshtein(a, b) {
    var m = a.length, n = b.length;
    var dp = [];
    for (var i = 0; i <= m; i++) { dp[i] = []; dp[i][0] = i; }
    for (var j = 0; j <= n; j++) dp[0][j] = j;
    for (var i = 1; i <= m; i++) {
        for (var j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j - 1], dp[i][j - 1], dp[i - 1][j]);
        }
    }
    return dp[m][n];
}

// Fuzzy match: substring exact SAU Levenshtein <= 2
function fuzzyMatch(search, name) {
    if (!search) return true;
    search = search.toLowerCase().trim();
    name = name.toLowerCase();
    if (name.indexOf(search) !== -1) return true;
    if (search.length >= 3) {
        var words = name.split(/\s+/);
        for (var w = 0; w < words.length; w++) {
            if (levenshtein(search, words[w]) <= 2) return true;
        }
        for (var i = 0; i <= name.length - search.length; i++) {
            if (levenshtein(search, name.substring(i, i + search.length)) <= 2) return true;
        }
    }
    return false;
}

(function () {
    var inputNume = document.getElementById('filtru-nume');
    var inputPret = document.getElementById('filtru-pret');
    var pretCurent = document.getElementById('pret-curent');
    var inputSubcateg = document.getElementById('filtru-subcategorie');
    var textareaDescriere = document.getElementById('filtru-descriere');
    var selectCuloare = document.getElementById('filtru-culoare');
    var selectCategorie = document.getElementById('filtru-categorie');
    var matCheckboxes = document.querySelectorAll('.mat-checkbox');
    var articole = Array.from(document.querySelectorAll('.produs-articol'));

    // Salvam ordinea initiala pentru resetare
    var articoleInitiale = Array.from(document.querySelectorAll('.produs-articol'));

    var containerProduse = document.querySelector('.produse-lista');

    // Butoane actiune
    var btnFiltreaza = document.getElementById('btn-filtreaza');
    var btnReset = document.getElementById('btn-reset');
    var btnSortAsc = document.getElementById('btn-sort-asc');
    var btnSortDesc = document.getElementById('btn-sort-desc');
    var btnCalcul = document.getElementById('btn-calcul');

    // Actualizeaza valoarea range in timp real (afisare vizuala doar)
    if (inputPret) {
        inputPret.addEventListener('input', function () {
            pretCurent.textContent = this.value;
        });
    }

    // --- VALIDARE INPUTURI ---
    function valideazaInputuri() {
        var isValid = true;
        var mesaj = "";

        // Resetam clasele is-invalid anterior setate
        if (inputNume) inputNume.classList.remove('is-invalid');
        if (textareaDescriere) textareaDescriere.classList.remove('is-invalid');

        // Regula 1: Numele nu are voie sa contina cifre (nu are sens pt aplicatie)
        if (inputNume && /\d/.test(inputNume.value)) {
            inputNume.classList.add('is-invalid');
            mesaj += "Numele produsului nu poate contine cifre!\n";
            isValid = false;
        }

        // Regula 2: Daca descrierea e completata, trebuie sa aiba macar 3 caractere
        if (textareaDescriere && textareaDescriere.value.trim().length > 0 && textareaDescriere.value.trim().length < 3) {
            textareaDescriere.classList.add('is-invalid');
            mesaj += "Daca completati descrierea, cautati macar dupa 3 caractere!\n";
            isValid = false;
        }

        if (!isValid) {
            alert("Operatiune anulata:\n\n" + mesaj);
        }

        return isValid;
    }

    // Corectare automata is-invalid pe textarea cand valoarea devine valida
    if (textareaDescriere) {
        textareaDescriere.addEventListener('input', function () {
            var len = this.value.trim().length;
            if (len === 0 || len >= 3) {
                this.classList.remove('is-invalid');
            }
        });
    }

    // Corectare automata is-invalid pe inputNume
    if (inputNume) {
        inputNume.addEventListener('input', function () {
            if (!/\d/.test(this.value)) {
                this.classList.remove('is-invalid');
            }
        });
    }

    // --- FILTRARE ---
    function aplicaFiltre() {
        if (!valideazaInputuri()) return;

        var textNume = inputNume ? inputNume.value.trim() : '';
        var pretMax = inputPret ? parseFloat(inputPret.value) : Infinity;
        var subcategVal = inputSubcateg ? inputSubcateg.value.trim().toLowerCase() : '';
        var editieChecked = document.querySelector('input[name="filtru-editie"]:checked');
        var editieVal = editieChecked ? editieChecked.value : 'oricare';
        var descriereVal = textareaDescriere ? textareaDescriere.value.trim().toLowerCase() : '';
        var culoareVal = selectCuloare ? selectCuloare.value : '';

        var categoriiSel = [];
        if (selectCategorie) {
            var opts = selectCategorie.selectedOptions;
            for (var i = 0; i < opts.length; i++) categoriiSel.push(opts[i].value);
        }

        var materialeAre = [], materialeNuAre = [];
        matCheckboxes.forEach(function (cb) {
            if (!cb.checked) return;
            var matVal = cb.value.toLowerCase();
            var radioName = cb.id.replace('mat-', 'mat-radio-');
            var radio = document.querySelector('input[name="' + radioName + '"]:checked');
            if (radio && radio.value === 'nu-are') materialeNuAre.push(matVal);
            else materialeAre.push(matVal);
        });

        articole.forEach(function (art) {
            var viz = true;
            var numeArt = art.getAttribute('data-nume') || '';
            var pretArt = parseFloat(art.getAttribute('data-pret')) || 0;
            var matArt = (art.getAttribute('data-materiale') || '').split(',').map(function (m) { return m.trim().toLowerCase(); });

            if (textNume && !fuzzyMatch(textNume, numeArt)) viz = false;
            if (pretArt > pretMax) viz = false;
            if (subcategVal && (art.getAttribute('data-subcategorie') || '').toLowerCase().indexOf(subcategVal) === -1) viz = false;
            if (editieVal === 'da' && art.getAttribute('data-editie') !== 'true') viz = false;
            if (editieVal === 'nu' && art.getAttribute('data-editie') !== 'false') viz = false;
            for (var a = 0; a < materialeAre.length && viz; a++) { if (matArt.indexOf(materialeAre[a]) === -1) viz = false; }
            for (var n = 0; n < materialeNuAre.length && viz; n++) { if (matArt.indexOf(materialeNuAre[n]) !== -1) viz = false; }
            if (descriereVal && (art.getAttribute('data-descriere') || '').indexOf(descriereVal) === -1) viz = false;
            if (culoareVal && (art.getAttribute('data-culoare') || '') !== culoareVal) viz = false;
            if (categoriiSel.length > 0 && categoriiSel.indexOf(art.getAttribute('data-categorie') || '') === -1) viz = false;

            art.style.display = viz ? '' : 'none';
        });
    }

    if (btnFiltreaza) btnFiltreaza.addEventListener('click', aplicaFiltre);

    // --- RESETARE ---
    if (btnReset) {
        btnReset.addEventListener('click', function () {
            // Confirmare inainte de resetare
            if (confirm("Sunteți sigur că doriți să resetați toate filtrele și sortarea?")) {
                if (inputNume) { inputNume.value = ''; inputNume.classList.remove('is-invalid'); }
                if (inputPret) { inputPret.value = inputPret.max; if (pretCurent) pretCurent.textContent = inputPret.max; }
                if (inputSubcateg) inputSubcateg.value = '';
                if (textareaDescriere) { textareaDescriere.value = ''; textareaDescriere.classList.remove('is-invalid'); }
                if (selectCuloare) selectCuloare.value = '';
                if (selectCategorie) Array.from(selectCategorie.options).forEach(function (opt) { opt.selected = false; });

                var oricareEditie = document.querySelector('input[name="filtru-editie"][value="oricare"]');
                if (oricareEditie) oricareEditie.checked = true;

                matCheckboxes.forEach(function (cb) { cb.checked = false; });
                document.querySelectorAll('.mat-radio[value="are"]').forEach(function (r) { r.checked = true; });

                // Reafiseaza toate elementele si reseteaza ordinea in DOM
                articoleInitiale.forEach(function (art) {
                    art.style.display = '';
                    containerProduse.appendChild(art);
                });
            }
        });
    }

    // --- SORTARE ---
    function sorteaza(ascendent) {
        if (!valideazaInputuri()) return;

        articole.sort(function (a, b) {
            var pretA = parseFloat(a.getAttribute('data-pret')) || 1;
            var marimeA = parseFloat(a.getAttribute('data-marime')) || 0;
            var raportA = marimeA / pretA;
            var subcategA = (a.getAttribute('data-subcategorie') || '').toLowerCase();

            var pretB = parseFloat(b.getAttribute('data-pret')) || 1;
            var marimeB = parseFloat(b.getAttribute('data-marime')) || 0;
            var raportB = marimeB / pretB;
            var subcategB = (b.getAttribute('data-subcategorie') || '').toLowerCase();

            if (raportA !== raportB) {
                return ascendent ? (raportA - raportB) : (raportB - raportA);
            }
            return ascendent ? subcategA.localeCompare(subcategB) : subcategB.localeCompare(subcategA);
        });

        articole.forEach(function (art) {
            containerProduse.appendChild(art);
        });
    }

    if (btnSortAsc) btnSortAsc.addEventListener('click', function () { sorteaza(true); });
    if (btnSortDesc) btnSortDesc.addEventListener('click', function () { sorteaza(false); });

    // --- CALCUL ---
    if (btnCalcul) {
        btnCalcul.addEventListener('click', function () {
            if (!valideazaInputuri()) return;

            var suma = 0;
            var count = 0;
            articole.forEach(function (art) {
                if (art.style.display !== 'none') {
                    suma += parseFloat(art.getAttribute('data-pret')) || 0;
                    count++;
                }
            });
            var medie = count > 0 ? (suma / count).toFixed(2) : 0;

            var infoDiv = document.createElement('div');
            infoDiv.textContent = 'Medie pret produse afisate: ' + medie + ' USD';
            infoDiv.style.position = 'fixed';
            infoDiv.style.bottom = '20px';
            infoDiv.style.left = '50%';
            infoDiv.style.transform = 'translateX(-50%)';
            infoDiv.style.backgroundColor = '#C49A45'; // Gold
            infoDiv.style.color = '#000';
            infoDiv.style.padding = '15px 25px';
            infoDiv.style.borderRadius = '8px';
            infoDiv.style.fontWeight = 'bold';
            infoDiv.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
            infoDiv.style.zIndex = '1000';
            infoDiv.style.transition = 'opacity 0.5s ease';

            document.body.appendChild(infoDiv);

            setTimeout(function () {
                infoDiv.style.opacity = '0';
                setTimeout(function () {
                    if (infoDiv.parentNode) {
                        infoDiv.parentNode.removeChild(infoDiv);
                    }
                }, 500);
            }, 2000);
        });
    }

})();
