import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CardsHandler } from './handlers/cards.js';
import {
  castDidNotApply,
  coercionRefusal,
  isCastable,
} from './field-coercion.js';

describe('coercionRefusal', () => {
  it('rejects type/* and points at Funded or native', () => {
    const message = coercionRefusal('type/*', 'Coercion/String->Float');
    assert.match(message, /type\/\*/);
    assert.match(message, /DEV-612/);
    assert.match(message, /DEV-689/);
    assert.match(message, /DEV-348/);
    assert.match(message, /Funded/);
    assert.match(message, /ISO8601Bytes/);
    assert.doesNotMatch(message, /then Sync/);
  });

  it('allows Text to Float and BigInteger unix seconds', () => {
    assert.equal(coercionRefusal('type/Text', 'Coercion/String->Float'), null);
    assert.equal(coercionRefusal('type/BigInteger', 'Coercion/UNIXSeconds->DateTime'), null);
  });

  it('rejects Float to Integer on Decimal and unknown strategies', () => {
    assert.match(coercionRefusal('type/Decimal', 'Coercion/Float->Integer'), /does not apply/);
    assert.match(coercionRefusal('type/Text', 'Coercion/NotAStrategy'), /Unknown coercion_strategy/);
  });

  it('marks type/* and Boolean as not castable', () => {
    assert.equal(isCastable('type/*'), false);
    assert.equal(isCastable('type/Boolean'), false);
    assert.equal(isCastable('type/Text'), true);
  });
});

describe('castDidNotApply', () => {
  it('accepts a matching effective type', () => {
    assert.equal(castDidNotApply({
      coercion_strategy: 'Coercion/String->Float',
      effective_type: 'type/Float',
    }, 'Coercion/String->Float'), null);
  });

  it('rejects a no-op response', () => {
    assert.match(castDidNotApply({
      base_type: 'type/Text',
      effective_type: 'type/Text',
      coercion_strategy: null,
    }, 'Coercion/String->Float'), /did not apply/);
  });
});

function stubClient(field, { putResult } = {}) {
  const calls = [];
  return {
    calls,
    request: async (method, path, body) => {
      calls.push({ method, path, body });
      if (method === 'PUT') return putResult ?? { ...field, ...body };
      return field;
    },
    getTableFields: async (tableId) => {
      calls.push({ method: 'GET', path: `/api/table/${tableId}/query_metadata` });
      return field.tableFields ?? [];
    },
  };
}

