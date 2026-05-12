jest.mock('nodemailer');

// Partial mock of http: keep all real internals, but make `request` a jest.fn
// that falls back to the real implementation by default (so supertest still works).
jest.mock('http', () => {
  const realHttp = jest.requireActual('http');
  const mockRequest = jest.fn((...args) => realHttp.request(...args));
  return { ...realHttp, request: mockRequest };
});

const path = require('path');
const { EventEmitter } = require('events');

process.env.RENDERER_API_KEY = 'test-api-key';
process.env.TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
process.env.SMTP_HOST = 'smtp.test.com';
process.env.SMTP_PORT = '465';
process.env.SMTP_USER = 'test@test.com';
process.env.SMTP_PASS = 'password';
process.env.SMTP_FROM = 'Test <test@test.com>';
process.env.GOTENBERG_URL = 'http://gotenberg:3000';
process.env.DIRECTUS_URL = 'http://directus:8055';
process.env.DIRECTUS_TOKEN = 'test-directus-token';

const nodemailer = require('nodemailer');
const http = require('http');
const request = require('supertest');

const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'ok' });
nodemailer.createTransport.mockReturnValue({ sendMail: mockSendMail });

const app = require('./index');

// Mocks sequential httpPost calls in index.js (Gotenberg, then Directus upload).
// httpPost always passes a callback as the second argument to http.request,
// whereas supertest calls http.request without a callback (event-based).
// We exploit this difference: only intercept calls where cb is a function.
function mockHttpSequence(responses) {
  const queue = responses.slice();
  const realRequest = jest.requireActual('http').request;

  http.request.mockImplementation((opts, cb) => {
    // If no callback provided, this is a supertest/internal call — use real http
    if (typeof cb !== 'function') {
      return realRequest(opts, cb);
    }
    // This is an httpPost call from index.js — serve the next queued response
    const next = queue.shift();
    if (!next) {
      throw new Error('mockHttpSequence: no more responses queued');
    }
    const { statusCode, body } = next;
    const res = Object.assign(new EventEmitter(), {
      statusCode,
      statusMessage: 'OK',
    });
    const req = {
      write: jest.fn(),
      end: jest.fn(() => {
        const buf = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
        res.emit('data', buf);
        res.emit('end');
      }),
      on: jest.fn(),
    };
    cb(res);
    return req;
  });
}

const VALID_KEY = 'test-api-key';

const VALID_RESERVATION = {
  id: '42',
  client: {
    first_name: 'Jean',
    last_name: 'Dupont',
    email: 'jean@example.com',
    phone: '0612345678',
  },
  date_start: '2025-06-01',
  date_end: '2025-06-05',
  articles: [{ articles_id: { name: 'Sono' }, quantity: 1, unit_price: 150 }],
  total_price: '150',
  notes: '',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSendMail.mockResolvedValue({ messageId: 'ok' });
});

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

  test('envoie deux emails (client + admin) après génération PDF réussie', async () => {
    mockHttpSequence([
      { statusCode: 200, body: Buffer.from('fake-pdf-bytes') },
      { statusCode: 200, body: { data: { id: 'file-123' } } },
    ]);

    const res = await request(app)
      .post('/generate-pdf')
      .set('X-API-Key', VALID_KEY)
      .send({ reservation: VALID_RESERVATION });

    expect(res.status).toBe(200);
    expect(res.body.file_id).toBe('file-123');

    expect(mockSendMail).toHaveBeenCalledTimes(2);

    const [clientCall, adminCall] = mockSendMail.mock.calls;

    expect(clientCall[0].to).toBe('jean@example.com');
    expect(clientCall[0].subject).toContain('#42');
    expect(clientCall[0].attachments[0].filename).toBe('devis-42.pdf');

    expect(adminCall[0].to).toBe('contact@fiestalok.fr');
    expect(adminCall[0].subject).toContain('#42');
    expect(adminCall[0].attachments[0].filename).toBe('devis-42.pdf');
  });

  test("un échec d'envoi email ne bloque pas la réponse — retourne file_id quand même", async () => {
    mockHttpSequence([
      { statusCode: 200, body: Buffer.from('fake-pdf-bytes') },
      { statusCode: 200, body: { data: { id: 'file-456' } } },
    ]);
    mockSendMail.mockRejectedValue(new Error('SMTP down'));

    const res = await request(app)
      .post('/generate-pdf')
      .set('X-API-Key', VALID_KEY)
      .send({ reservation: VALID_RESERVATION });

    expect(res.status).toBe(200);
    expect(res.body.file_id).toBe('file-456');
  });

  test('MAIL_REDIRECT_TO redirige tous les emails vers ladresse de test avec préfixe TEST -', async () => {
    process.env.MAIL_REDIRECT_TO = 'redirect@test.com';
    mockHttpSequence([
      { statusCode: 200, body: Buffer.from('fake-pdf-bytes') },
      { statusCode: 200, body: { data: { id: 'file-789' } } },
    ]);

    const res = await request(app)
      .post('/generate-pdf')
      .set('X-API-Key', VALID_KEY)
      .send({ reservation: VALID_RESERVATION });

    expect(res.status).toBe(200);
    expect(mockSendMail).toHaveBeenCalledTimes(2);
    for (const [opts] of mockSendMail.mock.calls) {
      expect(opts.to).toBe('redirect@test.com');
      expect(opts.subject).toMatch(/^TEST - /);
    }

    delete process.env.MAIL_REDIRECT_TO;
  });
});
