import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MAX_BODY_BYTES, readBodyLimited, verifySignature } from '../src/security.js';
import { SECRET, sign } from './helpers.js';

const encoder = new TextEncoder();
const BODY = encoder.encode('{"zen":"Keep it logically awesome."}');

test('assinatura válida é aceita', async () => {
  assert.equal(await verifySignature(SECRET, BODY, await sign(SECRET, BODY)), true);
});

test('assinatura de outro segredo, de outro corpo, malformada ou ausente é recusada', async () => {
  const valid = await sign(SECRET, BODY);
  assert.equal(await verifySignature(SECRET, BODY, await sign('outro-segredo', BODY)), false);
  assert.equal(await verifySignature(SECRET, encoder.encode('{"zen":"alterado"}'), valid), false);
  for (const header of [null, undefined, '', 'sha256=', 'sha1=abc', valid.slice(0, -2), valid.replace('sha256=', ''), `${valid}00`]) {
    assert.equal(await verifySignature(SECRET, BODY, header), false, String(header));
  }
});

test('sem segredo configurado nada é aceito, nem uma assinatura que pareça certa', async () => {
  assert.equal(await verifySignature(undefined, BODY, `sha256=${'0'.repeat(64)}`), false);
  assert.equal(await verifySignature('', BODY, await sign(SECRET, BODY)), false);
});

test('corpo acima do limite é recusado, pelo cabeçalho ou pelo fluxo', async () => {
  const declared = new Request('https://relay.test/', {
    method: 'POST',
    headers: { 'content-length': String(MAX_BODY_BYTES + 1) },
    body: 'x'
  });
  assert.equal(await readBodyLimited(declared), null);

  const streamed = new Request('https://relay.test/', { method: 'POST', body: new Uint8Array(1025) });
  assert.equal(await readBodyLimited(streamed, 1024), null);

  const ok = new Request('https://relay.test/', { method: 'POST', body: 'abc' });
  assert.deepEqual([...(await readBodyLimited(ok, 1024))], [97, 98, 99]);
});
