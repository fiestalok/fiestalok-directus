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
