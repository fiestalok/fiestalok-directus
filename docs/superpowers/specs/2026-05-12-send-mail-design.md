# Send Mail — Design Spec
*Date : 2026-05-12*

## Contexte

Le flow Directus génère déjà un PDF (devis) et l'uploade dans Directus Files via `/generate-pdf`. L'étape suivante est d'envoyer ce PDF par email au client en pièce jointe, directement depuis le service `template-renderer`.

---

## Architecture

Aucun changement côté Directus — le flow continue d'appeler un seul webhook vers `/generate-pdf`. L'envoi email est ajouté comme étape finale dans ce même endpoint.

```
POST /generate-pdf
  1. Render HTML (Handlebars)
  2. Générer PDF via Gotenberg
  3. Upload PDF vers Directus Files
  4. Envoyer email via nodemailer    ← NOUVEAU
  5. Retourner { file_id }
```

Les bytes PDF sont déjà en mémoire après l'étape 2 — pas de second téléchargement nécessaire pour la pièce jointe.

---

## Librairie

**nodemailer** — librairie Node.js standard pour l'envoi d'emails via SMTP.

```
npm install nodemailer
```

---

## Configuration SMTP

Nouvelles variables d'environnement à ajouter dans `.env` et `docker-compose.yml` :

```env
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=contact@fiestalok.fr
SMTP_PASS=%*MSU5kaQ*DzU*
SMTP_FROM=FiestaloK <contact@fiestalok.fr>
```

Le transporter nodemailer est créé au démarrage du service (connexion SMTP réutilisée).

```javascript
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: true, // port 465 = SSL
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});
```

---

## Email envoyé

| Champ | Valeur |
|---|---|
### Email client

| Champ | Valeur |
|---|---|
| `from` | `SMTP_FROM` (ex: `FiestaloK <contact@fiestalok.fr>`) |
| `to` | `reservation.client.email` |
| `subject` | `Votre devis FiestaLok #<id>` |
| `text` | Court message de confirmation (voir ci-dessous) |
| `attachments` | `[{ filename: 'devis-<id>.pdf', content: pdfBytes }]` |

Corps du message (text) :

```
Bonjour <client_name>,

Veuillez trouver en pièce jointe votre devis FiestaLok #<id>.

Cordialement,
L'équipe FiestaLok
```

### Email admin (confirmation interne)

| Champ | Valeur |
|---|---|
| `from` | `SMTP_FROM` |
| `to` | `contact@fiestalok.fr` |
| `subject` | `Nouveau devis envoyé — #<id> (<client_name>)` |
| `text` | Récap de la réservation (voir ci-dessous) |
| `attachments` | `[{ filename: 'devis-<id>.pdf', content: pdfBytes }]` |

Corps du message admin (text) :

```
Un devis a été envoyé au client.

Réservation #<id>
Client : <client_name> (<client_email>, <client_phone>)
Période : <date_start> → <date_end>
Total : <total_price> €
```

Les deux emails sont envoyés dans le même bloc `try/catch` best-effort — si l'un échoue, l'autre est quand même tenté.

---

## Gestion des erreurs

L'envoi email est **best-effort** : si nodemailer échoue (SMTP indisponible, adresse invalide, etc.), on log l'erreur mais on retourne quand même `{ file_id }`. Le PDF est sauvegardé dans Directus Files quelle que soit l'issue de l'email.

```javascript
try {
  await transporter.sendMail({ ... });
} catch (err) {
  console.error('Email send failed:', err.message);
  // on continue — pas de throw
}

return res.json({ file_id: fileData.data.id });
```

---

## Modifications nécessaires

### `template-renderer/package.json`
- Ajouter `nodemailer` dans `dependencies`

### `template-renderer/src/index.js`
- `require('nodemailer')` et création du transporter
- Lire les 5 nouvelles env vars (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`)
- Dans `/generate-pdf` : ajouter l'appel `transporter.sendMail(...)` après l'upload Directus

### `docker-compose.yml` et `docker-compose.prod.yml`
- Ajouter les 5 variables SMTP dans le service `template-renderer`

### `.env`
- Ajouter les 5 variables SMTP (non commité)

---

## Tests

- Nouveau test unitaire : `POST /generate-pdf` avec nodemailer mocké — vérifie que `sendMail` est appelé deux fois (email client + email admin) avec les bons paramètres (to, subject, attachment filename)
- Test de régression : si `sendMail` throw, l'endpoint retourne quand même `{ file_id }` avec status 200

---

## Ce qui est hors scope

- Template HTML pour le corps de l'email (texte plain suffisant)
- Gestion des bounces / erreurs de livraison
- Retry automatique en cas d'échec SMTP
