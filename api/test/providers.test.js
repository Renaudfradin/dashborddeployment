'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sodium = require('libsodium-wrappers');
const { listProviders, validateCredentials, getAdapter } = require('../src/providers/registry');
const vercel = require('../src/providers/vercel');
const netlify = require('../src/providers/netlify');
const railway = require('../src/providers/railway');
const github = require('../src/providers/github');
const scaleway = require('../src/providers/scaleway');

function installFetch(handler) {
  const calls = [];
  const original = global.fetch;
  global.fetch = async (url, options = {}) => {
    const entry = {
      url: String(url),
      method: options.method || 'GET',
      body: options.body ? JSON.parse(options.body) : null,
      headers: options.headers,
    };
    calls.push(entry);
    const result = await handler(entry);
    const payload = typeof result.body === 'string' ? result.body : JSON.stringify(result.body ?? {});
    return new Response(result.empty ? null : payload, {
      status: result.status || 200,
      headers: result.headers || { 'content-type': 'application/json' },
    });
  };
  return {
    calls,
    restore() {
      global.fetch = original;
    },
  };
}

test('le catalogue expose les cinq hébergeurs', () => {
  const keys = listProviders().map((item) => item.key).sort();
  assert.deepEqual(keys, ['github_pages', 'netlify', 'railway', 'scaleway', 'vercel']);
  for (const provider of listProviders()) {
    assert.equal(typeof provider.capabilities.redeploy, 'boolean');
    assert.ok(provider.credentials.length > 0);
  }
});

test('un champ obligatoire manquant est refusé', () => {
  const adapter = getAdapter('vercel');
  assert.throws(() => validateCredentials(adapter, {}), /Token/);
});

test('Vercel normalise les projets et relance un déploiement', async () => {
  const mock = installFetch(async (call) => {
    if (call.url.includes('/env')) {
      return { body: { envs: [{ id: 'env_1', key: 'TOKEN', value: 'secret', type: 'encrypted', target: ['production'] }] } };
    }
    if (call.url.includes('/events')) {
      return { body: [{ type: 'stdout', created: 1_700_000_000_000, payload: { text: 'build ok\n' } }] };
    }
    if (call.url.includes('/v6/deployments')) {
      return { body: { deployments: [{ uid: 'dpl_1', url: 'web-abc.vercel.app', state: 'READY', created: 1_700_000_000_000, meta: { githubCommitSha: 'abc', githubCommitRef: 'main' } }] } };
    }
    if (call.url.includes('/v13/deployments')) {
      assert.equal(call.body.deploymentId, 'dpl_1');
      assert.equal(call.body.name, 'web');
      return { body: { id: 'dpl_2', url: 'web-new.vercel.app', readyState: 'QUEUED' } };
    }
    if (call.url.includes('/v9/projects?')) {
      return { body: { projects: [{ id: 'prj_1', name: 'web', updatedAt: 1_700_000_000_000, targets: { production: { readyState: 'READY', url: 'web.vercel.app' } } }] } };
    }
    if (call.url.includes('/v9/projects/')) {
      return { body: { id: 'prj_1', name: 'web', targets: { production: { url: 'web.vercel.app', readyState: 'READY' } } } };
    }
    return { status: 404, body: { message: call.url } };
  });
  try {
    const projects = await vercel.listProjects({ token: 't' });
    assert.equal(projects[0].id, 'prj_1');
    assert.equal(projects[0].url, 'https://web.vercel.app');
    assert.equal(projects[0].status, 'READY');
    const deployments = await vercel.listDeployments({ token: 't' }, 'prj_1');
    assert.equal(deployments[0].commitSha, 'abc');
    assert.equal(deployments[0].branch, 'main');
    const redeployed = await vercel.redeploy({ token: 't' }, 'prj_1', 'dpl_1');
    assert.equal(redeployed.id, 'dpl_2');
    const logs = await vercel.getLogs({ token: 't' }, 'prj_1', 'dpl_1');
    assert.match(logs[0].message, /build ok/);
    const env = await vercel.listEnv({ token: 't' }, 'prj_1');
    assert.equal(env[0].readable, true);
    assert.equal(env[0].value, 'secret');
  } finally {
    mock.restore();
  }
});

