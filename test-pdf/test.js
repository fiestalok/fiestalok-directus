const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

// Données d'exemple qui simulent ce que Directus envoie
const reservation = {
  id: 32,
  client: {
    first_name: 'Aline',
    last_name: 'Lehmann',
    email: 'alinelehmann6@gmail.com',
    phone: '0679515925',
  },
  date_start: '2026-05-12T00:00:00',
  date_end: '2026-05-22T00:00:00',
  articles: [
    { articles_id: { name: 'Château Gonflable Toboggan' }, quantity: 1, unit_price: 200 },
  ],
  total_price: 200,
  notes: 'Livraison souhaitée avant 10h.',
};

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('fr-FR');
}

function buildHtml(reservation) {
  const template = fs.readFileSync(path.join(__dirname, 'reservation.html'), 'utf-8');

  const articlesRows = reservation.articles
    .map(
      (a) => `
    <tr>
      <td>${a.articles_id?.name || '-'}</td>
      <td>${a.quantity}</td>
      <td>${a.unit_price} €</td>
    </tr>`
    )
    .join('');

  const notesSection = reservation.notes
    ? `<h2>Notes</h2><div class="info-block">${reservation.notes}</div>`
    : '';

  const vars = {
    id: reservation.id,
    client_name: `${reservation.client.first_name} ${reservation.client.last_name}`,
    client_email: reservation.client.email,
    client_phone: reservation.client.phone,
    date_start: formatDate(reservation.date_start),
    date_end: formatDate(reservation.date_end),
    articles_rows: articlesRows,
    total_price: reservation.total_price,
    notes_section: notesSection,
  };

  return Object.entries(vars).reduce(
    (html, [key, val]) => html.replaceAll(`{{${key}}}`, val),
    template
  );
}

async function generatePdf() {
  const html = buildHtml(reservation);

  const form = new FormData();
  form.append('files', Buffer.from(html), {
    filename: 'index.html',
    contentType: 'text/html',
  });

  const response = await fetch('http://localhost:3000/forms/chromium/convert/html', {
    method: 'POST',
    body: form,
    headers: form.getHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Gotenberg error: ${response.status} ${response.statusText}`);
  }

  const pdfBuffer = await response.buffer();
  const outputPath = path.join(__dirname, 'reservation.pdf');
  fs.writeFileSync(outputPath, pdfBuffer);
  console.log(`PDF généré : ${outputPath}`);
}

generatePdf().catch(console.error);
