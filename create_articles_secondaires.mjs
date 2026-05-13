import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('database/data.db');

// Vérif colonnes
const cols = db.prepare("PRAGMA table_info(articles)").all();
console.log("Colonnes articles:", cols.map(c => c.name).join(', '));
console.log('');

const articles = [
  {
    reference: 'Groupe électrogène',
    etat: 'disponible',
    type: 'secondaire',
    notes: 'Techno inverter (bruit) = 64 dB\nAutonomie 6-8h (prix x2 si longue autonomie)',
  },
  {
    reference: 'Enrouleur électrique',
    etat: 'disponible',
    type: 'secondaire',
    notes: 'Section 3G2.5 mm² - 25m - IP44 (extérieur)',
  },
  {
    reference: 'Jerican',
    etat: 'disponible',
    type: 'secondaire',
    notes: 'Consommation château 10h → 9 à 12 L',
  },
  {
    reference: 'Plaque anti-vibration',
    etat: 'disponible',
    type: 'secondaire',
    notes: 'Sous le groupe électrogène',
  },
  {
    reference: 'Bâche protection',
    etat: 'disponible',
    type: 'secondaire',
    notes: 'Protection humidité sol / saleté',
  },
];

const colNames = cols.map(c => c.name);
const hasField = (f) => colNames.includes(f);

for (const art of articles) {
  try {
    const fields = ['reference', 'etat', 'type'];
    const values = [art.reference, art.etat, art.type];

    if (hasField('notes') && art.notes) { fields.push('notes'); values.push(art.notes); }
    if (hasField('status')) { fields.push('status'); values.push('published'); }

    const placeholders = fields.map(() => '?').join(', ');
    db.prepare(`INSERT INTO articles (${fields.join(', ')}) VALUES (${placeholders})`).run(...values);
    console.log(`✓ ${art.reference}`);
  } catch (e) {
    console.log(`✗ ${art.reference} : ${e.message}`);
  }
}

db.close();
console.log('\n✅ Terminé');
