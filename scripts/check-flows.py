import sqlite3, json

db = sqlite3.connect("database/data.db")
db.row_factory = sqlite3.Row
cur = db.cursor()

cur.execute("SELECT id, name, status, trigger FROM directus_flows")
flows = cur.fetchall()
print(f"Flows en base ({len(flows)}) :")
for f in flows:
    print(f"  {f['name']} | status={f['status']} | trigger={f['trigger']}")

cur.execute("SELECT id, name, flow FROM directus_operations")
ops = cur.fetchall()
print(f"\nOperations en base ({len(ops)}) :")
for o in ops:
    print(f"  {o['name']} | flow={o['flow']}")

db.close()
