module.exports = async function (data) {
  const reservation = data.$last;
  const client = reservation.client;
  const token = process.env.DIRECTUS_TOKEN_SECRET;

  const formatDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '');

  const articlesRows = (reservation.articles || [])
    .map((a) => `<tr><td>${a.articles_id?.name || '-'}</td><td>${a.quantity}</td><td>${a.unit_price} €</td></tr>`)
    .join('');

  const notesSection = reservation.notes
    ? `<h2>Notes</h2><div class="info-block">${reservation.notes}</div>`
    : '';

  const html = `<!DOCTYPE html>
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
  <h1>Devis — Réservation #${reservation.id}</h1>
  <h2>Client</h2>
  <div class="info-block">
    <strong>${client.first_name} ${client.last_name}</strong><br>
    Email : ${client.email}<br>
    Téléphone : ${client.phone}
  </div>
  <h2>Dates</h2>
  <div class="info-block">
    Du <strong>${formatDate(reservation.date_start)}</strong> au <strong>${formatDate(reservation.date_end)}</strong>
  </div>
  <h2>Articles</h2>
  <table>
    <tr><th>Article</th><th>Quantité</th><th>Prix unitaire</th></tr>
    ${articlesRows}
  </table>
  <div class="total">Total : ${reservation.total_price} €</div>
  ${notesSection}
  <div class="footer">FiestaLok — contact@fiestalok.fr — fiestalok.fr</div>
</body>
</html>`;

  // Construit un body multipart/form-data avec Buffer (Node.js built-in)
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

  // Génération PDF via Gotenberg
  const boundary1 = 'boundary' + Date.now();
  const pdfBody = buildMultipart(boundary1, [
    { name: 'files', filename: 'index.html', contentType: 'text/html', value: Buffer.from(html) },
  ]);

  const pdfResponse = await fetch('http://gotenberg:3000/forms/chromium/convert/html', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary1}` },
    body: pdfBody,
  });

  if (!pdfResponse.ok) throw new Error(`Gotenberg: ${pdfResponse.statusText}`);

  const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer());

  // Upload dans Directus Files
  const boundary2 = 'boundary' + (Date.now() + 1);
  const uploadBody = buildMultipart(boundary2, [
    { name: 'title', value: `Devis Réservation #${reservation.id}` },
    { name: 'file', filename: `devis-${reservation.id}.pdf`, contentType: 'application/pdf', value: Buffer.isBuffer(pdfBytes) ? pdfBytes : Buffer.from(pdfBytes) },
  ]);

  const uploadResponse = await fetch('http://directus:8055/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/form-data; boundary=${boundary2}`,
    },
    body: uploadBody,
  });

  if (!uploadResponse.ok) throw new Error(`Upload: ${uploadResponse.statusText}`);

  return (await uploadResponse.json()).data;
};
