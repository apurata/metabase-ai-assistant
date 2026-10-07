/**
 * Apurata Cursor MCP contracts.
 * These must stay green across upstream merges — they guard fork-only behavior
 * that upstream Jest does not cover.
 */
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { CardsHandler } from '../../src/mcp/handlers/cards.js';
import { CollectionsHandler } from '../../src/mcp/handlers/collections.js';
import { assertWritableCollection, getWritableCollectionIds } from '../../src/mcp/write-guards.js';
import { TOOL_METADATA, getToolDefinitions } from '../../src/mcp/tool-registry.js';
import {
  buildAddCardPutBody,
  resolveDashboardTabId,
  summarizeCollections,
} from '../../src/mcp/dashboard-layout.js';

describe('Apurata write-guards', () => {
  const prev = process.env.METABASE_WRITABLE_COLLECTION_IDS;

  afterEach(() => {
    if (prev === undefined) delete process.env.METABASE_WRITABLE_COLLECTION_IDS;
    else process.env.METABASE_WRITABLE_COLLECTION_IDS = prev;
  });

  test('unset allowlist does not block', () => {
    delete process.env.METABASE_WRITABLE_COLLECTION_IDS;
    expect(getWritableCollectionIds()).toEqual([]);
    expect(() => assertWritableCollection(null, 'noop')).not.toThrow();
    expect(() => assertWritableCollection(999, 'noop')).not.toThrow();
  });

  test('set allowlist blocks Root and foreign collections', () => {
    process.env.METABASE_WRITABLE_COLLECTION_IDS = '250,481';
    expect(getWritableCollectionIds()).toEqual([250, 481]);
    expect(() => assertWritableCollection(250, 'ok')).not.toThrow();
    expect(() => assertWritableCollection(1, 'blocked')).toThrow(/Write blocked/);
    expect(() => assertWritableCollection(null, 'blocked')).toThrow(/Write blocked/);
  });
});

