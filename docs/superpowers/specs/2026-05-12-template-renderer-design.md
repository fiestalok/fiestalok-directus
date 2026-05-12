# Template Renderer — Design Spec
*Date : 2026-05-12*

## Contexte

Le flow Directus actuel génère des PDFs en construisant le HTML inline dans un script `Run Script`. Le template et la logique de rendu sont couplés, ce qui rend la maintenance difficile.

Objectif : extraire le rendu HTML dans un service dédié (`template-renderer`), sécurisé, pour que Directus n'ait plus qu'à envoyer des données structurées.

---

## Architecture

```
Directus Flow
    │
    ├─ 1. POST http://template-renderer:3001/render    (X-API-Key: secret)
    │       body: { templateId: "devis", variables: {...} }
    │       ← { url: "http://template-renderer:3001/render/<uuid>" }
    │
    ├─ 2. POST http://gotenberg:3000/forms/chromium/convert/url
    │       body: { url: "http://template-renderer:3001/render/<uuid>" }
    │       ← PDF bytes
    │
    ├─ 3. Upload PDF → Directus Files
    └─ 4. Envoi email avec PDF en pièce jointe (branche dev/send-mail)
```

Le service `template-renderer` n'expose aucun port vers l'hôte — il est uniquement accessible depuis le réseau Docker interne.

---

## Service template-renderer

### Structure

```
template-renderer/
├── src/
│   └── index.js          ← Serveur Express
├── templates/
│   └── devis.html        ← Template Handlebars
├── package.json
└── Dockerfile
```

### Endpoints

**`POST /render`**
- Header requis : `X-API-Key: <RENDERER_API_KEY>`
- Body : `{ templateId: string, variables: object }`
- Comportement :
  1. Valide la clé API → `401` si absente/incorrecte
  2. Charge `templates/<templateId>.html`
  3. Compile avec Handlebars et les variables fournies
  4. Stocke le HTML rendu en mémoire avec un UUID et une expiration à `now + 5min`
  5. Retourne `{ url: "http://template-renderer:3001/render/<uuid>" }`

**`GET /render/:token`**
- Pas d'authentification (appelé par Gotenberg)
- Comportement :
  1. Cherche le token en mémoire → `404` si inexistant ou expiré
  2. Retourne le HTML avec `Content-Type: text/html`
  3. **Supprime immédiatement le token** (usage unique)

### Gestion des tokens

- Stockage en mémoire (Map JS) : `uuid → { html: string, expiresAt: number }`
- Expiration : 5 minutes après création
- Nettoyage : job `setInterval` toutes les 60 secondes pour supprimer les tokens expirés
- Aucune persistance — un redémarrage du service invalide tous les tokens en cours

### Template Handlebars — devis.html

Migré depuis `test-pdf/reservation.html`. Les constructions dynamiques (`articles_rows`, `notes_section`) sont déplacées dans le template :

```html
{{#each articles}}
  <tr><td>{{name}}</td><td>{{quantity}}</td><td>{{unit_price}} €</td></tr>
{{/each}}

{{#if notes}}
  <h2>Notes</h2><div class="info-block">{{notes}}</div>
{{/if}}
```

### Variables attendues pour le template `devis`

```json
{
  "templateId": "devis",
  "variables": {
    "id": "123",
    "client_name": "Jean Dupont",
    "client_email": "jean@example.com",
    "client_phone": "0612345678",
    "date_start": "01/06/2025",
    "date_end": "05/06/2025",
    "articles": [
      { "name": "Sono", "quantity": 1, "unit_price": 150 }
    ],
    "total_price": "310",
    "notes": "Livraison à 14h"
  }
}
```

---

## Docker Compose

Ajout du service `template-renderer` sans exposition de port :

```yaml
template-renderer:
  build: ./template-renderer
  environment:
    - RENDERER_API_KEY=${RENDERER_API_KEY}
  volumes:
    - ./template-renderer/templates:/app/templates
  restart: unless-stopped
  # Pas de ports: → inaccessible depuis l'extérieur
```

Variable à ajouter dans `.env` :
```
RENDERER_API_KEY=<chaîne aléatoire 32 chars>
```

---

## Flow Directus mis à jour

Le script `Run Script` du flow est simplifié :
1. Formate les données de la réservation (dates, articles, client)
2. POST vers `template-renderer:3001/render` avec `X-API-Key` et les variables → reçoit l'URL du token
3. POST vers `gotenberg:3000/forms/chromium/convert/url` avec l'URL → reçoit les bytes PDF
4. Upload le PDF dans Directus Files via `POST /files`
5. Retourne les infos du fichier pour les opérations suivantes (email)

---

## Sécurité

| Vecteur | Protection |
|---|---|
| Appel externe à `/render` (POST) | API key requise, service non exposé |
| Interception de l'URL du token | Token usage unique + expiration 5 min |
| Accès direct au service depuis internet | Aucun port exposé dans docker-compose |
| Gotenberg exposé sur internet | Port 3000 à retirer en prod |

---

## Ce qui est hors scope

- Persistance des tokens (redémarrage = tokens perdus, acceptable car flux synchrone)
- Authentification pour `GET /render/:token` (Gotenberg n'envoie pas de headers custom)
- Plusieurs types de documents simultanés (prévu pour plus tard, architecture prête)
