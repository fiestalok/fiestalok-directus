# Template Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Créer un service Node.js `template-renderer` qui rend les templates HTML Handlebars via un système de token à usage unique, et mettre à jour le flow Directus pour l'utiliser.

**Architecture:** Un service Express minimal reçoit les variables de Directus (authentifié par API key), rend le template Handlebars, et stocke le HTML en mémoire sous un UUID temporaire. Gotenberg récupère ce HTML via une URL single-use, puis génère le PDF. Le service n'expose aucun port vers l'hôte.

**Tech Stack:** Node.js 20, Express 4, Handlebars 4, uuid 9, Jest 29 + Supertest 6 (tests)

---

## File Map

| Fichier | Action | Rôle |
|---|---|---|
| `template-renderer/package.json` | Créer | Dépendances et scripts npm |
| `template-renderer/Dockerfile` | Créer | Image de production |
| `template-renderer/src/index.js` | Créer | Serveur Express (endpoints + logique tokens) |
| `template-renderer/src/index.test.js` | Créer | Tests Jest + Supertest |
| `template-renderer/templates/devis.html` | Créer | Template Handlebars migré depuis `test-pdf/reservation.html` |
| `docker-compose.yml` | Modifier | Ajouter le service `template-renderer` |
| `docker-compose.prod.yml` | Modifier | Idem pour la prod |
| `.env` | Modifier | Ajouter `RENDERER_API_KEY` |
| `test-pdf/flow-run-script.js` | Modifier | Réécrire pour utiliser le nouveau service |

---

## Task 1 : Initialiser le package template-renderer

**Files:**
- Create: `template-renderer/package.json`
- Create: `template-renderer/Dockerfile`
- Create: `template-renderer/.dockerignore`

- [ ] **Step 1 : Créer la structure de dossiers**

```
mkdir template-renderer
mkdir template-renderer/src
mkdir template-renderer/templates
```

- [ ] **Step 2 : Créer `template-renderer/package.json`**

```json
{
  "name": "template-renderer",
  "version": "1.0.0",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "test": "jest --forceExit"
  },
  "dependencies": {
    "express": "^4.18.2",
    "handlebars": "^4.7.8",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "supertest": "^6.3.4"
  }
}
```

