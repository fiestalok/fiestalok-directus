import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('database/data.db');

const fields = [
  {
    col: 'livraison',
    sql: 'ALTER TABLE reservations ADD COLUMN livraison INTEGER DEFAULT 0',
    meta: {
      interface: 'boolean', display: 'boolean', special: '["cast-boolean"]',
      sort: 50, width: 'half',
    },
  },
  {
    col: 'installation',
    sql: 'ALTER TABLE reservations ADD COLUMN installation INTEGER DEFAULT 0',
    meta: {
      interface: 'boolean', display: 'boolean', special: '["cast-boolean"]',
      sort: 51, width: 'half',
    },
  },
  {
    col: 'fichier_devis',
    sql: 'ALTER TABLE reservations ADD COLUMN fichier_devis TEXT',
    meta: {
      interface: 'file', display: 'file', special: null,
      sort: 52, width: 'full',
    },
  },
];

for (const f of fields) {
  try {
    db.prepare(f.sql).run();
    console.log(`✓ Colonne '${f.col}' ajoutée`);
  } catch (e) {
    console.log(`⚠ '${f.col}' : ${e.message}`);
  }
  try {
    db.prepare(`
      INSERT INTO directus_fields (collection, field, special, interface, display, readonly, hidden, sort, width, required)
      VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, 0)
    `).run('reservations', f.col, f.meta.special, f.meta.interface, f.meta.display, f.meta.sort, f.meta.width);
    console.log(`  ✓ directus_fields OK`);
  } catch (e) {
    console.log(`  ⚠ directus_fields : ${e.message}`);
  }
}

db.close();
console.log('\n✅ Terminé — redémarre le container');
