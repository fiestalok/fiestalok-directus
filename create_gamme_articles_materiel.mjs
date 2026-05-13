// Crée la collection gamme_articles_materiel via l'API Directus
const BASE_URL = 'http://localhost:8055';
const EMAIL = 'contact@fiestalok.fr';
const PASSWORD = 'fiestalok2sxb!';

async function api(method, path, body, token) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

// 1. Login
console.log('🔑 Connexion...');
const { access_token } = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
console.log('✓ Connecté');

// 2. Collection
console.log('📦 Création de la collection...');
await api('POST', '/collections', {
  collection: 'gamme_articles_materiel',
  meta: { icon: 'link', hidden: true },
  schema: {},
  fields: [
    {
      field: 'id',
      type: 'integer',
      meta: { hidden: true, readonly: true, interface: 'input', special: ['cast-to-int'] },
      schema: { is_primary_key: true, has_auto_increment: true },
    },
    {
      field: 'gamme_id',
      type: 'integer',
      meta: { interface: 'select-dropdown-m2o', hidden: false },
      schema: { is_nullable: false },
    },
    {
      field: 'article_id',
      type: 'integer',
      meta: { interface: 'select-dropdown-m2o', hidden: false },
      schema: { is_nullable: false },
    },
  ],
}, access_token).catch(e => console.log('⚠ Collection (peut-être déjà existante) :', e.message));
console.log('✓ Collection créée');

// 3. Relation gamme_id -> gammes
console.log('🔗 Relation gamme_id...');
await api('POST', '/relations', {
  collection: 'gamme_articles_materiel',
  field: 'gamme_id',
  related_collection: 'gammes',
}, access_token).catch(e => console.log('⚠ Relation gamme_id :', e.message));
console.log('✓ Relation gamme_id -> gammes');

// 4. Relation article_id -> articles
console.log('🔗 Relation article_id...');
await api('POST', '/relations', {
  collection: 'gamme_articles_materiel',
  field: 'article_id',
  related_collection: 'articles',
}, access_token).catch(e => console.log('⚠ Relation article_id :', e.message));
console.log('✓ Relation article_id -> articles');

console.log('\n✅ Terminé !');
