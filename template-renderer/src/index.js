const express = require('express');
const Handlebars = require('handlebars');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const http = require('http');
const nodemailer = require('nodemailer');

const app = express();
app.use(express.json());

Handlebars.registerPartial(
  'signature',
  fs.readFileSync(path.join(__dirname, '..', 'templates', 'partials', 'signature.html'), 'utf-8')
);

const API_KEY = process.env.RENDERER_API_KEY;
const TEMPLATES_DIR = process.env.TEMPLATES_DIR || path.join(__dirname, '..', 'templates');
const TOKEN_TTL_MS = 5 * 60 * 1000;
const PORT = process.env.PORT || 3001;
const SERVICE_URL = process.env.SERVICE_URL || `http://template-renderer:${PORT}`;
const GOTENBERG_URL = process.env.GOTENBERG_URL;
const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM;
const ADMIN_EMAIL = 'contact@fiestalok.fr';

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

function createMailer(transport) {
  return {
    sendMail(options) {
      const redirectTo = process.env.MAIL_REDIRECT_TO;
      if (!redirectTo) return transport.sendMail(options);
      return transport.sendMail({
        ...options,
        to: redirectTo,
        subject: `TEST - ${options.subject}`,
      });
    },
  };
}

const mailer = createMailer(transporter);

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
  if (!reservation.client) {
    return res.status(400).json({ error: 'reservation.client is required' });
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

  const clientName = `${client.first_name} ${client.last_name}`;

  const emailClientPath = path.resolve(TEMPLATES_DIR, 'email-client-devis.html');
  const emailAdminPath = path.resolve(TEMPLATES_DIR, 'email-admin-devis.html');

  const emailClientHtml = Handlebars.compile(fs.readFileSync(emailClientPath, 'utf-8'))({
    reservationId: reservation.id,
    clientName,
  });
  const emailAdminHtml = Handlebars.compile(fs.readFileSync(emailAdminPath, 'utf-8'))({
    reservationId: reservation.id,
    clientName,
    clientEmail: client.email,
    clientPhone: client.phone,
    dateStart: formatDate(reservation.date_start),
    dateEnd: formatDate(reservation.date_end),
    totalPrice: reservation.total_price,
  });

  const [clientResult, adminResult] = await Promise.allSettled([
    mailer.sendMail({
      from: SMTP_FROM,
      to: client.email,
      subject: `Votre devis FiestaLok #${reservation.id}`,
      html: emailClientHtml,
      attachments: [{ filename: `devis-${reservation.id}.pdf`, content: pdfBytes, contentType: 'application/pdf' }],
    }),
    mailer.sendMail({
      from: SMTP_FROM,
      to: ADMIN_EMAIL,
      subject: `Nouveau devis envoyé — #${reservation.id} (${clientName})`,
      html: emailAdminHtml,
      attachments: [{ filename: `devis-${reservation.id}.pdf`, content: pdfBytes, contentType: 'application/pdf' }],
    }),
  ]);
  if (clientResult.status === 'rejected') console.error('Client email failed:', clientResult.reason.message);
  if (adminResult.status === 'rejected') console.error('Admin email failed:', adminResult.reason.message);

  return res.json({ file_id: fileData.data.id });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`template-renderer listening on port ${PORT}`));
}

module.exports = app;
