'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startServer, makeAdmin, makeMember } = require('./helpers');

function fakeVeo(mode = 'ok') {
  const seen = [];
  let polls = 0;
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let b = '';
      req.on('data', (c) => (b += c));
      req.on('end', () => {
        seen.push({ method: req.method, url: req.url, key: req.headers['x-goog-api-key'], body: b ? JSON.parse(b) : null });
        const base = `http://127.0.0.1:${srv.address().port}`;
        const json = (o, s = 200) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
        if (mode === 'quota' && req.method === 'POST') return json({ error: { message: 'Quota exceeded for key AIzaVideoKey' } }, 429);
        if (req.method === 'POST' && req.url.includes(':predictLongRunning')) return json({ name: 'operations/op-1' });
        if (req.url === '/v1beta/operations/op-1') {
          polls += 1;
          if (polls < 2) return json({ name: 'operations/op-1', done: false });
          if (mode === 'blocked') return json({ done: true, response: { generateVideoResponse: { raiMediaFilteredReasons: ['Prompt blocked by safety rules'] } } });
          return json({ done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: base + '/files/v1:download' } }] } } });
        }
        if (req.url === '/files/v1:download') { res.writeHead(200, { 'Content-Type': 'video/mp4' }); return res.end(Buffer.from('FAKE-MP4-BYTES')); }
        json({}, 404);
      });
    }).listen(0, '127.0.0.1', () => resolve({ srv, seen, base: `http://127.0.0.1:${srv.address().port}` }));
  });
}

test('video generation: start, poll, download, privacy and errors', async (t) => {
  const veo = await fakeVeo();
  t.after(() => veo.srv.close());

  await t.test('without a Gemini key the message says what to do', async () => {
    const s = await startServer({});
    t.after(() => s.close());
    const a = await makeAdmin(s.base);
    const r = await a.c.post('/api/ai/video', { prompt: 'a calm beach' });
    assert.equal(r.status, 400);
    assert.match(r.json.error, /No video service/);
  });

  const s = await startServer({ GEMINI_API_KEY: 'AIzaVideoKey', GEMINI_BASE_URL: veo.base });
  t.after(() => s.close());
  const admin = await makeAdmin(s.base);
  const member = await makeMember(s.base, admin, 'sam@example.com', 'Sam');

  await t.test('start, poll until done, then download the file', async () => {
    const st = await admin.c.post('/api/ai/video', { prompt: 'white sneakers spinning', aspect: '16:9' });
    assert.equal(st.status, 200);
    const started = veo.seen.find((x) => x.url.includes(':predictLongRunning'));
    assert.match(started.url, /veo-3\.1-generate-preview/);
    assert.equal(started.key, 'AIzaVideoKey');
    assert.deepEqual(started.body.parameters, { aspectRatio: '16:9' });
    assert.equal(started.body.instances[0].prompt, 'white sneakers spinning');
    const id = st.json.id;
    assert.deepEqual((await admin.c.get('/api/ai/video/' + id)).json, { done: false });
    const done = await admin.c.get('/api/ai/video/' + id);
    assert.equal(done.json.done, true);
    const dl = await fetch(`${s.base}/api/ai/video/${id}/file`, { headers: { Cookie: admin.c.cookie } });
    assert.equal(dl.status, 200);
    assert.equal(dl.headers.get('content-type'), 'video/mp4');
    assert.equal(Buffer.from(await dl.arrayBuffer()).toString(), 'FAKE-MP4-BYTES');
    assert.equal(veo.seen.at(-1).key, 'AIzaVideoKey');
  });

  await t.test('someone else cannot see or fetch the video', async () => {
    const id = (await admin.c.post('/api/ai/video', { prompt: 'x' })).json.id;
    assert.equal((await member.c.get('/api/ai/video/' + id)).status, 404);
    assert.equal((await member.c.get('/api/ai/video/' + id + '/file')).status, 404);
  });

  await t.test('a quota error explains itself and hides the key', async () => {
    const q = await fakeVeo('quota');
    t.after(() => q.srv.close());
    const s2 = await startServer({ GEMINI_API_KEY: 'AIzaVideoKey', GEMINI_BASE_URL: q.base });
    t.after(() => s2.close());
    const a2 = await makeAdmin(s2.base);
    const r = await a2.c.post('/api/ai/video', { prompt: 'x' });
    assert.equal(r.status, 429);
    assert.match(r.json.error, /no quota for video/);
    assert.ok(!JSON.stringify(r.json).includes('AIzaVideoKey'));
  });

  await t.test('a blocked prompt comes back as a readable reason', async () => {
    const bl = await fakeVeo('blocked');
    t.after(() => bl.srv.close());
    const s3 = await startServer({ GEMINI_API_KEY: 'AIzaVideoKey', GEMINI_BASE_URL: bl.base });
    t.after(() => s3.close());
    const a3 = await makeAdmin(s3.base);
    const id = (await a3.c.post('/api/ai/video', { prompt: 'x' })).json.id;
    await a3.c.get('/api/ai/video/' + id);
    const r = await a3.c.get('/api/ai/video/' + id);
    assert.match(r.json.error, /safety rules/);
  });
});
