import sqlite3

db = sqlite3.connect("database/data.db")
db.row_factory = sqlite3.Row
cur = db.cursor()

cur.execute("SELECT field, interface, special, hidden FROM directus_fields WHERE collection = 'reservations' ORDER BY field")
fields = cur.fetchall()
print(f"Champs reservations ({len(fields)}) :")
for f in fields:
    print(f"  {f['field']} | interface={f['interface']} | special={f['special']} | hidden={f['hidden']}")

db.close()
