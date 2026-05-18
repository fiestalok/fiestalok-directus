import Database from 'better-sqlite3'

const local  = new Database('./database/data.db',        { readonly: true })
const remote = new Database('./database/data.db.remote', { readonly: true })

function diff(table, labelCol) {
  const localIds  = new Set(local.prepare(`SELECT id FROM "${table}"`).all().map(r => r.id))
  const remoteIds = new Set(remote.prepare(`SELECT id FROM "${table}"`).all().map(r => r.id))

  const onlyInRemote = [...remoteIds].filter(id => !localIds.has(id))
  const onlyInLocal  = [...localIds].filter(id => !remoteIds.has(id))
  const inBoth       = [...remoteIds].filter(id => localIds.has(id))

  console.log(`\n${'─'.repeat(60)}`)
  console.log(`📋  ${table}  (local: ${localIds.size} | remote: ${remoteIds.size})`)
  console.log(`${'─'.repeat(60)}`)

  if (onlyInRemote.length) {
    console.log(`\n  ✅ ${onlyInRemote.length} entrées UNIQUEMENT dans remote :`)
    const rows = remote.prepare(`SELECT * FROM "${table}" WHERE id IN (${onlyInRemote.map(() => '?').join(',')})`)
                       .all(...onlyInRemote)
    rows.forEach(r => {
      const preview = labelCol.map(c => r[c] ?? '').filter(Boolean).join(' | ')
      console.log(`    [${r.id}] ${preview}`)
    })
  }

  if (onlyInLocal.length) {
    console.log(`\n  🏠 ${onlyInLocal.length} entrées UNIQUEMENT en local :`)
    const rows = local.prepare(`SELECT * FROM "${table}" WHERE id IN (${onlyInLocal.map(() => '?').join(',')})`)
                      .all(...onlyInLocal)
    rows.forEach(r => {
      const preview = labelCol.map(c => r[c] ?? '').filter(Boolean).join(' | ')
      console.log(`    [${r.id}] ${preview}`)
    })
  }

  if (inBoth.length) {
    // Check for conflicting values in key columns
    const conflicts = []
    for (const id of inBoth) {
      const l = local.prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(id)
      const r = remote.prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(id)
      const diffs = Object.keys(r).filter(k => k !== 'id' && String(l[k]) !== String(r[k]))
      if (diffs.length) conflicts.push({ id, local: l, remote: r, diffs })
    }
    if (conflicts.length) {
      console.log(`\n  ⚠️  ${conflicts.length} entrées en conflit (même id, valeurs différentes) :`)
      conflicts.forEach(({ id, local: l, remote: r, diffs }) => {
        console.log(`    [${id}]`)
        diffs.forEach(k => console.log(`      ${k}: local="${l[k]}" | remote="${r[k]}"`))
      })
    } else {
      console.log(`\n  ✓  ${inBoth.size ?? inBoth.length} entrées communes identiques`)
    }
  }
}

diff('clients',              ['first_name', 'last_name', 'company_name', 'email'])
diff('reservations',         ['date_start', 'date_end', 'status'])
diff('reservations_articles',['reservations_id', 'articles_id'])
diff('articles',             ['reference', 'etat'])

local.close()
remote.close()