test('Netlify masque un secret illisible', async () => {
  const mock = installFetch(async (call) => {
    if (call.url.includes('/sites?')) {
      return { body: [{ id: 'site_1', name: 'docs', ssl_url: 'https://docs.netlify.app', account_slug: 'acme', published_deploy: { state: 'ready' } }] };
    }
    if (call.url.endsWith('/env')) {
      return { body: [{ key: 'SECRET', is_secret: true, values: [{ context: 'all', value: null }] }, { key: 'PUBLIC', is_secret: false, values: [{ context: 'production', value: 'ok' }] }] };
    }
    return { status: 404, body: {} };
  });
  try {
    const projects = await netlify.listProjects({ token: 't' });
    assert.equal(projects[0].name, 'docs');
    assert.equal(projects[0].status, 'ready');
    const env = await netlify.listEnv({ token: 't' }, 'site_1');
    const secret = env.find((item) => item.key === 'SECRET');
    const pub = env.find((item) => item.key === 'PUBLIC');
    assert.equal(secret.readable, false);
    assert.equal(secret.value, null);
    assert.equal(pub.value, 'ok');
  } finally {
    mock.restore();
  }
});

test('Railway construit un identifiant projet::service::environnement', async () => {
  const mock = installFetch(async (call) => {
    const query = call.body.query;
    if (query.includes('projects')) {
      return {
        body: {
          data: {
            projects: {
              edges: [{
                node: {
                  id: 'proj',
                  name: 'App',
                  updatedAt: '2026-01-01T00:00:00.000Z',
                  services: { edges: [{ node: { id: 'svc', name: 'api' } }] },
                  environments: { edges: [{ node: { id: 'env', name: 'production' } }] },
                },
              }],
            },
          },
        },
      };
    }
    if (query.includes('domains')) {
      return { body: { data: { domains: { serviceDomains: [{ domain: 'api.up.railway.app' }] } } } };
    }
    if (query.includes('deployments')) {
      assert.equal(call.body.variables.projectId, 'proj');
      assert.equal(call.body.variables.serviceId, 'svc');
      return { body: { data: { deployments: { edges: [{ node: { id: 'dep', status: 'SUCCESS', createdAt: '2026-01-02T00:00:00.000Z', staticUrl: 'api.up.railway.app', meta: { commitHash: 'abc123' } } }] } } } };
    }
    if (query.includes('serviceInstanceRedeploy')) {
      return { body: { data: { serviceInstanceRedeploy: true } } };
    }
    if (query.includes('variables(')) {
      return { body: { data: { variables: { PORT: '3000' } } } };
    }
    return { status: 404, body: { message: query } };
  });
  try {
    const projects = await railway.listProjects({ token: 't' });
    assert.equal(projects[0].id, 'proj::svc::env');
    assert.equal(projects[0].url, 'https://api.up.railway.app');
    const deployments = await railway.listDeployments({ token: 't' }, projects[0].id);
    assert.equal(deployments[0].commitSha, 'abc123');
    const env = await railway.listEnv({ token: 't' }, projects[0].id);
    assert.equal(env[0].key, 'PORT');
    assert.equal(env[0].value, '3000');
    const redeployed = await railway.redeploy({ token: 't' }, projects[0].id);
    assert.equal(redeployed.status, 'QUEUED');
  } finally {
    mock.restore();
  }
});

