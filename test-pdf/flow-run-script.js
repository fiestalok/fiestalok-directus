module.exports = async function (data) {
  const http = require('http');
  const reservation = data.$last;
  const client = reservation.client;
  const apiKey = process.env.RENDERER_API_KEY;
  const directusToken = process.env.DIRECTUS_TOKEN_SECRET;

  const formatDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '');

  function httpPost(url, headers, body) {
    return new Promise((resolve, reject) => {
      const { hostname, port, pathname } = new URL(url);
      const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
      const req = http.request(
        { hostname, port: port || 80, path: pathname, method: 'POST', headers: { ...headers, 'Content-Length': buf.length } },
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

  // 1. Demande un token de rendu au template-renderer
  const renderBody = JSON.stringify({
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
  });

  const renderResponse = await httpPost(
    'http://template-renderer:3001/render',
    { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    renderBody
  );
  if (!renderResponse.ok) throw new Error(`template-renderer: ${renderResponse.statusText}`);
  const { url } = await renderResponse.json();

  // 2. Génère le PDF via Gotenberg (mode URL)
  const pdfBoundary = 'boundary' + Date.now();
  const pdfBody = buildMultipart(pdfBoundary, [{ name: 'url', value: url }]);

  const pdfResponse = await httpPost(
    'http://gotenberg:3000/forms/chromium/convert/url',
    { 'Content-Type': `multipart/form-data; boundary=${pdfBoundary}` },
    pdfBody
  );
  if (!pdfResponse.ok) throw new Error(`Gotenberg: ${pdfResponse.statusText}`);
  const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer());

  // 3. Upload dans Directus Files
  const uploadBoundary = 'boundary' + (Date.now() + 1);
  const uploadBody = buildMultipart(uploadBoundary, [
    { name: 'title', value: `Devis Réservation #${reservation.id}` },
    { name: 'file', filename: `devis-${reservation.id}.pdf`, contentType: 'application/pdf', value: pdfBytes },
  ]);

  const uploadResponse = await httpPost(
    'http://directus:8055/files',
    { Authorization: `Bearer ${directusToken}`, 'Content-Type': `multipart/form-data; boundary=${uploadBoundary}` },
    uploadBody
  );
  if (!uploadResponse.ok) throw new Error(`Upload: ${uploadResponse.statusText}`);
  return (await uploadResponse.json()).data;
};
