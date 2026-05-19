#!/bin/sh
set -e

DATE=$(date +%Y-%m-%d_%H-%M)
DUMP_FILE="/tmp/backup_${DATE}.sql.gz"

echo "[$(date)] Début du backup..."

PGPASSWORD="$DB_PASSWORD" pg_dump \
  -h "$DB_HOST" \
  -U "$DB_USER" \
  "$DB_DATABASE" \
  | gzip > "$DUMP_FILE"

echo "[$(date)] Dump créé, upload vers B2..."

rclone copy "$DUMP_FILE" "b2backup:${BACKUP_BUCKET}/postgres/"

rm "$DUMP_FILE"

echo "[$(date)] Upload terminé. Nettoyage des backups > 30 jours..."

rclone delete "b2backup:${BACKUP_BUCKET}/postgres/" --min-age 30d

echo "[$(date)] Backup terminé."