describe('Apurata CardsHandler contracts', () => {
  let mockClient;
  let handler;
  const prevAllow = process.env.METABASE_WRITABLE_COLLECTION_IDS;

  beforeEach(() => {
    process.env.METABASE_WRITABLE_COLLECTION_IDS = '481';
    mockClient = {
      request: jest.fn(),
      createSQLQuestion: jest.fn().mockResolvedValue({ id: 1, name: 'Q' }),
    };
    handler = new CardsHandler(mockClient);
  });

  afterEach(() => {
    if (prevAllow === undefined) delete process.env.METABASE_WRITABLE_COLLECTION_IDS;
    else process.env.METABASE_WRITABLE_COLLECTION_IDS = prevAllow;
  });

  test('mb_question_create blocked outside allowlist', async () => {
    const res = await handler.handleCreateQuestion({
      name: 'x',
      database_id: 2,
      sql: 'SELECT 1',
      collection_id: 1,
    });
    expect(res.content[0].text).toMatch(/Write blocked|Create question error/);
    expect(mockClient.createSQLQuestion).not.toHaveBeenCalled();
  });

  test('mb_card_update native_query + mongo_collection builds native dataset_query', async () => {
    mockClient.request
      .mockResolvedValueOnce({ id: 42, collection_id: 481 }) // assertCardWritable GET
      .mockResolvedValueOnce({
        id: 42,
        collection_id: 481,
        database_id: 2,
        dataset_query: {
          type: 'native',
          database: 2,
          native: { query: '[]', collection: 'old_col' },
        },
      })
      .mockResolvedValueOnce({
        id: 42,
        dataset_query: {
          type: 'native',
          database: 2,
          native: { query: '[{"$limit":1}]', collection: 'lend' },
        },
      });

    const res = await handler.handleCardUpdate({
      card_id: 42,
      native_query: '[{"$limit":1}]',
      mongo_collection: 'lend',
    });
    expect(res.content[0].text).toMatch(/updated successfully/);
    const put = mockClient.request.mock.calls.find((c) => c[0] === 'PUT');
    expect(put).toBeDefined();
    expect(put[2].dataset_query).toEqual({
      type: 'native',
      database: 2,
      native: {
        query: '[{"$limit":1}]',
        collection: 'lend',
      },
    });
  });

  test('mb_card_get exposes dataset_query and null-safe fields', async () => {
    delete process.env.METABASE_WRITABLE_COLLECTION_IDS;
    mockClient.request.mockResolvedValueOnce({
      id: 9,
      name: 'Mongo card',
      description: null,
      display: 'table',
      database_id: 2,
      collection_id: null,
      archived: false,
      created_at: '2026-01-01',
      updated_at: '2026-01-02',
      dataset_query: {
        type: 'native',
        database: 2,
        native: { collection: 'lend', query: '[{"$limit":1}]' },
      },
    });

    const res = await handler.handleCardGet({ card_id: 9 });
    expect(res.structuredContent.description).toBeNull();
    expect(res.structuredContent.collection_id).toBeNull();
    expect(res.structuredContent.dataset_query.native.collection).toBe('lend');
    expect(res.content[0].text).toMatch(/collection=lend|Native query/i);
  });

  test('mb_card_data respects max_rows and sets truncated', async () => {
    delete process.env.METABASE_WRITABLE_COLLECTION_IDS;
    const rows = Array.from({ length: 5 }, (_, i) => [i]);
    mockClient.request.mockResolvedValueOnce({
      data: { rows, cols: [{ name: 'n', display_name: 'n' }] },
    });

    const res = await handler.handleCardData({ card_id: 1, max_rows: 2 });
    expect(res.structuredContent.row_count).toBe(5);
    expect(res.structuredContent.returned_row_count).toBe(2);
    expect(res.structuredContent.max_rows).toBe(2);
    expect(res.structuredContent.truncated).toBe(true);
    expect(res.structuredContent.rows).toHaveLength(2);
  });

  test('mb_dashboard_get coerces null description to empty string for Cursor', async () => {
    delete process.env.METABASE_WRITABLE_COLLECTION_IDS;
    mockClient.request.mockResolvedValueOnce({
      id: 3,
      name: 'Dash',
      description: null,
      collection_id: null,
      tabs: [{ id: 10, name: 'Tab A' }],
      dashcards: [{ id: 1, card_id: 99, row: 0, col: 0, size_x: 4, size_y: 4, dashboard_tab_id: 10 }],
      parameters: [],
    });

    const res = await handler.handleDashboardGet({ dashboard_id: 3 });
    expect(res.structuredContent.description).toBe('');
    expect(res.structuredContent.tabs).toEqual([{ id: 10, name: 'Tab A' }]);
    expect(res.structuredContent.cards[0]).toMatchObject({
      card_id: 99,
      dashboard_tab_id: 10,
    });
  });

  test('add card accepts card_id alias and PUT body includes dashboard_tab_id', async () => {
    delete process.env.METABASE_WRITABLE_COLLECTION_IDS;
    mockClient.request
      .mockResolvedValueOnce({
        id: 7,
        name: 'D',
        tabs: [{ id: 40, name: 'T' }],
        dashcards: [],
      })
      .mockResolvedValueOnce({
        id: 7,
        name: 'D',
        tabs: [{ id: 40, name: 'T' }],
        dashcards: [{ id: 1, card_id: 55, dashboard_tab_id: 40 }],
      });

    const res = await handler.handleAddCardToDashboard({
      dashboard_id: 7,
      card_id: 55,
      dashboard_tab_id: 40,
    });
    expect(res.content[0].text).toMatch(/Card added/i);
    const put = mockClient.request.mock.calls.find((c) => c[0] === 'PUT');
    expect(put[2].dashcards.at(-1)).toMatchObject({
      card_id: 55,
      dashboard_tab_id: 40,
    });
  });

  test('mb_field_metadata coercion_strategy PUT path uses field-coercion helpers', async () => {
    delete process.env.METABASE_WRITABLE_COLLECTION_IDS;
    mockClient.request
      .mockResolvedValueOnce({
        id: 100,
        name: 'created',
        display_name: 'Created',
        base_type: 'type/Text',
        effective_type: 'type/Text',
        semantic_type: null,
        description: null,
        visibility_type: 'normal',
        has_field_values: 'auto',
        coercion_strategy: null,
      })
      .mockResolvedValueOnce({
        id: 100,
        name: 'created',
        display_name: 'Created',
        base_type: 'type/Text',
        effective_type: 'type/DateTime',
        semantic_type: null,
        description: null,
        visibility_type: 'normal',
        has_field_values: 'auto',
        coercion_strategy: 'Coercion/ISO8601->DateTime',
      });

    const res = await handler.handleFieldMetadata({
      field_id: 100,
      coercion_strategy: 'Coercion/ISO8601->DateTime',
    });
    expect(mockClient.request).toHaveBeenCalledWith(
      'PUT',
      '/api/field/100',
      expect.objectContaining({ coercion_strategy: 'Coercion/ISO8601->DateTime' })
    );
    expect(res.structuredContent).toMatchObject({
      field_id: 100,
      coercion_strategy: 'Coercion/ISO8601->DateTime',
      updated: true,
      error: null,
    });
  });

  test('mb_field_metadata refuses cast on base_type type/* (All Lend footgun)', async () => {
    delete process.env.METABASE_WRITABLE_COLLECTION_IDS;
    mockClient.request.mockResolvedValueOnce({
      id: 101,
      name: 'boleta_ideal',
      display_name: 'boleta_ideal',
      base_type: 'type/*',
      effective_type: 'type/*',
      coercion_strategy: null,
    });

    const res = await handler.handleFieldMetadata({
      field_id: 101,
      coercion_strategy: 'Coercion/String->Float',
    });
    expect(mockClient.request).toHaveBeenCalledTimes(1);
    expect(mockClient.request).toHaveBeenCalledWith('GET', '/api/field/101');
    expect(res.structuredContent.error).toMatch(/type\/\*/);
  });
});