test('GitHub Pages ignore les dépôts sans pages et ne relit pas les secrets', async () => {
  await sodium.ready;
  const pair = sodium.crypto_box_keypair();
  const publicKey = sodium.to_base64(pair.publicKey, sodium.base64_variants.ORIGINAL);
  const mock = installFetch(async (call) => {
    if (call.url.includes('/user/repos')) {
      return {
        headers: { link: '' },
        body: [
          { full_name: 'acme/site', has_pages: true, pushed_at: '2026-01-01T00:00:00.000Z', default_branch: 'main' },
          { full_name: 'acme/private-api', has_pages: false },
        ],
      };
    }
    if (call.url.endsWith('/pages')) {
      return { body: { html_url: 'https://acme.github.io/site', status: 'built', source: { branch: 'main' } } };
    }
    if (call.url.includes('/actions/runs')) {
      return { body: { workflow_runs: [{ id: 9, name: 'pages-build-deployment', status: 'completed', conclusion: 'success', head_sha: 'def', head_branch: 'main', display_title: 'docs', created_at: '2026-01-02T00:00:00.000Z' }] } };
    }
    if (call.url.includes('/actions/variables')) {
      return { body: { variables: [{ name: 'PUBLIC', value: 'yes' }] } };
    }
    if (call.url.includes('/actions/secrets/public-key')) {
      return { body: { key_id: 'key123', key: publicKey } };
    }
    if (call.url.includes('/actions/secrets/TOKEN') && call.method === 'PUT') {
      assert.equal(typeof call.body.encrypted_value, 'string');
      assert.equal(call.body.key_id, 'key123');
      assert.equal(call.body.encrypted_value.includes('plain-secret'), false);
      return { empty: true, status: 201, body: '' };
    }
    if (call.url.includes('/actions/secrets')) {
      return { body: { secrets: [{ name: 'TOKEN' }] } };
    }
    return { status: 404, body: { message: call.url } };
  });
  try {
    const projects = await github.listProjects({ token: 't' });
    assert.equal(projects.length, 1);
    assert.equal(projects[0].id, 'acme::site');
    assert.equal(projects[0].url, 'https://acme.github.io/site');
    const deployments = await github.listDeployments({ token: 't' }, 'acme::site');
    assert.equal(deployments[0].id, '9');
    assert.equal(deployments[0].status, 'success');
    const env = await github.listEnv({ token: 't' }, 'acme::site');
    assert.equal(env.find((item) => item.key === 'TOKEN').readable, false);
    assert.equal(env.find((item) => item.key === 'PUBLIC').value, 'yes');
    await github.upsertEnv({ token: 't' }, 'acme::site', { key: 'TOKEN', value: 'plain-secret', secret: true });
  } finally {
    mock.restore();
  }
});

test('Scaleway liste containers et functions et refuse l’écriture d’un secret', async () => {
  const mock = installFetch(async (call) => {
    if (call.url.includes('/containers/v1/') && call.url.includes('/containers?')) {
      return { body: { containers: [{ id: 'c1', name: 'web', status: 'ready', public_endpoint: 'web.functions.fr-par.scw.cloud', updated_at: '2026-01-01T00:00:00.000Z', environment_variables: { FOO: 'bar' }, secret_environment_variables: { DB: '' } }] } };
    }
    if (call.url.includes('/functions/v1beta1/') && call.url.includes('/functions?')) {
      return { body: { functions: [{ id: 'f1', name: 'hook', status: 'ready', domain_name: 'hook.functions.fr-par.scw.cloud' }] } };
    }
    if (call.url.includes('/containers/c1') && !call.url.endsWith('/redeploy')) {
      return { body: { id: 'c1', name: 'web', status: 'ready', environment_variables: { FOO: 'bar' }, secret_environment_variables: [{ key: 'DB' }] } };
    }
    if (call.url.endsWith('/redeploy')) {
      assert.equal(call.method, 'POST');
      return { body: { id: 'c1', status: 'pending' } };
    }
    return { status: 404, body: { message: call.url } };
  });
  try {
    const projects = await scaleway.listProjects({ secretKey: 's', projectId: 'p', region: 'fr-par' });
    assert.deepEqual(projects.map((item) => item.id).sort(), ['container::fr-par::c1', 'function::fr-par::f1']);
    const env = await scaleway.listEnv({ secretKey: 's', projectId: 'p' }, 'container::fr-par::c1');
    assert.equal(env.find((item) => item.key === 'FOO').value, 'bar');
    assert.equal(env.find((item) => item.key === 'DB').readable, false);
    await assert.rejects(
      () => scaleway.upsertEnv({ secretKey: 's', projectId: 'p' }, 'container::fr-par::c1', { key: 'DB', value: 'x', secret: true }),
      (err) => err.status === 400,
    );
    const deployment = await scaleway.redeploy({ secretKey: 's', projectId: 'p' }, 'container::fr-par::c1');
    assert.equal(deployment.status, 'pending');
    const calledRedeploy = mock.calls.some((call) => call.url.includes('/redeploy'));
    assert.equal(calledRedeploy, true);
    const headers = mock.calls[0].headers;
    assert.equal(headers['X-Auth-Token'], 's');
  } finally {
    mock.restore();
  }
});
