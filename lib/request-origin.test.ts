import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestOrigin } from './request-origin';

test('direct localhost and loopback hosts retain the browser origin', () => {
  assert.equal(requestOrigin(new Headers({ host: 'localhost:3000' }), 'http://localhost:3000'), 'http://localhost:3000');
  assert.equal(requestOrigin(new Headers({ host: '127.0.0.1:3000' }), 'http://localhost:3000'), 'http://127.0.0.1:3000');
  assert.equal(requestOrigin(new Headers({ host: '[::1]:3000' }), 'http://localhost:3000'), 'http://[::1]:3000');
});

test('HTTPS public host is recovered behind an HTTP reverse proxy', () => {
  const headers = new Headers({ host: '127.0.0.1:3000', 'x-forwarded-host': 'cargoquay.com', 'x-forwarded-proto': 'https' });
  assert.equal(requestOrigin(headers, 'http://localhost:3000'), 'https://cargoquay.com');
});

test('TLS termination works when the proxy preserves Host', () => {
  assert.equal(requestOrigin(new Headers({ host: 'cargoquay.com', 'x-forwarded-proto': 'https' }), 'http://cargoquay.com'), 'https://cargoquay.com');
});

test('forwarded header chains use their first public values', () => {
  const headers = new Headers({ host: 'internal:3000', 'x-forwarded-host': 'cargoquay.com, internal:3000', 'x-forwarded-proto': 'https, http' });
  assert.equal(requestOrigin(headers, 'http://internal:3000'), 'https://cargoquay.com');
});

test('an explicit public origin works without forwarded headers and overrides supplied headers', () => {
  const headers = new Headers({ host: 'internal:3000', 'x-forwarded-host': 'other.example', 'x-forwarded-proto': 'http' });
  assert.equal(requestOrigin(headers, 'http://internal:3000', 'https://cargoquay.com/'), 'https://cargoquay.com');
});

test('invalid origins and malformed proxy hosts fail closed', () => {
  for (const value of ['not-a-url', 'null', 'ftp://cargoquay.com', 'https://user:secret@cargoquay.com', 'https://cargoquay.com/path', 'https://cargoquay.com?query=1']) {
    assert.equal(requestOrigin(new Headers(), 'http://localhost:3000', value), null);
  }
  for (const host of ['cargoquay.com/path', 'user@cargoquay.com', 'cargoquay.com#fragment']) {
    assert.equal(requestOrigin(new Headers({ 'x-forwarded-host': host, 'x-forwarded-proto': 'https' }), 'http://localhost:3000'), null);
  }
});

test('ports remain significant while default HTTPS ports normalize', () => {
  assert.equal(requestOrigin(new Headers({ host: 'cargoquay.com:8443', 'x-forwarded-proto': 'https' }), 'http://internal'), 'https://cargoquay.com:8443');
  assert.equal(requestOrigin(new Headers({ host: 'cargoquay.com:443', 'x-forwarded-proto': 'https' }), 'http://internal'), 'https://cargoquay.com');
});

test('direct HTTPS requests work without proxy headers', () => {
  assert.equal(requestOrigin(new Headers({ host: 'cargoquay.com' }), 'https://cargoquay.com'), 'https://cargoquay.com');
});
