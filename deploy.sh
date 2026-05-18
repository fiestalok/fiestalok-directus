#!/bin/bash
set -e

echo "=== Deploy Fiestalok Backend ==="

# 1. Pull
echo ""
echo "[1/4] Git pull..."
git pull

# 2. Schema
echo ""
echo "[2/4] Application du schema..."
docker compose -f docker-compose.prod.yml cp snapshot.yaml directus:/directus/snapshot.yaml
docker compose -f docker-compose.prod.yml exec -T directus \
    node /directus/cli.js schema apply --yes /directus/snapshot.yaml

# 3. Flows + corrections SQLite
echo ""
echo "[3/4] Import des flows..."
docker compose -f docker-compose.prod.yml stop directus
python3 scripts/import-flows-sqlite.py

# 4. Correction des champs special mal formatés par le merge YAML
echo ""
echo "[4/4] Correction des champs special..."
python3 scripts/fix-special.py
docker compose -f docker-compose.prod.yml start directus

echo ""
echo "Deploy termine !"
