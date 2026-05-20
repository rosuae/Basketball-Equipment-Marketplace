DROP TYPE IF EXISTS categ_produs CASCADE;
CREATE TYPE categ_produs AS ENUM('Incaltaminte', 'Imbracaminte', 'Accesorii', 'Mingi', 'Suveniruri');

CREATE TABLE IF NOT EXISTS produse (
   id serial PRIMARY KEY,
   nume text NOT NULL,
   descriere text,
   imagine text,
   categorie_mare categ_produs NOT NULL,
   subcategorie text,
   pret numeric(8,2) NOT NULL,
   marime_us numeric(4,1),
   data_adaugare date DEFAULT CURRENT_DATE,
   culoare_dominanta text,
   materiale text,
   editie_limitata boolean DEFAULT false
);

INSERT INTO produse (nume, descriere, imagine, categorie_mare, subcategorie, pret, marime_us, data_adaugare, culoare_dominanta, materiale, editie_limitata) VALUES 
('Nike Air Jordan 1 Retro High', 'Un clasic al anilor 80, pantofii care au definit o intreaga generatie. Purtati de insusi Michael Jordan.', '/images/jordan1.jpg', 'Incaltaminte', 'Jordan', 180.00, 10.5, '2023-01-15', 'Rosu', 'piele, cauciuc', true),
('Tricou Retro Kobe Bryant Lakers', 'Tricoul de legenda purtat de Kobe Bryant in sezonul 2001, numarul 8.', '/images/kobe_jersey.jpg', 'Imbracaminte', 'Kobe', 120.00, NULL, '2023-02-10', 'Galben', 'mesh, poliester', false),
('Nike Kobe 6 Protro Grinch', 'O editie speciala de Craciun inspirata din celebrul personaj, cu un design solzos iesit din comun.', '/images/kobe6_grinch.jpg', 'Incaltaminte', 'Kobe', 190.00, 11.0, '2023-03-20', 'Verde', 'sintetic, zoom air, cauciuc', true),
('Minge de baschet Spalding NBA Official', 'Mingea oficiala a NBA-ului inainte de trecerea la Wilson. Piele veritabila care necesita "spargere".', '/images/spalding_nba.jpg', 'Mingi', 'Echipament', 150.00, 29.5, '2023-04-05', 'Portocaliu', 'piele naturala', false),
('Bandana LeBron James', 'Accesoriu purtat de LeBron James in primele sale sezoane in liga. Absoarbe umezeala eficient.', '/images/lebron_headband.jpg', 'Accesorii', 'LeBron', 15.00, NULL, '2023-05-12', 'Alb', 'bumbac, elastic', false),
('Nike LeBron 8 South Beach', 'Model lansat la trecerea lui LeBron la Miami Heat, combinatia de culori care a facut istorie.', '/images/lebron8_sb.jpg', 'Incaltaminte', 'LeBron', 250.00, 12.0, '2023-06-18', 'Turcoaz', 'piele sintetica, max air, tpu', true),
('Breloc Chicago Bulls 1996', 'Un mic suvenir comemorand sezonul de 72 de victorii al celor de la Bulls.', '/images/bulls_keychain.jpg', 'Suveniruri', 'Jordan', 8.50, NULL, '2023-07-22', 'Rosu', 'metal, plastic', false),
('Hanorac Vintage Golden State', 'Hanorac cu logo-ul clasic "The City" din era de glorie incipienta.', '/images/gsw_hoodie.jpg', 'Imbracaminte', 'Curry', 85.00, NULL, '2023-08-30', 'Albastru', 'bumbac, fleece', false),
('Under Armour Curry 1 MVP', 'Prima incaltaminte cu care Steph Curry a castigat primul sau premiu MVP.', '/images/curry1_mvp.jpg', 'Incaltaminte', 'Curry', 140.00, 9.5, '2023-09-14', 'Negru', 'mesh, charged cushioning, cauciuc', false),
('Nike Air Jordan 11 Bred', 'Gheata iconica purtata de Jordan in playoff-urile din 96. Cunoscuta pentru patent leather.', '/images/jordan11_bred.jpg', 'Incaltaminte', 'Jordan', 225.00, 10.0, '2023-10-01', 'Negru', 'piele lucioasa, carbon, cauciuc', true),
('Tricou Antrenament Curry', 'Tricou lejer de antrenament care ofera respirabilitate sporita in timpul efortului.', '/images/curry_shirt.jpg', 'Imbracaminte', 'Curry', 45.00, NULL, '2023-11-05', 'Alb', 'poliester', false),
('Bratara de silicon Iverson', 'Bratara clasica pe care multi jucatori o poarta. Inscriptionata cu mesaj motivational.', '/images/iverson_bracelet.jpg', 'Accesorii', 'Iverson', 5.00, NULL, '2023-12-10', 'Negru', 'silicon', false),
('Reebok Question Mid', 'Primul signature shoe al lui Allen Iverson, cu faimoasele hexagoane in talpa.', '/images/question_mid.jpg', 'Incaltaminte', 'Iverson', 150.00, 11.5, '2024-01-20', 'Alb', 'piele, hexalite, cauciuc', false),
('Minge de antrenament Outdoor', 'Minge foarte durabila conceputa pentru terenurile dure de afara din beton sau asfalt.', '/images/outdoor_ball.jpg', 'Mingi', 'Echipament', 35.00, 29.5, '2024-02-15', 'Portocaliu', 'cauciuc dur', false),
('Pahar Colectie Kobe 81 Points', 'Pahar de colectie care sarbatoreste noaptea in care Kobe Bryant a inscris 81 de puncte.', '/images/kobe_glass.jpg', 'Suveniruri', 'Kobe', 25.00, NULL, '2024-03-01', 'Mov', 'sticla', true);
