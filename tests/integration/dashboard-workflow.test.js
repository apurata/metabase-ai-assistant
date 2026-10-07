import { CardsHandler } from '../../src/mcp/handlers/cards.js';
import { DashboardDirectHandler } from '../../src/mcp/handlers/dashboard_direct.js';
import { jest } from '@jest/globals';

describe('Integration Test: Dashboard Creation & Parameterized Card Workflow', () => {
  let mockClient;
  let mockMetadataHandler;
  let cardsHandler;
  let dashboardDirectHandler;

  beforeEach(() => {
    mockClient = {
      request: jest.fn(),
      createDashboard: jest.fn(),
      addCardToDashboard: jest.fn(),
      executeNativeQuery: jest.fn(),
    };
    mockMetadataHandler = {
      getInternalDbId: jest.fn().mockResolvedValue(1),
      executeInternalQuery: jest.fn().mockResolvedValue({
        data: { rows: [] }
      })
    };
    cardsHandler = new CardsHandler(mockClient);
    dashboardDirectHandler = new DashboardDirectHandler(mockClient, mockMetadataHandler);
  });

  test('executes end-to-end dashboard creation, card attachment, and parameter link', async () => {
    // 1. Create Dashboard
    mockClient.createDashboard.mockResolvedValueOnce({
      id: 101,
      name: 'Executive Sales Dashboard',
      description: 'KPI Metrics for Q1',
    });

    const createDashResult = await cardsHandler.handleCreateDashboard({
      name: 'Executive Sales Dashboard',
      description: 'KPI Metrics for Q1',
    });
    expect(createDashResult.content[0].text).toMatch(/dashboard created/i);

    // 2. Add Card via Apurata PUT path (GET dashboard → PUT dashcards)
    mockClient.request
      .mockResolvedValueOnce({
        id: 101,
        name: 'Executive Sales Dashboard',
        tabs: [],
        dashcards: [],
      })
      .mockResolvedValueOnce({
        id: 101,
        name: 'Executive Sales Dashboard',
        tabs: [],
        dashcards: [{ id: 501, card_id: 42, row: 0, col: 0, size_x: 4, size_y: 4 }],
      });

    const addCardResult = await cardsHandler.handleAddCardToDashboard({
      dashboard_id: 101,
      card_id: 42,
      parameter_mappings: [],
    });
    expect(addCardResult.content[0].text).toMatch(/card added/i);

    // 3. Link Dashboard Filter to Card
    const linkResult = await dashboardDirectHandler.handleLinkDashboardFilter({
      dashboard_id: 101,
      card_id: 42,
      mappings: [
        {
          parameter_id: 'param_date_range',
          target_type: 'variable',
          target_value: 'created_at',
        },
      ],
    });
    expect(linkResult.content[0].text).toContain('Filter Linked');
  });
});