- [ ] **Step 3 : Créer `template-renderer/Dockerfile`**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
EXPOSE 3001
CMD ["node", "src/index.js"]
```

- [ ] **Step 4 : Créer `template-renderer/.dockerignore`**

```
node_modules
src/*.test.js
```

- [ ] **Step 5 : Installer les dépendances**

Depuis le dossier `template-renderer/` :
```bash
npm install
```

Vérifie que `node_modules/` est créé et que `package-lock.json` apparaît.

- [ ] **Step 6 : Commit**

```bash
git add template-renderer/package.json template-renderer/package-lock.json template-renderer/Dockerfile template-renderer/.dockerignore
git commit -m "feat: scaffold template-renderer package"
```

---

## Task 2 : Créer le template Handlebars

**Files:**
- Create: `template-renderer/templates/devis.html`

- [ ] **Step 1 : Créer `template-renderer/templates/devis.html`**

Ce template est une migration de `test-pdf/reservation.html`. Les blocs dynamiques (`articles_rows`, `notes_section`) sont remplacés par des helpers Handlebars natifs.

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; color: #333; padding: 0 20px; }
    h1 { color: #e53935; border-bottom: 2px solid #e53935; padding-bottom: 10px; }
    h2 { color: #555; margin-top: 30px; }
    .info-block { background: #f9f9f9; border-left: 4px solid #e53935; padding: 12px 16px; margin: 10px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { background: #f0f0f0; padding: 10px; text-align: left; border: 1px solid #ddd; }
    td { padding: 10px; border: 1px solid #ddd; }
    .total { font-size: 1.2em; font-weight: bold; text-align: right; margin-top: 20px; padding: 10px; background: #f9f9f9; }
    .footer { margin-top: 50px; font-size: 0.8em; color: #999; text-align: center; border-top: 1px solid #eee; padding-top: 10px; }
  </style>
</head>
<body>
  <h1>Devis — Réservation #{{id}}</h1>

  <h2>Client</h2>
  <div class="info-block">
    <strong>{{client_name}}</strong><br>
    Email : {{client_email}}<br>
    Téléphone : {{client_phone}}
  </div>

  <h2>Dates</h2>
  <div class="info-block">
    Du <strong>{{date_start}}</strong> au <strong>{{date_end}}</strong>
  </div>

  <h2>Articles</h2>
  <table>
    <tr>
      <th>Article</th>
      <th>Quantité</th>
      <th>Prix unitaire</th>
    </tr>
    {{#each articles}}
    <tr>
      <td>{{name}}</td>
      <td>{{quantity}}</td>
      <td>{{unit_price}} €</td>
    </tr>
    {{/each}}
  </table>

  <div class="total">Total : {{total_price}} €</div>

  {{#if notes}}
  <h2>Notes</h2>
  <div class="info-block">{{notes}}</div>
  {{/if}}

  <div class="footer">FiestaLok — contact@fiestalok.fr — fiestalok.fr</div>
</body>
</html>
```

- [ ] **Step 2 : Commit**

```bash
git add template-renderer/templates/devis.html
git commit -m "feat: add devis Handlebars template"
```

---

## Task 3 : Écrire les tests (TDD — ils doivent échouer)

**Files:**
- Create: `template-renderer/src/index.test.js`

- [ ] **Step 1 : Créer `template-renderer/src/index.test.js`**

```javascript
const path = require('path');

process.env.RENDERER_API_KEY = 'test-api-key';
process.env.TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

const request = require('supertest');
const app = require('./index');

const VALID_KEY = 'test-api-key';
const VALID_BODY = {
  templateId: 'devis',
  variables: {
    id: '42',
    client_name: 'Jean Dupont',
    client_email: 'jean@example.com',
    client_phone: '0612345678',
    date_start: '01/06/2025',
    date_end: '05/06/2025',
    articles: [{ name: 'Sono', quantity: 1, unit_price: 150 }],
    total_price: '150',
    notes: '',
  },
};

describe('POST /render', () => {
  test('retourne 401 sans header X-API-Key', async () => {
    const res = await request(app).post('/render').send(VALID_BODY);
    expect(res.status).toBe(401);
  });

  test('retourne 401 avec une clé incorrecte', async () => {
    const res = await request(app)
      .post('/render')
      .set('X-API-Key', 'mauvaise-cle')
      .send(VALID_BODY);
    expect(res.status).toBe(401);
  });

  test('retourne 400 quand templateId est absent', async () => {
    const res = await request(app)
      .post('/render')
      .set('X-API-Key', VALID_KEY)
      .send({ variables: {} });
    expect(res.status).toBe(400);
  });

  test('retourne 400 quand variables est absent', async () => {
    const res = await request(app)
      .post('/render')
      .set('X-API-Key', VALID_KEY)
      .send({ templateId: 'devis' });
    expect(res.status).toBe(400);
  });

  test('retourne 404 pour un template inexistant', async () => {
    const res = await request(app)
      .post('/render')
      .set('X-API-Key', VALID_KEY)
      .send({ templateId: 'inexistant', variables: {} });
    expect(res.status).toBe(404);
  });

  test('retourne une URL avec un UUID valide pour une requête correcte', async () => {
    const res = await request(app)
      .post('/render')
      .set('X-API-Key', VALID_KEY)
      .send(VALID_BODY);
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/\/render\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

describe('GET /render/:token', () => {
  test('retourne 404 pour un token inconnu', async () => {
    const res = await request(app).get('/render/token-inconnu');
    expect(res.status).toBe(404);
  });

  test('retourne le HTML pour un token valide', async () => {
    const postRes = await request(app)
      .post('/render')
      .set('X-API-Key', VALID_KEY)
      .send(VALID_BODY);

    const token = postRes.body.url.split('/').pop();
    const getRes = await request(app).get(`/render/${token}`);

    expect(getRes.status).toBe(200);
    expect(getRes.headers['content-type']).toMatch(/text\/html/);
    expect(getRes.text).toContain('Jean Dupont');
    expect(getRes.text).toContain('Sono');
  });

  test('le token est à usage unique — le 2e appel retourne 404', async () => {
    const postRes = await request(app)
      .post('/render')
      .set('X-API-Key', VALID_KEY)
      .send(VALID_BODY);

    const token = postRes.body.url.split('/').pop();

    await request(app).get(`/render/${token}`);
    const secondRes = await request(app).get(`/render/${token}`);

    expect(secondRes.status).toBe(404);
  });

  test('le HTML rendu contient les variables interpolées', async () => {
    const postRes = await request(app)
      .post('/render')
      .set('X-API-Key', VALID_KEY)
      .send(VALID_BODY);

    const token = postRes.body.url.split('/').pop();
    const getRes = await request(app).get(`/render/${token}`);

    expect(getRes.text).toContain('Réservation #42');
    expect(getRes.text).toContain('jean@example.com');
    expect(getRes.text).toContain('150 €');
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent (index.js n'existe pas encore)**

Depuis `template-renderer/` :
```bash
npm test
```

Résultat attendu : erreur `Cannot find module './index'`

---

## Task 4 : Implémenter le serveur

**Files:**
- Create: `template-renderer/src/index.js`

- [ ] **Step 1 : Créer `template-renderer/src/index.js`**

```javascript
const express = require('express');
const Handlebars = require('handlebars');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const API_KEY = process.env.RENDERER_API_KEY;
const TEMPLATES_DIR = process.env.TEMPLATES_DIR || path.join(__dirname, '..', 'templates');
const TOKEN_TTL_MS = 5 * 60 * 1000;
const PORT = process.env.PORT || 3001;
const SERVICE_URL = process.env.SERVICE_URL || `http://template-renderer:${PORT}`;

const tokens = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of tokens) {
    if (entry.expiresAt < now) tokens.delete(id);
  }
}, 60_000);

app.post('/render', (req, res) => {
  if (req.headers['x-api-key'] !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { templateId, variables } = req.body;
  if (!templateId || !variables) {
    return res.status(400).json({ error: 'templateId and variables are required' });
  }

  const templatePath = path.join(TEMPLATES_DIR, `${templateId}.html`);
  if (!fs.existsSync(templatePath)) {
    return res.status(404).json({ error: `Template "${templateId}" not found` });
  }

  const source = fs.readFileSync(templatePath, 'utf-8');
  const html = Handlebars.compile(source)(variables);

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

if (require.main === module) {
  app.listen(PORT, () => console.log(`template-renderer listening on port ${PORT}`));
}

module.exports = app;
```

- [ ] **Step 2 : Lancer les tests et vérifier qu'ils passent**

```bash
npm test
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

Test Suites: 1 passed, 1 total
Tests:       10 passed, 10 total
```

- [ ] **Step 3 : Commit**

```bash
git add template-renderer/src/index.js template-renderer/src/index.test.js
git commit -m "feat: implement template-renderer Express server with single-use tokens"
```

---

## Task 5 : Mettre à jour docker-compose.yml et .env

**Files:**
- Modify: `docker-compose.yml`
- Modify: `docker-compose.prod.yml`
- Modify: `.env`

- [ ] **Step 1 : Ajouter la variable dans `.env`**

Génère une clé aléatoire (32 caractères hex) :
```bash
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

Ajoute la ligne dans `.env` (remplace `<VALEUR_GENEREE>` par le résultat) :
```
RENDERER_API_KEY=<VALEUR_GENEREE>
```

- [ ] **Step 2 : Mettre à jour `docker-compose.yml`**

Ajouter le service `template-renderer` après le service `gotenberg` :

```yaml
services:
  directus:
    image: directus/directus:latest
    env_file:
      - .env
    ports:
      - "8055:8055"
    environment:
      SECRET: "latronspem-fiestalok"
      DB_CLIENT: "sqlite3"
      DB_FILENAME: "/directus/database/data.db"
      ADMIN_EMAIL: "contact@fiestalok.fr"
      ADMIN_PASSWORD: "fiestalok2sxb!"
      CORS_ENABLED: "true"
      CORS_ORIGIN: "https://fiestalok.fr,http://localhost:5174"
      PUBLIC_URL: "https://back.fiestalok.fr"
    volumes:
      - ./uploads:/directus/uploads
      - ./extensions:/directus/extensions
      - ./database:/directus/database

  gotenberg:
    image: gotenberg/gotenberg:8
    restart: unless-stopped
    ports:
      - "3000:3000"

  template-renderer:
    build: ./template-renderer
    environment:
      - RENDERER_API_KEY=${RENDERER_API_KEY}
    volumes:
      - ./template-renderer/templates:/app/templates
    restart: unless-stopped
```

- [ ] **Step 3 : Mettre à jour `docker-compose.prod.yml`**

Ajouter le service `template-renderer` après `gotenberg` (même chose, sans le port Gotenberg) :

```yaml
services:
  caddy:
    image: caddy:latest
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - directus

  directus:
    image: directus/directus:latest
    restart: unless-stopped
    env_file:
      - .env
    environment:
      SECRET: "latronspem-fiestalok"
      DB_CLIENT: "sqlite3"
      DB_FILENAME: "/directus/database/data.db"
      ADMIN_EMAIL: "contact@fiestalok.fr"
      ADMIN_PASSWORD: "fiestalok2sxb!"
      CORS_ENABLED: "true"
      CORS_ORIGIN: "https://fiestalok.fr,http://localhost:5174"
      PUBLIC_URL: "https://back.fiestalok.fr"
    volumes:
      - ./uploads:/directus/uploads
      - ./extensions:/directus/extensions
      - ./database:/directus/database

  gotenberg:
    image: gotenberg/gotenberg:8
    restart: unless-stopped

  template-renderer:
    build: ./template-renderer
    environment:
      - RENDERER_API_KEY=${RENDERER_API_KEY}
    volumes:
      - ./template-renderer/templates:/app/templates
    restart: unless-stopped

volumes:
  caddy_data:
  caddy_config:
```

- [ ] **Step 4 : Vérifier que docker compose build fonctionne**

```bash
docker compose build template-renderer
```

Résultat attendu : `=> exporting to image` sans erreur.

- [ ] **Step 5 : Commit**

Si `.env` est dans `.gitignore` (recommandé), ne pas le commiter — il faut le configurer manuellement sur le serveur de prod.

```bash
git add docker-compose.yml docker-compose.prod.yml
git commit -m "feat: add template-renderer service to docker-compose"
```

---

## Task 6 : Réécrire le flow script Directus

**Files:**
- Modify: `test-pdf/flow-run-script.js`

- [ ] **Step 1 : Réécrire `test-pdf/flow-run-script.js`**

```javascript
module.exports = async function (data) {
  const reservation = data.$last;
  const client = reservation.client;
  const apiKey = process.env.RENDERER_API_KEY;
  const directusToken = process.env.DIRECTUS_TOKEN_SECRET;

  const formatDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '');

  // 1. Demande un token de rendu au template-renderer
  const renderResponse = await fetch('http://template-renderer:3001/render', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({
      templateId: 'devis',
      variables: {
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
      },
    }),
  });

  if (!renderResponse.ok) throw new Error(`template-renderer: ${renderResponse.statusText}`);
  const { url } = await renderResponse.json();

  // 2. Génère le PDF via Gotenberg (mode URL)
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

  const pdfBoundary = 'boundary' + Date.now();
  const pdfBody = buildMultipart(pdfBoundary, [{ name: 'url', value: url }]);

  const pdfResponse = await fetch('http://gotenberg:3000/forms/chromium/convert/url', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${pdfBoundary}` },
    body: pdfBody,
  });

  if (!pdfResponse.ok) throw new Error(`Gotenberg: ${pdfResponse.statusText}`);
  const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer());

  // 3. Upload dans Directus Files
  const uploadBoundary = 'boundary' + (Date.now() + 1);
  const uploadBody = buildMultipart(uploadBoundary, [
    { name: 'title', value: `Devis Réservation #${reservation.id}` },
    { name: 'file', filename: `devis-${reservation.id}.pdf`, contentType: 'application/pdf', value: pdfBytes },
  ]);

  const uploadResponse = await fetch('http://directus:8055/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${directusToken}`,
      'Content-Type': `multipart/form-data; boundary=${uploadBoundary}`,
    },
    body: uploadBody,
  });

  if (!uploadResponse.ok) throw new Error(`Upload: ${uploadResponse.statusText}`);
  return (await uploadResponse.json()).data;
};
```

- [ ] **Step 2 : Commit**

```bash
git add test-pdf/flow-run-script.js
git commit -m "feat: rewrite flow script to use template-renderer service"
```

---

## Task 7 : Test de bout en bout

- [ ] **Step 1 : Démarrer tous les services**

```bash
docker compose up -d
```

Vérifier que les 3 services sont `Up` :
```bash
docker compose ps
```

Résultat attendu :
```
NAME                 STATUS
...-directus-1       Up
...-gotenberg-1      Up
...-template-renderer-1  Up
```

- [ ] **Step 2 : Vérifier que le service est inaccessible depuis l'extérieur**

```bash
curl http://localhost:3001/render
```

Résultat attendu : `curl: (7) Failed to connect to localhost port 3001` (pas de port exposé).

- [ ] **Step 3 : Déclencher le flow Directus**

Dans l'admin Directus (http://localhost:8055), ouvrir une réservation et déclencher manuellement le flow de génération de PDF.

Vérifier dans Directus Files que le fichier `devis-<id>.pdf` apparaît.

- [ ] **Step 4 : Ouvrir le PDF**

Télécharger et ouvrir le PDF généré. Vérifier que les données de la réservation (client, articles, dates, total) sont correctement affichées.

- [ ] **Step 5 : Commit final**

```bash
git add .
git commit -m "feat: complete template-renderer integration"
```
