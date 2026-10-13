import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDashcardLayoutUpdate,
  buildAddCardPutBody,
  buildAddTextPutBody,
  buildCreateTabPutBody,
  resolveDashboardTabId,
  summarizeCollections,
} from './dashboard-layout.js';

describe('resolveDashboardTabId', () => {
  it('returns null when the dashboard has no tabs', () => {
    assert.equal(resolveDashboardTabId({ tabs: [] }, undefined), null);
  });

  it('requires a tab id when tabs exist', () => {
    assert.throws(
      () => resolveDashboardTabId({ tabs: [{ id: 32, name: 'All SFP' }] }, undefined),
      /dashboard_tab_id is required/
    );
  });

  it('rejects an unknown tab id', () => {
    assert.throws(
      () => resolveDashboardTabId({ tabs: [{ id: 32, name: 'All SFP' }] }, 99),
      /not found/
    );
  });
});

describe('buildCreateTabPutBody', () => {
  it('appends a negative-id tab and leaves existing cards on their tabs', () => {
    const body = buildCreateTabPutBody({
      tabs: [{ id: 32, name: 'All SFP' }],
      dashcards: [{ id: 1, card_id: 10, row: 0, col: 0, size_x: 4, size_y: 4, dashboard_tab_id: 32 }],
    }, 'SES');
    assert.deepEqual(body.tabs, [{ id: 32, name: 'All SFP' }, { id: -1, name: 'SES' }]);
    assert.equal(body.dashcards[0].dashboard_tab_id, 32);
  });

  it('assigns existing cards to the first tab when creating tabs on a tabless dashboard', () => {
    const body = buildCreateTabPutBody({
      tabs: [],
      dashcards: [{ id: 1, card_id: 10, row: 0, col: 0, size_x: 4, size_y: 4 }],
    }, 'Main');
    assert.equal(body.dashcards[0].dashboard_tab_id, -1);
  });
});

describe('buildAddCardPutBody', () => {
  it('keeps existing dashcards and places the new card on the requested tab', () => {
    const dashboard = {
      tabs: [{ id: 32, name: 'All SFP' }, { id: 40, name: 'SES' }],
      dashcards: [{ id: 1, card_id: 10, row: 0, col: 0, size_x: 4, size_y: 4, dashboard_tab_id: 32 }],
    };
    const body = buildAddCardPutBody(dashboard, 99, { dashboard_tab_id: 40, row: 2, col: 0 });
    assert.equal(body.dashcards.length, 2);
    assert.equal(body.dashcards[0].dashboard_tab_id, 32);
    assert.equal(body.dashcards[1].card_id, 99);
    assert.equal(body.dashcards[1].dashboard_tab_id, 40);
    assert.equal(body.dashcards[1].id, -1);
  });
});

describe('buildAddTextPutBody', () => {
  it('appends a virtual text dashcard with card_id null', () => {
    const body = buildAddTextPutBody(
      {
        tabs: [{ id: 1, name: 'Main' }],
        dashcards: [{ id: 9, card_id: 10, row: 0, col: 0, size_x: 4, size_y: 4, dashboard_tab_id: 1 }],
      },
      {
        text: 'Unit price note',
        display: 'text',
        dashboard_tab_id: 1,
        row: 5,
        col: 0,
      }
    );
    assert.equal(body.dashcards.length, 2);
    const textCard = body.dashcards[1];
    assert.equal(textCard.id, -1);
    assert.equal(textCard.card_id, null);
    assert.equal(textCard.dashboard_tab_id, 1);
    assert.equal(textCard.visualization_settings.text, 'Unit price note');
    assert.equal(textCard.visualization_settings.virtual_card.display, 'text');
  });

  it('updates an existing virtual dashcard by dashcard_id', () => {
    const body = buildAddTextPutBody(
      {
        tabs: [],
        dashcards: [
          {
            id: 55,
            card_id: null,
            row: 0,
            col: 0,
            size_x: 18,
            size_y: 2,
            visualization_settings: {
              text: 'old',
              virtual_card: { display: 'text', dataset_query: {}, visualization_settings: {}, archived: false },
            },
          },
        ],
      },
      { dashcard_id: 55, text: 'new copy', display: 'heading' }
    );
    assert.equal(body.dashcards.length, 1);
    assert.equal(body.dashcards[0].id, 55);
    assert.equal(body.dashcards[0].visualization_settings.text, 'new copy');
    assert.equal(body.dashcards[0].visualization_settings.virtual_card.display, 'heading');
  });
});

describe('applyDashcardLayoutUpdate', () => {
  it('does not move tabs unless dashboard_tab_id is passed', () => {
    const updated = applyDashcardLayoutUpdate(
      { id: 1, card_id: 10, row: 0, col: 0, size_x: 4, size_y: 4, dashboard_tab_id: 32 },
      { row: 3 }
    );
    assert.equal(updated.row, 3);
    assert.equal(updated.dashboard_tab_id, 32);
  });
});

describe('summarizeCollections', () => {
  it('filters by parent_id and includes parent_id in the row', () => {
    const rows = summarizeCollections([
      { id: 481, name: 'Dev', parent_id: null },
      { id: 407, name: 'aCuotaz SFP funnel', parent_id: 481 },
      { id: 'root', name: 'Our analytics', parent_id: null },
    ], 481);
    assert.deepEqual(rows, [{ id: 407, name: 'aCuotaz SFP funnel', parent_id: 481 }]);
  });

  it('includes nested descendants so Dev 481 lists 407 under 105 → 46', () => {
    const rows = summarizeCollections([
      { id: 481, name: 'Dev', parent_id: null },
      { id: 105, name: 'DEV - All', parent_id: 481 },
      { id: 46, name: 'aCuotaz funnel', parent_id: 105 },
      { id: 407, name: 'aCuotaz SFP funnel', parent_id: 46 },
      { id: 250, name: 'Kike drafts', parent_id: 481 },
    ], 481);
    const ids = rows.map((r) => r.id).sort((a, b) => a - b);
    assert.deepEqual(ids, [46, 105, 250, 407]);
  });
});
