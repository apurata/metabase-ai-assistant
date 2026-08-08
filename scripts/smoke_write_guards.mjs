#!/usr/bin/env node
/**
 * Tiny smoke for write-guards + card query text helpers (no Metabase network).
 */
import assert from 'node:assert/strict';
import { formatMetabaseApiError } from '../src/metabase/client.js';
import { assertWritableCollection, getWritableCollectionIds } from '../src/mcp/write-guards.js';
import { CardsHandler } from '../src/mcp/handlers/cards.js';

delete process.env.METABASE_WRITABLE_COLLECTION_IDS;
assert.deepEqual(getWritableCollectionIds(), []);
assertWritableCollection(null, 'noop'); // no allowlist → allow

process.env.METABASE_WRITABLE_COLLECTION_IDS = '250,481';
assert.deepEqual(getWritableCollectionIds(), [250, 481]);
assertWritableCollection(250, 'ok');
assert.throws(() => assertWritableCollection(1, 'blocked'), /Write blocked/);
assert.throws(() => assertWritableCollection(null, 'blocked'), /Write blocked/);

const cards = new CardsHandler(null);
const summary = cards.summarizeDatasetQuery({
  type: 'native',
  database: 2,
  native: {
    collection: 'proxy_data',
    query: '[{"$limit": 1}]',
    'template-tags': {},
  },
});
assert.match(summary, /collection=proxy_data/);
assert.match(summary, /\$limit/);

const textParts = cards.extractNativeParts({
  type: 'native',
  database: 2,
  native: {
    collection: 'proxy_data',
    query: '[{"$limit": 1}]',
    'template-tags': { created: { name: 'created', type: 'dimension' } },
  },
});
assert.equal(textParts.collection, 'proxy_data');
assert.ok(textParts.templateTags.created);

const apiErr = formatMetabaseApiError(
  {
    message: 'Request failed with status code 500',
    response: { status: 500, data: { message: 'Mongo query timeout' } },
  },
  'POST',
  '/api/card/1/query'
);
assert.match(apiErr, /status 500/);
assert.match(apiErr, /Mongo query timeout/);

console.log('smoke_write_guards: ok');
