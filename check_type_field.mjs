import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('database/data.db');

const field = db.prepare("SELECT * FROM directus_fields WHERE collection = 'articles' AND field = 'type'").get();
console.log("directus_fields:", field ?? "❌ NON TROUVÉ");

const col = db.prepare("PRAGMA table_info(articles)").all();
const typeCol = col.find(c => c.name === 'type');
console.log("Colonne dans articles:", typeCol ?? "❌ NON TROUVÉE");

db.close();
