import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('database/data.db');

const options = JSON.stringify({
  choices: [
    { text: 'Principal', value: 'Principal' },
    { text: 'Secondaire', value: 'secondaire' }
  ]
});

const displayOptions = JSON.stringify({
  choices: [
    { value: 'Principal', text: 'Principal', foreground: 'var(--theme--primary)', background: 'var(--theme--primary-background)' },
    { value: 'secondaire', text: 'Secondaire', foreground: 'var(--theme--foreground)', background: 'var(--theme--background-normal)' }
  ],
  showAsDot: false
});

try {
  db.exec('ALTER TABLE articles ADD COLUMN type VARCHAR(255)');
  console.log("✓ Colonne 'type' ajoutée à la table articles");
} catch (e) {
  console.log(`⚠ Colonne déjà existante : ${e.message}`);
}

try {
  db.prepare(`
    INSERT INTO directus_fields (
      collection, field, special, interface, options, display, display_options,
      readonly, hidden, sort, width, translations, note, conditions, required, "group", validation, validation_message
    ) VALUES (?, ?, NULL, ?, ?, ?, ?, 0, 0, 17, 'full', NULL, NULL, NULL, 0, NULL, NULL, NULL)
  `).run('articles', 'type', 'select-dropdown', options, 'labels', displayOptions);
  console.log("✓ Métadonnées Directus insérées");
} catch (e) {
  console.log(`⚠ Erreur insertion : ${e.message}`);
}

db.close();
console.log("✓ Terminé — redémarre le container Directus");
