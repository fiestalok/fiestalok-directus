import Database from 'better-sqlite3'

const LOCAL  = './database/data.db'
const REMOTE = './database/data.db.remote'

function inspect(path, label) {
  const db = new Database(path, { readonly: true })
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()
  console.log(`\n=== ${label} (${tables.length} tables) ===`)

  // Only user-facing tables (skip directus_ system tables)
  const userTables = tables.filter(t => !t.name.startsWith('directus_') && !t.name.startsWith('sqlite_'))
  const systemTables = tables.filter(t => t.name.startsWith('directus_'))

  console.log('\n📊 Tables métier :')
  for (const t of userTables) {
    const count = db.prepare(`SELECT COUNT(*) as n FROM "${t.name}"`).get()
    console.log(`  ${t.name.padEnd(40)} ${String(count.n).padStart(6)} lignes`)
  }

  console.log('\n⚙️  Tables système Directus :')
  for (const t of systemTables) {
    const count = db.prepare(`SELECT COUNT(*) as n FROM "${t.name}"`).get()
    console.log(`  ${t.name.padEnd(40)} ${String(count.n).padStart(6)} lignes`)
  }

  db.close()
}

inspect(LOCAL,  'LOCAL  (data.db - 1.6MB)')
inspect(REMOTE, 'REMOTE (data.db.remote - 952KB)')
