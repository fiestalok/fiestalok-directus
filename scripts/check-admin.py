import sqlite3

db = sqlite3.connect("database/data.db")
db.row_factory = sqlite3.Row
cur = db.cursor()

# Voir les colonnes de directus_roles
cur.execute("PRAGMA table_info(directus_roles)")
print("Colonnes directus_roles:", [r["name"] for r in cur.fetchall()])

cur.execute("""
    SELECT u.email, u.role, r.name
    FROM directus_users u
    LEFT JOIN directus_roles r ON u.role = r.id
    WHERE u.email = 'contact@fiestalok.fr'
""")
row = cur.fetchone()
if row:
    print("Email:", row["email"])
    print("Role ID:", row["role"])
    print("Role name:", row["name"])
db.close()