describe('handleFieldMetadata', () => {
  it('returns base type and coercion without writing', async () => {
    const client = stubClient({
      id: 9,
      name: 'boleta_ideal',
      display_name: 'Boleta Ideal',
      base_type: 'type/*',
      effective_type: 'type/*',
      database_type: 'org.bson.BsonUndefined',
      coercion_strategy: null,
      semantic_type: null,
      visibility_type: 'normal',
      has_field_values: 'none',
    });
    const result = await new CardsHandler(client).handleFieldMetadata({ field_id: 9 });
    assert.equal(client.calls.length, 1);
    assert.equal(client.calls[0].method, 'GET');
    assert.equal(result.structuredContent.base_type, 'type/*');
    assert.equal(result.structuredContent.database_type, 'org.bson.BsonUndefined');
    assert.equal(result.structuredContent.castable, false);
    assert.equal(result.structuredContent.error, null);
    assert.match(result.content[0].text, /DEV-612/);
  });

  it('does not PUT when base_type is type/*', async () => {
    const client = stubClient({
      id: 9,
      name: 'boleta_ideal',
      display_name: 'Boleta Ideal',
      base_type: 'type/*',
      visibility_type: 'normal',
    });
    const result = await new CardsHandler(client).handleFieldMetadata({
      field_id: 9,
      coercion_strategy: 'Coercion/String->Float',
      display_name: 'Should not write',
    });
    assert.deepEqual(client.calls.map((call) => call.method), ['GET']);
    assert.equal(result.structuredContent.updated, false);
    assert.match(result.structuredContent.error, /DEV-612/);
  });

  it('PUTs an allowed cast and reports effective type', async () => {
    const client = stubClient({
      id: 4,
      name: 'amount_text',
      display_name: 'Amount',
      base_type: 'type/Text',
      effective_type: 'type/Text',
      visibility_type: 'normal',
    }, {
      putResult: {
        id: 4,
        name: 'amount_text',
        display_name: 'Amount',
        base_type: 'type/Text',
        effective_type: 'type/Float',
        coercion_strategy: 'Coercion/String->Float',
        visibility_type: 'normal',
      },
    });
    const result = await new CardsHandler(client).handleFieldMetadata({
      field_id: 4,
      coercion_strategy: 'Coercion/String->Float',
    });
    assert.equal(client.calls[1].method, 'PUT');
    assert.equal(client.calls[1].body.coercion_strategy, 'Coercion/String->Float');
    assert.equal(result.structuredContent.updated, true);
    assert.equal(result.structuredContent.effective_type, 'type/Float');
    assert.equal(result.structuredContent.error, null);
  });

  it('treats a silent no-op PUT as an error', async () => {
    const field = {
      id: 4,
      name: 'amount_text',
      display_name: 'Amount',
      base_type: 'type/Text',
      effective_type: 'type/Text',
      coercion_strategy: null,
      visibility_type: 'normal',
    };
    const client = stubClient(field, { putResult: field });
    const result = await new CardsHandler(client).handleFieldMetadata({
      field_id: 4,
      coercion_strategy: 'Coercion/String->Float',
    });
    assert.equal(result.structuredContent.updated, false);
    assert.match(result.structuredContent.error, /did not apply/);
  });

  it('returns structuredContent when the GET fails', async () => {
    const client = {
      request: async () => {
        throw new Error('boom');
      },
    };
    const result = await new CardsHandler(client).handleFieldMetadata({ field_id: 3 });
    assert.equal(result.structuredContent.field_id, 3);
    assert.equal(result.structuredContent.updated, false);
    assert.match(result.structuredContent.error, /boom/);
  });
});

describe('handleTableMetadata', () => {
  it('loads fields via query_metadata when the table payload has none', async () => {
    const client = stubClient({
      id: 77,
      name: 'all_lend_metabase',
      display_name: 'All Lend Metabase',
      visibility_type: 'visible',
      schema: null,
      description: null,
      fields: [],
      tableFields: [{
        id: 42,
        name: 'boleta_ideal',
        display_name: 'Boleta Ideal',
        base_type: 'type/*',
        effective_type: 'type/*',
        database_type: 'org.bson.BsonUndefined',
        coercion_strategy: null,
      }],
    });
    const result = await new CardsHandler(client).handleTableMetadata({ table_id: 77 });
    assert.equal(result.structuredContent.field_count, 1);
    assert.equal(result.structuredContent.fields[0].id, 42);
    assert.equal(result.structuredContent.fields[0].base_type, 'type/*');
    assert.match(result.content[0].text, /42 boleta_ideal/);
  });

  it('filters fields by name', async () => {
    const client = stubClient({
      id: 77,
      name: 'all_lend_metabase',
      display_name: 'All Lend Metabase',
      visibility_type: 'visible',
      fields: [
        { id: 1, name: 'amount', base_type: 'type/Float', effective_type: 'type/Float' },
        { id: 42, name: 'boleta_ideal', display_name: 'Boleta Ideal', base_type: 'type/*', effective_type: 'type/*' },
      ],
    });
    const result = await new CardsHandler(client).handleTableMetadata({
      table_id: 77,
      field_name: 'boleta',
    });
    assert.equal(result.structuredContent.field_count, 1);
    assert.equal(result.structuredContent.fields[0].id, 42);
    assert.equal(client.calls.some((call) => String(call.path).includes('query_metadata')), false);
  });
});
