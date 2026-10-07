import { CollectionsHandler } from '../src/mcp/handlers/collections.js';
import { ActionsHandler } from '../src/mcp/handlers/actions.js';
import { CardsHandler } from '../src/mcp/handlers/cards.js';
import { SqlHandler } from '../src/mcp/handlers/sql.js';
import { getJobStore } from '../src/mcp/job-store.js';
import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('Milestone 3: Metabase BI API Enhancements & Handlers Compatibility Tests', () => {
  let mockClient;

  afterAll(() => {
    getJobStore().destroy();
  });

  beforeEach(() => {
    mockClient = {
      request: jest.fn(),
      executeNativeQueryWithTimeout: jest.fn().mockResolvedValue({ data: { rows: [[1]] } }),
      cancelPostgresQuery: jest.fn().mockResolvedValue(true),
    };
  });

  describe('CollectionsHandler Apurata collection listing', () => {
    test('handleCollectionList with no parent_id lists non-personal collections with parent_id', async () => {
      mockClient.request.mockResolvedValueOnce([
        { id: 1, name: 'Marketing', description: 'Marketing assets', personal_owner_id: null, parent_id: null },
        { id: 2, name: 'Engineering', description: 'Eng metrics', personal_owner_id: null, parent_id: null },
        { id: 99, name: "Alice's Personal", personal_owner_id: 5, parent_id: null }
      ]);

      const handler = new CollectionsHandler(mockClient);
      const result = await handler.handleCollectionList();

      expect(mockClient.request).toHaveBeenCalledWith('GET', '/api/collection');
      expect(result.content[0].text).toContain('Marketing');
      expect(result.content[0].text).toContain('Engineering');
      expect(result.content[0].text).not.toContain("Alice's Personal");
      expect(result.content[0].text).not.toContain('\\n');
      expect(result.structuredContent).toEqual({
        collections: [
          { id: 1, name: 'Marketing', parent_id: null },
          { id: 2, name: 'Engineering', parent_id: null }
        ],
        count: 2
      });
    });

    test('handleCollectionList with numeric parent_id filters descendant collections', async () => {
      mockClient.request.mockResolvedValueOnce([
        { id: 12, name: 'Parent', personal_owner_id: null, parent_id: null },
        { id: 102, name: 'Sub Collection 1', personal_owner_id: null, parent_id: 12 },
        { id: 103, name: 'Other', personal_owner_id: null, parent_id: 1 },
      ]);

      const handler = new CollectionsHandler(mockClient);
      const result = await handler.handleCollectionList({ parent_id: 12 });

      expect(mockClient.request).toHaveBeenCalledWith('GET', '/api/collection');
      expect(result.content[0].text).toContain('descendants of 12');
      expect(result.content[0].text).toContain('Sub Collection 1');
      expect(result.content[0].text).not.toContain('Other');
      expect(result.structuredContent).toEqual({
        collections: [{ id: 102, name: 'Sub Collection 1', parent_id: 12 }],
        count: 1
      });
    });

    test('handleCollectionList with empty descendants returns zero rows', async () => {
      mockClient.request.mockResolvedValueOnce([
        { id: 1, name: 'Marketing', personal_owner_id: null, parent_id: null },
      ]);

      const handler = new CollectionsHandler(mockClient);
      const result = await handler.handleCollectionList({ parent_id: 999 });

      expect(mockClient.request).toHaveBeenCalledWith('GET', '/api/collection');
      expect(result.structuredContent).toEqual({ collections: [], count: 0 });
    });
  });

  describe('Escape Formatting Cleanliness (No Double-Escaped \\n)', () => {
    test('CollectionsHandler handleCollectionCreate and handleCollectionMove use real newlines', async () => {
      mockClient.request.mockResolvedValueOnce({ id: 5, name: 'New Coll', description: 'Test', color: '#123456' });

      const handler = new CollectionsHandler(mockClient);
      const createRes = await handler.handleCollectionCreate({ name: 'New Coll' });
      expect(createRes.content[0].text).not.toContain('\\n');
      expect(createRes.content[0].text).toContain('\n');

      mockClient.request.mockResolvedValueOnce({});
      const moveRes = await handler.handleCollectionMove({ item_type: 'card', item_id: 10, target_collection_id: 2 });
      expect(moveRes.content[0].text).not.toContain('\\n');
      expect(moveRes.content[0].text).toContain('\n');
    });

    test('ActionsHandler outputs do not contain literal \\n', async () => {
      const handler = new ActionsHandler(mockClient);

      mockClient.request.mockResolvedValueOnce({ id: 10, name: 'Action 1', type: 'query' });
      const createRes = await handler.handleActionCreate({ name: 'Action 1', model_id: 2 });
      expect(createRes.content[0].text).not.toContain('\\n');

      mockClient.request.mockResolvedValueOnce([{ id: 1, name: 'A1', type: 'query' }]);
      const listRes = await handler.handleActionList({ model_id: 2 });
      expect(listRes.content[0].text).not.toContain('\\n');

      mockClient.request.mockResolvedValueOnce({ success: true });
      const execRes = await handler.handleActionExecute({ action_id: 1, parameters: { x: 1 } });
      expect(execRes.content[0].text).not.toContain('\\n');

      mockClient.request.mockResolvedValueOnce({ id: 20 });
      const alertCreateRes = await handler.handleAlertCreate({ card_id: 5 });
      expect(alertCreateRes.content[0].text).not.toContain('\\n');

      mockClient.request.mockResolvedValueOnce([{ id: 1, alert_condition: 'rows', card: { name: 'Card 1' } }]);
      const alertListRes = await handler.handleAlertList({});
      expect(alertListRes.content[0].text).not.toContain('\\n');

      mockClient.request.mockResolvedValueOnce({ id: 30, name: 'Pulse 1' });
      const pulseCreateRes = await handler.handlePulseCreate({ name: 'Pulse 1', cards: [1], channels: [1] });
      expect(pulseCreateRes.content[0].text).not.toContain('\\n');
    });
  });

  describe('CardsHandler handleDashboardGet collection_id', () => {
    test('handleDashboardGet includes collection_id in structuredContent when present', async () => {
      mockClient.request.mockResolvedValueOnce({
        id: 7,
        name: 'Exec KPI Dashboard',
        description: 'High-level KPIs',
        collection_id: 42,
        dashcards: [{ id: 1, card_id: 101 }],
        parameters: [],
        creator: { email: 'lead@example.com' },
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
        enable_embedding: true
      });

      const handler = new CardsHandler(mockClient);
      const result = await handler.handleDashboardGet({ dashboard_id: 7 });

      expect(result.structuredContent).toBeDefined();
      expect(result.structuredContent.id).toBe(7);
      expect(result.structuredContent.name).toBe('Exec KPI Dashboard');
      expect(result.structuredContent.description).toBe('High-level KPIs');
      expect(result.structuredContent.collection_id).toBe(42);
      expect(result.structuredContent.cards).toEqual([{
        id: 1,
        card_id: 101,
        name: null,
        dashboard_tab_id: null,
        row: undefined,
        col: undefined,
        size_x: undefined,
        size_y: undefined,
      }]);
      expect(result.structuredContent.tabs).toEqual([]);
    });

    test('handleDashboardGet includes collection_id as null when null/undefined', async () => {
      mockClient.request.mockResolvedValueOnce({
        id: 8,
        name: 'Root Dashboard',
        description: null,
        collection_id: null,
        dashcards: [],
        parameters: []
      });

      const handler = new CardsHandler(mockClient);
      const result = await handler.handleDashboardGet({ dashboard_id: 8 });

      expect(result.structuredContent.id).toBe(8);
      expect(result.structuredContent.collection_id).toBeNull();
      // Cursor rejects JSON null on description — Apurata coerces to ""
      expect(result.structuredContent.description).toBe('');
    });
  });

  describe('SqlHandler Safe Write Checks & Read-Only Handling', () => {
    const originalEnv = process.env.METABASE_READ_ONLY_MODE;

    afterEach(() => {
      process.env.METABASE_READ_ONLY_MODE = originalEnv;
    });

    test('handleSQLSubmit does not throw ReferenceError and creates background job for SELECT', async () => {
      process.env.METABASE_READ_ONLY_MODE = 'true';
      const handler = new SqlHandler(mockClient);

      const result = await handler.handleSQLSubmit({
        database_id: 1,
        sql: 'SELECT id, email FROM users WHERE active = true LIMIT 10;',
        timeout_seconds: 60
      });

      expect(result.content[0].text).toContain('Query Submitted');
      expect(result.content[0].text).toContain('Job ID:');
      expect(result.content[0].text).not.toContain('\\n');
    });

    test('handleSQLSubmit blocks write operation when METABASE_READ_ONLY_MODE=true', async () => {
      process.env.METABASE_READ_ONLY_MODE = 'true';
      const handler = new SqlHandler(mockClient);

      const result = await handler.handleSQLSubmit({
        database_id: 1,
        sql: 'DROP TABLE secret_data CASCADE;',
        timeout_seconds: 60
      });

      expect(result.content[0].text).toContain('Write operations blocked in read-only mode');
    });

    test('handleSQLSubmit allows write operation when METABASE_READ_ONLY_MODE=false', async () => {
      process.env.METABASE_READ_ONLY_MODE = 'false';
      const handler = new SqlHandler(mockClient);

      const result = await handler.handleSQLSubmit({
        database_id: 1,
        sql: 'INSERT INTO staging_events (name) VALUES (\'test\');',
        timeout_seconds: 60
      });

      expect(result.content[0].text).toContain('Query Submitted');
    });
  });

  describe('Manifest & Config Synchronization (Version 5.3.0 & 152 tools)', () => {
    test('server.json, smithery.yaml, manifest.json, and package.json are synchronized', () => {
      const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
      const manifest = JSON.parse(fs.readFileSync(path.resolve('manifest.json'), 'utf8'));
      const serverJson = JSON.parse(fs.readFileSync(path.resolve('server.json'), 'utf8'));
      const smitheryYaml = fs.readFileSync(path.resolve('smithery.yaml'), 'utf8');

      // Check versions
      expect(pkg.version).toBe('5.3.0');
      expect(manifest.version).toBe('5.3.0');
      expect(serverJson.version).toBe('5.3.0');
      expect(serverJson.packages[0].version).toBe('5.3.0');

      // Check tool count mentions
      expect(pkg.description).toContain('152 tools');
      expect(manifest.description).toContain('152 tools');
      expect(manifest.long_description).toContain('152 specialized tools');
      expect(serverJson.description).toContain('152 tools');
      expect(smitheryYaml).toContain('152 tools');
    });
  });
});
