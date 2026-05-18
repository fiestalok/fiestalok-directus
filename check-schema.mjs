import Database from 'better-sqlite3'
const local  = new Database('./database/data.db',        { readonly: true })
const remote = new Database('./database/data.db.remote', { readonly: true })
for (const t of ['clients', 'reservations', 'reservations_articles']) {
  const lc = local.prepare(`PRAGMA table_info("${t}")`).all().map(c => c.name)
  const rc = remote.prepare(`PRAGMA table_info("${t}")`).all().map(c => c.name)
  const onlyLocal  = lc.filter(c => !rc.includes(c))
  const onlyRemote = rc.filter(c => !lc.includes(c))
  console.log(`\n${t}:`)
  console.log(`  local cols  : ${lc.join(', ')}`)
  console.log(`  remote cols : ${rc.join(', ')}`)
  if (onlyLocal.length)  console.log(`  ⬅ only local  : ${onlyLocal.join(', ')}`)
  if (onlyRemote.length) console.log(`  ➡ only remote : ${onlyRemote.join(', ')}`)
}
local.close()
remote.close()
