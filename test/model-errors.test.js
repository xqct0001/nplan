import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classifyModelError, displaySafeUrl, formatModelError } from '../src/model-errors.js';

for (const [name, error, code] of [
  ['timeout', new DOMException('timed out', 'TimeoutError'), 'timeout'],
  ['credentials', Object.assign(new Error('HTTP 401'), { status: 401 }), 'credentials'],
  ['rate limit', Object.assign(new Error('HTTP 429'), { status: 429 }), 'rate_limit'],
  ['not found', Object.assign(new Error('HTTP 404'), { status: 404 }), 'not_found'],
  ['server', Object.assign(new Error('HTTP 503'), { status: 503 }), 'provider_error']
]) {
  test(`classifies ${name} errors with Chinese action`, () => {
    const result = classifyModelError(error);
    assert.equal(result.code, code);
    assert.ok(result.message_zh);
    assert.ok(result.next_action_zh);
  });
}

test('formats actionable model errors in Chinese and English', () => {
  const error = Object.assign(new Error('HTTP 401'), { status: 401 });

  assert.match(formatModelError(error, 'zh-CN'), /API Key/);
  assert.match(formatModelError(error, 'zh-CN'), /下一步/);
  assert.match(formatModelError(error, 'en'), /API key/i);
  assert.match(formatModelError(error, 'en'), /Next step/);
});

test('formatted errors never expose URL queries, API keys, or response secrets', () => {
  const secret = 'sk-live-secret-value';
  const error = Object.assign(
    new Error(`fetch https://example.test/v1/models?api_key=${secret} failed: response ${secret}`),
    { cause: new Error(`Authorization: Bearer ${secret}`) }
  );
  const formatted = formatModelError(error, 'zh-CN');

  assert.doesNotMatch(formatted, /sk-live-secret-value/);
  assert.doesNotMatch(formatted, /api_key=/);
  assert.doesNotMatch(formatted, /example\.test/);
  assert.match(formatted, /下一步/);
});

test('classifies invalid provider addresses separately from connection failures', () => {
  const invalid = Object.assign(new TypeError('Invalid URL'), { code: 'ERR_INVALID_URL' });
  const refused = Object.assign(new TypeError('fetch failed'), {
    cause: Object.assign(new Error('connect refused'), { code: 'ECONNREFUSED' })
  });

  assert.equal(classifyModelError(invalid).code, 'invalid_url');
  assert.equal(classifyModelError(refused).code, 'network');
});

test('publishes model error helpers from the package entry point', async () => {
  const api = await import('../src/index.js');

  assert.equal(api.classifyModelError, classifyModelError);
  assert.equal(api.displaySafeUrl, displaySafeUrl);
  assert.equal(api.formatModelError, formatModelError);
});

test('displaySafeUrl strips credentials, query strings, and fragments', () => {
  const displayed = displaySafeUrl(
    'https://user-marker:pass-marker@example.test/v1/models?api_key=query-marker#fragment-marker'
  );

  assert.equal(displayed, 'https://example.test/v1/models');
  assert.doesNotMatch(displayed, /user-marker|pass-marker|query-marker|fragment-marker/);
});

test('displaySafeUrl returns a fixed label for malformed URLs', () => {
  const displayed = displaySafeUrl('malformed-url-secret-marker');

  assert.equal(displayed, '[invalid URL]');
  assert.doesNotMatch(displayed, /secret-marker/);
});
