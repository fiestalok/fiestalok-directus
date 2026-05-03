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
