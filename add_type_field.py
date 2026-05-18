import sqlite3
import json

db_path = "database/data.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# 1. Ajout de la colonne physique
try:
    cursor.execute("ALTER TABLE articles ADD COLUMN type VARCHAR(255)")
    print("✓ Colonne 'type' ajoutée à la table articles")
except sqlite3.OperationalError as e:
    print(f"⚠ Colonne déjà existante ou erreur : {e}")

# 2. Ajout des métadonnées Directus
options = json.dumps({
    "choices": [
        {"text": "Principal", "value": "Principal"},
        {"text": "Secondaire", "value": "secondaire"}
    ]
})
display_options = json.dumps({
    "choices": [
        {"value": "Principal", "text": "Principal", "foreground": "var(--theme--primary)", "background": "var(--theme--primary-background)"},
        {"value": "secondaire", "text": "Secondaire", "foreground": "var(--theme--foreground)", "background": "var(--theme--background-normal)"}
    ],
    "showAsDot": False
})

try:
    cursor.execute("""
        INSERT INTO directus_fields (
            collection, field, special, interface, options, display, display_options,
            readonly, hidden, sort, width, translations, note, conditions, required, "group", validation, validation_message
        ) VALUES (?, ?, NULL, ?, ?, ?, ?, 0, 0, 17, 'full', NULL, NULL, NULL, 0, NULL, NULL, NULL)
    """, ('articles', 'type', 'select-dropdown', options, 'labels', display_options))
    print("✓ Métadonnées Directus insérées")
except sqlite3.IntegrityError as e:
    print(f"⚠ Champ déjà existant ou erreur : {e}")

conn.commit()
conn.close()
print("✓ Terminé — redémarre le container Directus")
