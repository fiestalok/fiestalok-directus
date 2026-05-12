# Generate PDF Endpoint — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un endpoint `POST /generate-pdf` au service `template-renderer` qui orchestre la génération complète du PDF (rendu HTML → Gotenberg → upload Directus), afin que le flow Directus n'utilise plus "Run Script" mais une simple opération "Webhook".

**Architecture:** Le `template-renderer` devient le seul responsable de la chaîne de génération. Directus envoie les données brutes de la réservation via un webhook, le service rend le template Handlebars, appelle Gotenberg via `http` natif Node.js, upload le PDF dans Directus Files, et retourne le `file_id`. Les URLs des services externes sont configurées via variables d'environnement.

**Tech Stack:** Node.js 20, Express 4, Handlebars 4, `http` (built-in Node.js), Jest 29 + Supertest 6

---

## File Map

| Fichier | Action | Rôle |
|---|---|---|
| `template-renderer/src/index.js` | Modifier | Ajouter `httpPost`, `buildMultipart`, nouvelles env vars, endpoint `/generate-pdf` |
| `template-renderer/src/index.test.js` | Modifier | Ajouter tests pour `/generate-pdf` (auth + validation) |
| `docker-compose.yml` | Modifier | Ajouter `GOTENBERG_URL`, `DIRECTUS_URL`, `DIRECTUS_TOKEN` au service template-renderer |
| `docker-compose.prod.yml` | Modifier | Idem |
| `.env` | Modifier | Ajouter `DIRECTUS_TOKEN` (token statique Directus) |
| `test-pdf/flow-run-script.js` | Supprimer | Plus nécessaire — logique déplacée dans le service |

---

## Task 1 : Ajouter les tests pour `/generate-pdf` (TDD — ils doivent échouer)

**Files:**
- Modify: `template-renderer/src/index.test.js`

- [ ] **Step 1 : Ajouter les tests à la fin de `template-renderer/src/index.test.js`**

Ajoute ce bloc après le dernier `describe` existant :

```javascript
describe('POST /generate-pdf', () => {
  test('retourne 401 sans header X-API-Key', async () => {
    const res = await request(app).post('/generate-pdf').send({ reservation: {} });
    expect(res.status).toBe(401);
  });

  test('retourne 401 avec une clé incorrecte', async () => {
    const res = await request(app)
      .post('/generate-pdf')
      .set('X-API-Key', 'mauvaise-cle')
      .send({ reservation: {} });
    expect(res.status).toBe(401);
  });

  test('retourne 400 quand reservation est absent', async () => {
    const res = await request(app)
      .post('/generate-pdf')
      .set('X-API-Key', VALID_KEY)
      .send({});
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2 : Vérifier que les nouveaux tests échouent**

```bash
cd /c/Users/thoma/Documents/Claude/fiestalok-directus/template-renderer && npm test 2>&1 | tail -20
```

Résultat attendu : les 3 nouveaux tests échouent avec `404` ou erreur (l'endpoint n'existe pas encore), les 10 tests existants passent toujours.

---

## Task 2 : Implémenter l'endpoint `/generate-pdf`

**Files:**
- Modify: `template-renderer/src/index.js`

- [ ] **Step 1 : Réécrire `template-renderer/src/index.js` avec les helpers et le nouvel endpoint**

Contenu complet du fichier :

```javascript
const express = require('express');
const Handlebars = require('handlebars');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const http = require('http');

const app = express();
app.use(express.json());

const API_KEY = process.env.RENDERER_API_KEY;
const TEMPLATES_DIR = process.env.TEMPLATES_DIR || path.join(__dirname, '..', 'templates');
const TOKEN_TTL_MS = 5 * 60 * 1000;
const PORT = process.env.PORT || 3001;
const SERVICE_URL = process.env.SERVICE_URL || `http://template-renderer:${PORT}`;
const GOTENBERG_URL = process.env.GOTENBERG_URL || 'http://gotenberg:3000';
const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://directus:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

