import sqlite3
import json

db = sqlite3.connect("database/data.db")
db.row_factory = sqlite3.Row
cur = db.cursor()

# Colonnes réelles dans la db
cur.execute("PRAGMA table_info(directus_flows)")
flow_cols = {r["name"] for r in cur.fetchall()}
cur.execute("PRAGMA table_info(directus_operations)")
op_cols = {r["name"] for r in cur.fetchall()}

with open("flows.json") as f:
    flows = json.load(f).get("data", [])

with open("operations.json") as f:
    operations = json.load(f).get("data", [])

print(f"Flows ({len(flows)}) :")
for flow in flows:
    data = {k: v for k, v in flow.items() if k in flow_cols}
    # Sérialise les champs JSON
    for k, v in data.items():
        if isinstance(v, (dict, list)):
            data[k] = json.dumps(v)
    cols = ", ".join(data.keys())
    placeholders = ", ".join(["?" for _ in data])
    updates = ", ".join([f"{k} = excluded.{k}" for k in data if k != "id"])
    sql = f"INSERT INTO directus_flows ({cols}) VALUES ({placeholders}) ON CONFLICT(id) DO UPDATE SET {updates}"
    cur.execute(sql, list(data.values()))
    print(f"  OK : {flow.get('name', flow['id'])}")

print(f"\nOperations ({len(operations)}) :")
for op in operations:
    data = {k: v for k, v in op.items() if k in op_cols}
    for k, v in data.items():
        if isinstance(v, (dict, list)):
            data[k] = json.dumps(v)
    cols = ", ".join(data.keys())
    placeholders = ", ".join(["?" for _ in data])
    updates = ", ".join([f"{k} = excluded.{k}" for k in data if k != "id"])
    sql = f"INSERT INTO directus_operations ({cols}) VALUES ({placeholders}) ON CONFLICT(id) DO UPDATE SET {updates}"
    cur.execute(sql, list(data.values()))
    print(f"  OK : {op.get('name', op['id'])}")

db.commit()
db.close()
print("\nImport termine !")
