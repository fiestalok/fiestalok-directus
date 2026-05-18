import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('database/data.db');

// Vérifie si la table existe
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log("Tables existantes:", tables.map(t => t.name));

// Vérifie dans directus_collections
const collections = db.prepare("SELECT collection FROM directus_collections").all();
console.log("\ndirectus_collections:", collections.map(c => c.collection));

db.close();
