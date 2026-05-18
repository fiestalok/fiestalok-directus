/**
 * merge-db.mjs — Merge sélectif remote → local
 *
 * Règles :
 *  - clients            : INSERT remote si id absent en local, mapper type→typeClient ; skip conflits (local prioritaire)
 *  - reservations       : INSERT remote si id absent en local ; skip conflits (local prioritaire)
 *  - reservations_articles : INSERT toutes les lignes remote absentes en local
 *  - articles           : ignoré (schémas incompatibles)
 *
 * Usage : node merge-db.mjs   (Directus doit être arrêté)
 */

import Database from 'better-sqlite3'
import { copyFileSync } from 'fs'

const LOCAL_PATH  = './database/data.db'
const REMOTE_PATH = './database/data.db.remote'
const BACKUP_PATH = `./database/data.db.backup-${new Date().toISOString().replace(/[:.]/g,'-')}`

// ── Backup ───────────────────────────────────────────────────────────────────
console.log(`\n💾  Backup → ${BACKUP_PATH}`)
copyFileSync(LOCAL_PATH, BACKUP_PATH)
console.log('✅  Backup OK\n')

const local  = new Database(LOCAL_PATH)
const remote = new Database(REMOTE_PATH, { readonly: true })

// ── 1. clients ───────────────────────────────────────────────────────────────
console.log('👥  clients')
const localClientIds  = new Set(local.prepare('SELECT id FROM clients').all().map(r => r.id))
const remoteClients   = remote.prepare('SELECT * FROM clients').all()

const insertClient = local.prepare(`
  INSERT INTO clients (id, date_created, first_name, last_name, company_name, email, phone, address, city, zip_code, typeClient)
  VALUES (@id, @date_created, @first_name, @last_name, @company_name, @email, @phone, @address, @city, @zip_code, @typeClient)
`)

let clientsInserted = 0
let clientsSkipped  = 0
const insertClientsMany = local.transaction(() => {
  for (const r of remoteClients) {
    if (localClientIds.has(r.id)) { clientsSkipped++; continue }
    insertClient.run({ ...r, typeClient: r.type ?? null })
    clientsInserted++
  }
})
insertClientsMany()
console.log(`  ✅  ${clientsInserted} insérés, ${clientsSkipped} ignorés (conflits → local conservé)\n`)

// ── 2. reservations ──────────────────────────────────────────────────────────
console.log('📅  reservations')
const localResaIds  = new Set(local.prepare('SELECT id FROM reservations').all().map(r => r.id))
const remoteResas   = remote.prepare('SELECT * FROM reservations').all()

const insertResa = local.prepare(`
  INSERT INTO reservations (id, date_created, date_start, date_end, status, delivery, delivery_address, delivery_fee, total_price, notes, tracking_token, cf_token, client)
  VALUES (@id, @date_created, @date_start, @date_end, @status, @delivery, @delivery_address, @delivery_fee, @total_price, @notes, @tracking_token, @cf_token, @client)
`)

let resasInserted = 0
let resasSkipped  = 0
const insertResasMany = local.transaction(() => {
  for (const r of remoteResas) {
    if (localResaIds.has(r.id)) { resasSkipped++; continue }
    insertResa.run(r)
    resasInserted++
  }
})
insertResasMany()
console.log(`  ✅  ${resasInserted} insérées, ${resasSkipped} ignorées (conflits → local conservé)\n`)

// ── 3. reservations_articles ─────────────────────────────────────────────────
console.log('🔗  reservations_articles')
local.pragma('foreign_keys = OFF')
const localRaIds  = new Set(local.prepare('SELECT id FROM reservations_articles').all().map(r => r.id))
const remoteRas   = remote.prepare('SELECT * FROM reservations_articles').all()

const insertRa = local.prepare(`
  INSERT INTO reservations_articles (id, reservations_id, articles_id, quantity, unit_price)
  VALUES (@id, @reservations_id, @articles_id, @quantity, @unit_price)
`)

let rasInserted = 0
let rasSkipped  = 0
const insertRasMany = local.transaction(() => {
  for (const r of remoteRas) {
    if (localRaIds.has(r.id)) { rasSkipped++; continue }
    insertRa.run(r)
    rasInserted++
  }
})
insertRasMany()
local.pragma('foreign_keys = ON')
console.log(`  ✅  ${rasInserted} insérées, ${rasSkipped} ignorées\n`)

// ── Résumé ───────────────────────────────────────────────────────────────────
local.close()
remote.close()

console.log('─'.repeat(50))
console.log('🎉  Merge terminé !')
console.log(`   clients              : +${clientsInserted}`)
console.log(`   reservations         : +${resasInserted}`)
console.log(`   reservations_articles: +${rasInserted}`)
console.log(`\n   Backup conservé : ${BACKUP_PATH}\n`)