const tokens = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of tokens) {
    if (entry.expiresAt < now) tokens.delete(id);
  }
}, 60_000);

function httpPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    const { hostname, port, pathname } = new URL(url);
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const req = http.request(
      {
        hostname,
        port: port || 80,
        path: pathname,
        method: 'POST',
        headers: { ...headers, 'Content-Length': buf.length },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            statusText: res.statusMessage,
            arrayBuffer: () => Promise.resolve(buffer),
            json: () => Promise.resolve(JSON.parse(buffer.toString('utf-8'))),
          });
        });
      }
    );
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

function buildMultipart(boundary, parts) {
  const chunks = [];
  for (const part of parts) {
    let header = `--${boundary}\r\n`;
    header += part.filename
      ? `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\nContent-Type: ${part.contentType}\r\n`
      : `Content-Disposition: form-data; name="${part.name}"\r\n`;
    header += '\r\n';
    chunks.push(Buffer.from(header));
    chunks.push(Buffer.isBuffer(part.value) ? part.value : Buffer.from(String(part.value)));
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

app.post('/render', (req, res) => {
  if (req.headers['x-api-key'] !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { templateId, variables } = req.body;
  if (!templateId || !variables) {
    return res.status(400).json({ error: 'templateId and variables are required' });
  }

  const resolvedTemplatesDir = path.resolve(TEMPLATES_DIR);
  const templatePath = path.resolve(TEMPLATES_DIR, `${templateId}.html`);
  if (!templatePath.startsWith(resolvedTemplatesDir + path.sep)) {
    return res.status(400).json({ error: 'Invalid templateId' });
  }
  if (!fs.existsSync(templatePath)) {
    return res.status(404).json({ error: `Template "${templateId}" not found` });
  }

  let html;
  try {
    const source = fs.readFileSync(templatePath, 'utf-8');
    html = Handlebars.compile(source)(variables);
  } catch (err) {
    return res.status(500).json({ error: 'Template rendering failed' });
  }

  const id = uuidv4();
  tokens.set(id, { html, expiresAt: Date.now() + TOKEN_TTL_MS });

  return res.json({ url: `${SERVICE_URL}/render/${id}` });
});

app.get('/render/:token', (req, res) => {
  const entry = tokens.get(req.params.token);
  if (!entry || entry.expiresAt < Date.now()) {
    return res.status(404).send('Not found');
  }

  tokens.delete(req.params.token);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(entry.html);
});

app.post('/generate-pdf', async (req, res) => {
  if (req.headers['x-api-key'] !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { reservation } = req.body;
  if (!reservation) {
    return res.status(400).json({ error: 'reservation is required' });
  }

  const client = reservation.client;
  const formatDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '');

  const resolvedTemplatesDir = path.resolve(TEMPLATES_DIR);
  const templatePath = path.resolve(TEMPLATES_DIR, 'devis.html');
  if (!templatePath.startsWith(resolvedTemplatesDir + path.sep)) {
    return res.status(500).json({ error: 'Template path error' });
  }
  if (!fs.existsSync(templatePath)) {
    return res.status(500).json({ error: 'Template devis not found' });
  }

  let html;
  try {
    const source = fs.readFileSync(templatePath, 'utf-8');
    html = Handlebars.compile(source)({
      id: reservation.id,
      client_name: `${client.first_name} ${client.last_name}`,
      client_email: client.email,
      client_phone: client.phone,
      date_start: formatDate(reservation.date_start),
      date_end: formatDate(reservation.date_end),
      articles: (reservation.articles || []).map((a) => ({
        name: a.articles_id?.name || '-',
        quantity: a.quantity,
        unit_price: a.unit_price,
      })),
      total_price: reservation.total_price,
      notes: reservation.notes || '',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Template rendering failed' });
  }

  const pdfBoundary = 'boundary' + Date.now();
  const pdfMultipart = buildMultipart(pdfBoundary, [
    { name: 'files', filename: 'index.html', contentType: 'text/html', value: Buffer.from(html) },
  ]);

  let pdfBytes;
  try {
    const pdfRes = await httpPost(
      `${GOTENBERG_URL}/forms/chromium/convert/html`,
      { 'Content-Type': `multipart/form-data; boundary=${pdfBoundary}` },
      pdfMultipart
    );
    if (!pdfRes.ok) throw new Error(pdfRes.statusText);
    pdfBytes = await pdfRes.arrayBuffer();
  } catch (err) {
    return res.status(502).json({ error: `Gotenberg failed: ${err.message}` });
  }

  const uploadBoundary = 'boundary' + (Date.now() + 1);
  const uploadMultipart = buildMultipart(uploadBoundary, [
    { name: 'title', value: `Devis Réservation #${reservation.id}` },
    {
      name: 'file',
      filename: `devis-${reservation.id}.pdf`,
      contentType: 'application/pdf',
      value: Buffer.from(pdfBytes),
    },
  ]);

  let fileData;
  try {
    const uploadRes = await httpPost(
      `${DIRECTUS_URL}/files`,
      {
        Authorization: `Bearer ${DIRECTUS_TOKEN}`,
        'Content-Type': `multipart/form-data; boundary=${uploadBoundary}`,
      },
      uploadMultipart
    );
    if (!uploadRes.ok) throw new Error(uploadRes.statusText);
    fileData = await uploadRes.json();
  } catch (err) {
    return res.status(502).json({ error: `Directus upload failed: ${err.message}` });
  }

  return res.json({ file_id: fileData.data.id });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`template-renderer listening on port ${PORT}`));
}

module.exports = app;
```

- [ ] **Step 2 : Lancer tous les tests et vérifier que les 13 passent**

```bash
cd /c/Users/thoma/Documents/Claude/fiestalok-directus/template-renderer && npm test 2>&1
```

Résultat attendu :
```
PASS src/index.test.js
  POST /render
    ✓ retourne 401 sans header X-API-Key
    ✓ retourne 401 avec une clé incorrecte
    ✓ retourne 400 quand templateId est absent
    ✓ retourne 400 quand variables est absent
    ✓ retourne 404 pour un template inexistant
    ✓ retourne une URL avec un UUID valide pour une requête correcte
  GET /render/:token
    ✓ retourne 404 pour un token inconnu
    ✓ retourne le HTML pour un token valide
    ✓ le token est à usage unique — le 2e appel retourne 404
    ✓ le HTML rendu contient les variables interpolées
  POST /generate-pdf
    ✓ retourne 401 sans header X-API-Key
    ✓ retourne 401 avec une clé incorrecte
    ✓ retourne 400 quand reservation est absent

Tests: 13 passed, 13 total
```

- [ ] **Step 3 : Commit**

```bash
git add template-renderer/src/index.js template-renderer/src/index.test.js
git commit -m "feat: add /generate-pdf endpoint with full orchestration"
```

---

## Task 3 : Mettre à jour docker-compose et .env

**Files:**
- Modify: `docker-compose.yml`
- Modify: `docker-compose.prod.yml`
- Modify: `.env`

**Prérequis — créer un token statique dans Directus :**

Avant de modifier les fichiers, tu dois créer un token statique dans Directus :
1. Va dans **http://localhost:8055** → Paramètres → Accès (ou "Access Tokens")
2. Crée un token pour un utilisateur admin (ou un utilisateur avec accès en écriture aux fichiers)
3. Copie le token généré — tu en auras besoin pour `DIRECTUS_TOKEN`

- [ ] **Step 1 : Ajouter `DIRECTUS_TOKEN` dans `.env`**

Ajoute cette ligne dans `.env` (avec la valeur du token créé dans Directus) :
```
DIRECTUS_TOKEN=<colle-ici-le-token-directus>
```

- [ ] **Step 2 : Mettre à jour `docker-compose.yml`**

Remplace la section `template-renderer` par :

```yaml
  template-renderer:
    build: ./template-renderer
    environment:
      - RENDERER_API_KEY=${RENDERER_API_KEY}
      - SERVICE_URL=http://template-renderer:3001
      - GOTENBERG_URL=http://gotenberg:3000
      - DIRECTUS_URL=http://directus:8055
      - DIRECTUS_TOKEN=${DIRECTUS_TOKEN}
    volumes:
      - ./template-renderer/templates:/app/templates
    restart: unless-stopped
```

- [ ] **Step 3 : Mettre à jour `docker-compose.prod.yml`**

Remplace la section `template-renderer` par :

```yaml
  template-renderer:
    build: ./template-renderer
    environment:
      - RENDERER_API_KEY=${RENDERER_API_KEY}
      - SERVICE_URL=http://template-renderer:3001
      - GOTENBERG_URL=http://gotenberg:3000
      - DIRECTUS_URL=http://directus:8055
      - DIRECTUS_TOKEN=${DIRECTUS_TOKEN}
    volumes:
      - ./template-renderer/templates:/app/templates
    restart: unless-stopped
```

- [ ] **Step 4 : Commit (sans .env)**

`.env` est dans `.gitignore` — ne pas le commiter.

```bash
git add docker-compose.yml docker-compose.prod.yml
git commit -m "feat: add GOTENBERG_URL, DIRECTUS_URL, DIRECTUS_TOKEN env vars to template-renderer"
```

---

## Task 4 : Supprimer le flow script obsolète

**Files:**
- Delete: `test-pdf/flow-run-script.js`

- [ ] **Step 1 : Supprimer le fichier**

```bash
git rm test-pdf/flow-run-script.js
git commit -m "chore: remove flow-run-script.js (replaced by /generate-pdf endpoint)"
```

---

## Task 5 : Configurer le flow Directus (manuel — dans l'UI)

Cette tâche se fait dans l'interface admin Directus. Voici les étapes exactes.

- [ ] **Step 1 : Démarrer les services**

```bash
docker compose up -d --build
```

Le `--build` est nécessaire pour reconstruire l'image avec les changements de `index.js`.

Vérifier que les 3 services sont `Up` :
```bash
docker compose ps
```

- [ ] **Step 2 : Ouvrir Directus et aller dans les Flows**

Va sur **http://localhost:8055** → Paramètres (icône engrenage) → **Flows**.

- [ ] **Step 3 : Créer ou modifier le flow de génération de PDF**

Si un flow existe déjà : l'ouvrir et modifier l'opération "Run Script".
Si aucun flow n'existe : créer un nouveau flow avec le déclencheur "Manual" sur la collection `reservations`.

**Structure du flow :**

```
[Déclencheur] Manual — collection: reservations
       ↓
[Opération 1] Read Data
  - Collection: reservations
  - IDs: {{ $trigger.body.keys[0] }}
  - Query: { "fields": ["*", "client.*", "articles.*", "articles.articles_id.*"] }
       ↓
[Opération 2] Webhook / Request URL
  - Méthode: POST
  - URL: http://template-renderer:3001/generate-pdf
  - Headers: { "Content-Type": "application/json", "X-API-Key": "<valeur de RENDERER_API_KEY depuis .env>" }
  - Body: { "reservation": {{ $last }} }
```

- [ ] **Step 4 : Tester le flow**

1. Va dans la collection **Reservations**
2. Ouvre une réservation existante
3. Clique sur le bouton du flow (en haut à droite de l'item)
4. Vérifie dans **Files** (menu principal) que le PDF `devis-<id>.pdf` est apparu
5. Télécharge et ouvre le PDF pour vérifier le contenu
