import json
import sys
import urllib.request
import urllib.error

def request(method, url, token, data=None):
    req = urllib.request.Request(url, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    if data is not None:
        req.data = json.dumps(data).encode()
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  [ERREUR {e.code}] {url} — {body}")
        return None

base_url = sys.argv[1].rstrip("/")
token = sys.argv[2]

with open("flows.json") as f:
    flows = json.load(f).get("data", [])

with open("operations.json") as f:
    operations = json.load(f).get("data", [])

# Flows existants sur la cible
existing_flows = {
    f["id"] for f in request("GET", f"{base_url}/flows?limit=-1", token).get("data", [])
}

READONLY_FIELDS = ("date_created", "user_created", "date_updated", "user_updated")

# Upsert flows
print(f"Flows ({len(flows)}) :")
for flow in flows:
    fid = flow["id"]
    name = flow.get("name", fid)
    if fid in existing_flows:
        payload = {k: v for k, v in flow.items() if k not in READONLY_FIELDS}
        request("PATCH", f"{base_url}/flows/{fid}", token, payload)
        print(f"  ~ mis a jour : {name}")
    else:
        payload = {k: v for k, v in flow.items() if k not in READONLY_FIELDS}
        result = request("POST", f"{base_url}/flows", token, payload)
        if result:
            print(f"  + cree : {name}")
        else:
            print(f"  [ECHEC] creation : {name}")

# Operations existantes sur la cible
existing_ops = {
    o["id"] for o in request("GET", f"{base_url}/operations?limit=-1", token).get("data", [])
}

# Upsert operations
# Les nouvelles operations sont creees sans resolve/reject pour eviter
# les erreurs de cle etrangere circulaire, puis patchees ensuite.
print(f"\nOperations ({len(operations)}) :")
new_op_ids = set()

for op in operations:
    oid = op["id"]
    name = op.get("name", oid)
    if oid in existing_ops:
        payload = {k: v for k, v in op.items() if k not in READONLY_FIELDS}
        request("PATCH", f"{base_url}/operations/{oid}", token, payload)
        print(f"  ~ mis a jour : {name}")
    else:
        stub = {k: v for k, v in op.items() if k not in ("resolve", "reject") + READONLY_FIELDS}
        result = request("POST", f"{base_url}/operations", token, stub)
        if result:
            new_op_ids.add(oid)
            print(f"  + cree : {name}")
        else:
            print(f"  [ECHEC] creation : {name}")

# Deuxieme passe : relier resolve/reject des nouvelles operations
links = [
    op for op in operations
    if op["id"] in new_op_ids and (op.get("resolve") or op.get("reject"))
]
if links:
    print(f"\nLiaisons resolve/reject ({len(links)}) :")
    for op in links:
        patch = {}
        if op.get("resolve"):
            patch["resolve"] = op["resolve"]
        if op.get("reject"):
            patch["reject"] = op["reject"]
        request("PATCH", f"{base_url}/operations/{op['id']}", token, patch)
        print(f"  ~ lie : {op.get('name', op['id'])}")

print("\nImport termine !")
