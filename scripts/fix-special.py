import sqlite3, json

db = sqlite3.connect("database/data.db")
cur = db.cursor()

cur.execute("SELECT id, collection, field, special FROM directus_fields WHERE special IS NOT NULL AND special NOT LIKE '[%'")
rows = cur.fetchall()

print(f"Champs avec special mal formatte ({len(rows)}) :")
for row in rows:
    fid, collection, field, special = row
    fixed = json.dumps(special.split(","))
    print(f"  {collection}.{field} : '{special}' -> '{fixed}'")
    cur.execute("UPDATE directus_fields SET special = ? WHERE id = ?", (fixed, fid))

db.commit()
db.close()
print("Correction appliquee.")
