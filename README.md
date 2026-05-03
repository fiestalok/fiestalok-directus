# Fiestalo'K — Backend Directus

Backend headless CMS du site vitrine Fiestalo'K. Fonctionne avec le projet front `vitrine`.

## Prérequis

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installé et lancé
- [Node.js 18+](https://nodejs.org/) (pour le front)
- Un compte [Cloudflare](https://cloudflare.com/) pour Turnstile (protection anti-bot)

---

## 1. Lancer le backend

```bash
docker compose up -d
```

Directus est accessible sur **http://localhost:8055**

**Identifiants admin par défaut :**
| Champ | Valeur |
|-------|--------|
| Email | `contact@fiestalok.fr` |
| Mot de passe | `fiestalok2sxb!` |

> ⚠️ Change ces identifiants en production via les variables `ADMIN_EMAIL` et `ADMIN_PASSWORD` dans `docker-compose.yml`.

---

## 2. Configurer le Data Model

Après le premier démarrage, quelques champs doivent être ajoutés manuellement dans **Settings → Data Model**.

### Collection `reservations_articles`

| Nom | Type |
|-----|------|
| `quantity` | Integer |
| `unit_price` | Decimal |

### Collection `reservations`

| Nom | Type | Collection liée |
|-----|------|-----------------|
| `client` | Many to One | `clients` |

---

## 3. Configurer les permissions publiques

Dans **Settings → Access Control → Public**, activer les permissions suivantes :

| Collection | Read | Create |
|------------|------|--------|
| `articles` | ✓ | |
| `categories` | ✓ | |
| `reservations` | ✓ | ✓ |
| `reservations_articles` | ✓ | ✓ |
| `clients` | | ✓ |

---

## 4. Configurer le Flow anti-bot (Turnstile)

Ce Flow vérifie que chaque demande de devis provient d'un humain via Cloudflare Turnstile.

### Créer le Flow

**Settings → Flows → + New Flow**

- Nom : `Verify Turnstile`
- Trigger : **Event Hook**
- When : **Filter (Before Event)**
- Scope : `items.create`
- Collections : `reservations`

### Opération 1 — Appel Cloudflare

Ajouter une opération **Request URL** :

| Champ | Valeur |
|-------|--------|
| Method | `POST` |
| URL | `https://challenges.cloudflare.com/turnstile/v0/siteverify` |
| Header | `Content-Type: application/x-www-form-urlencoded` |
| Body (Raw) | `secret=TA_SECRET_KEY&response={{$trigger.payload.cf_token}}` |

> Remplace `TA_SECRET_KEY` par ta **Secret Key** Cloudflare Turnstile.

### Opération 2 — Vérification du résultat

Connecter au **resolve ✓** de l'opération précédente, ajouter un **Run Script** :

```js
module.exports = async function(data) {
  const response = data['$last'];
  if (!response || !response.data || response.data.success !== true) {
    throw new Error('Vérification anti-bot échouée');
  }
  return data;
};
```

> ⚠️ Le Run Script doit être connecté au resolve du **Request URL**, pas directement au trigger — sinon `$last` contient le payload du trigger au lieu de la réponse Cloudflare.

> Les Run Scripts Directus tournent dans un sandbox sans `fetch` ni `require`. Utiliser uniquement `data['$last']` pour lire la réponse de l'opération précédente.

---

## 5. Configurer le front

Dans le projet `vitrine`, créer le fichier `.env` :

```env
VITE_DIRECTUS_URL=http://localhost:8055
VITE_TURNSTILE_SITE_KEY=TA_SITE_KEY_CLOUDFLARE
```

Et `.env.production` :

```env
VITE_DIRECTUS_URL=https://directus.fiestalok.fr
VITE_TURNSTILE_SITE_KEY=TA_SITE_KEY_CLOUDFLARE
```

Puis lancer le front :

```bash
cd ../vitrine
npm install
npm run dev
# → http://localhost:5174
```

---

## 6. Cloudflare Turnstile — domaines autorisés

Dans le dashboard Cloudflare → **Turnstile** → ton site → **Domains**, ajouter :

- `localhost` (développement)
- `fiestalok.fr` (production)

**Clés de test** (développement sans challenge visible) :

| | Valeur |
|-|--------|
| Site key | `1x00000000000000000000AA` |
| Secret key | `1x0000000000000000000000000000000AA` |

---

## Structure du projet

```
fiestalok-directus/
├── database/
│   └── data.db          # Base SQLite (schema + données)
├── uploads/             # Fichiers uploadés via l'admin
├── extensions/          # Extensions Directus custom
└── docker-compose.yml
```

La base `data.db` contient l'intégralité du schema et des données — elle suffit à restaurer un environnement complet.

---

## Commandes utiles

```bash
docker compose up -d      # Démarrer
docker compose down       # Arrêter
docker compose logs -f    # Voir les logs en temps réel
```