describe('Apurata collections listing', () => {
  test('parent_id filters descendant collections (not /items API)', async () => {
    const mockClient = {
      request: jest.fn().mockResolvedValue([
        { id: 12, name: 'Parent', personal_owner_id: null, parent_id: null },
        { id: 13, name: 'Child', personal_owner_id: null, parent_id: 12 },
        { id: 99, name: 'Personal', personal_owner_id: 1, parent_id: null },
      ]),
    };
    const handler = new CollectionsHandler(mockClient);
    const res = await handler.handleCollectionList({ parent_id: 12 });
    expect(mockClient.request).toHaveBeenCalledWith('GET', '/api/collection');
    expect(res.structuredContent.collections).toEqual([
      { id: 13, name: 'Child', parent_id: 12 },
    ]);
  });

  test('summarizeCollections drops personal collections', () => {
    const rows = summarizeCollections([
      { id: 1, name: 'A', personal_owner_id: null, parent_id: null },
      { id: 2, name: 'P', personal_owner_id: 9, parent_id: null },
    ]);
    expect(rows).toEqual([{ id: 1, name: 'A', parent_id: null }]);
  });
});

describe('Apurata dashboard-layout helpers', () => {
  test('dashboard with tabs requires dashboard_tab_id', () => {
    expect(() =>
      resolveDashboardTabId({ tabs: [{ id: 1, name: 'A' }] }, null)
    ).toThrow(/dashboard_tab_id is required/);
  });

  test('buildAddCardPutBody keeps existing dashcards', () => {
    const body = buildAddCardPutBody(
      {
        tabs: [{ id: 1, name: 'A' }],
        dashcards: [{ id: 9, card_id: 1, row: 0, col: 0, size_x: 4, size_y: 4, dashboard_tab_id: 1 }],
      },
      2,
      { dashboard_tab_id: 1 }
    );
    expect(body.dashcards).toHaveLength(2);
    expect(body.dashcards[1].card_id).toBe(2);
  });
});

describe('Apurata tool registry surface', () => {
  test('registers tab create, native_query update, and max_rows on card data', () => {
    expect(TOOL_METADATA.mb_dashboard_tab_create).toBeDefined();
    expect(TOOL_METADATA.mb_card_get.outputSchema.properties.dataset_query.type).toEqual([
      'object',
      'null',
    ]);
    expect(TOOL_METADATA.mb_dashboard_get.outputSchema.properties.tabs).toBeDefined();
    expect(TOOL_METADATA.mb_card_data.outputSchema.properties.max_rows).toBeDefined();

    const tools = getToolDefinitions();
    const update = tools.find((t) => t.name === 'mb_card_update');
    expect(update.inputSchema.properties.native_query).toBeDefined();
    expect(update.inputSchema.properties.mongo_collection).toBeDefined();

    const data = tools.find((t) => t.name === 'mb_card_data');
    expect(data.inputSchema.properties.max_rows).toBeDefined();

    const tab = tools.find((t) => t.name === 'mb_dashboard_tab_create');
    expect(tab).toBeDefined();
  });
});
