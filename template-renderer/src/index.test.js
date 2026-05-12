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

describe('POST /generate-pdf', () => {
  test('retourne 401 sans header X-API-Key', async () => {
    const res = await request(app).post('/generate-pdf').send({ reservation: {} });
    expect(res.status).toBe(401);
  });

  test('retourne 401 avec une clé incorrecte', async () => {
    const res = await request(app)
      .post('/generate-pdf')
      .set('X-API-Key', 'mauvaise-cle')
      .send({ reservation: {} });
    expect(res.status).toBe(401);
  });

  test('retourne 400 quand reservation est absent', async () => {
    const res = await request(app)
      .post('/generate-pdf')
      .set('X-API-Key', VALID_KEY)
      .send({});
    expect(res.status).toBe(400);
  });
});
