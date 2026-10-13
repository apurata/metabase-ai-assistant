/**
 * Dashboard tabs + dashcard PUT payloads.
 * Metabase has no POST /tabs: create tabs with a negative id on PUT /api/dashboard/:id.
 * Omitting a tab or dashcard from that PUT deletes it.
 */

export function dashcardsOf(dashboard) {
  return dashboard?.dashcards || dashboard?.ordered_cards || [];
}

export function formatTabList(tabs) {
  return (tabs || []).map((t) => `[${t.id}] ${t.name}`).join(', ');
}

/**
 * Dashboards with tabs require dashboard_tab_id (no silent default to the first tab).
 * Dashboards without tabs keep a single canvas (null tab).
 */
export function resolveDashboardTabId(dashboard, requestedTabId) {
  const tabs = dashboard?.tabs || [];
  if (tabs.length === 0) {
    return requestedTabId ?? null;
  }
  if (requestedTabId == null) {
    throw new Error(
      `dashboard_tab_id is required: this dashboard has ${tabs.length} tab(s): ${formatTabList(tabs)}`
    );
  }
  const tab = tabs.find((t) => t.id === requestedTabId);
  if (!tab) {
    throw new Error(
      `dashboard_tab_id ${requestedTabId} not found. Tabs: ${formatTabList(tabs)}`
    );
  }
  return requestedTabId;
}

export function serializeDashcardForPut(card) {
  return {
    id: card.id,
    card_id: card.card_id ?? null,
    row: card.row,
    col: card.col,
    size_x: card.size_x,
    size_y: card.size_y,
    dashboard_tab_id: card.dashboard_tab_id ?? null,
    parameter_mappings: card.parameter_mappings || [],
    visualization_settings: card.visualization_settings || {},
    series: card.series || [],
  };
}

export function serializeTabForPut(tab) {
  return { id: tab.id, name: tab.name };
}

export function buildCreateTabPutBody(dashboard, name) {
  const existingTabs = (dashboard.tabs || []).map(serializeTabForPut);
  const tabs = [...existingTabs, { id: -1, name }];
  let dashcards = dashcardsOf(dashboard).map(serializeDashcardForPut);
  if (existingTabs.length === 0) {
    dashcards = dashcards.map((c) => ({ ...c, dashboard_tab_id: -1 }));
  }
  return { tabs, dashcards };
}

export function buildAddCardPutBody(dashboard, cardId, options = {}) {
  const tabId = resolveDashboardTabId(dashboard, options.dashboard_tab_id);
  return {
    tabs: (dashboard?.tabs || []).map(serializeTabForPut),
    dashcards: [
      ...dashcardsOf(dashboard).map(serializeDashcardForPut),
      {
        id: -1,
        card_id: cardId,
        row: options.row || 0,
        col: options.col || 0,
        size_x: options.sizeX || options.size_x || 4,
        size_y: options.sizeY || options.size_y || 4,
        dashboard_tab_id: tabId,
        parameter_mappings: options.parameter_mappings || [],
        visualization_settings: options.visualization_settings || {},
        series: [],
      },
    ],
  };
}

/** Metabase virtual dashcard (Add a text or heading) — card_id null. */
export function buildVirtualTextVisualizationSettings(text, display = 'text') {
  const kind = display === 'heading' ? 'heading' : 'text';
  return {
    virtual_card: {
      name: null,
      display: kind,
      visualization_settings: {},
      dataset_query: {},
      archived: false,
    },
    text,
  };
}

/**
 * Add or update a virtual text/heading dashcard via PUT /api/dashboard/:id.
 * Pass dashcard_id to edit an existing virtual card; omit to create (id: -1).
 */
export function buildAddTextPutBody(dashboard, options = {}) {
  const display = options.display === 'heading' ? 'heading' : 'text';
  const text = options.text;
  const tabs = (dashboard?.tabs || []).map(serializeTabForPut);

  if (options.dashcard_id != null) {
    const cards = dashcardsOf(dashboard);
    const target = cards.find((c) => c.id === options.dashcard_id);
    if (!target) {
      throw new Error(`dashcard_id ${options.dashcard_id} not found on dashboard`);
    }
    if (target.card_id != null) {
      throw new Error(
        `dashcard_id ${options.dashcard_id} is a question card (card_id=${target.card_id}); only virtual text/heading cards can be edited with mb_dashboard_add_text`
      );
    }
    if (options.dashboard_tab_id !== undefined) {
      resolveDashboardTabId(dashboard, options.dashboard_tab_id);
    }
    const nextText =
      text !== undefined && text !== null ? String(text) : (target.visualization_settings?.text ?? '');
    if (!String(nextText).trim()) {
      throw new Error('text is required (non-empty) when creating or clearing is not allowed');
    }
    return {
      tabs,
      dashcards: cards.map((c) => {
        if (c.id !== options.dashcard_id) return serializeDashcardForPut(c);
        const next = serializeDashcardForPut(c);
        if (options.row !== undefined) next.row = options.row;
        if (options.col !== undefined) next.col = options.col;
        if (options.size_x !== undefined || options.sizeX !== undefined) {
          next.size_x = options.size_x ?? options.sizeX;
        }
        if (options.size_y !== undefined || options.sizeY !== undefined) {
          next.size_y = options.size_y ?? options.sizeY;
        }
        if (options.dashboard_tab_id !== undefined) {
          next.dashboard_tab_id = options.dashboard_tab_id;
        }
        next.visualization_settings = buildVirtualTextVisualizationSettings(nextText, display);
        return next;
      }),
    };
  }

  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('text is required (non-empty markdown/plain string)');
  }
  const tabId = resolveDashboardTabId(dashboard, options.dashboard_tab_id);
  return {
    tabs,
    dashcards: [
      ...dashcardsOf(dashboard).map(serializeDashcardForPut),
      {
        id: -1,
        card_id: null,
        row: options.row ?? 0,
        col: options.col ?? 0,
        size_x: options.size_x ?? options.sizeX ?? (display === 'heading' ? 24 : 18),
        size_y: options.size_y ?? options.sizeY ?? (display === 'heading' ? 1 : 2),
        dashboard_tab_id: tabId,
        parameter_mappings: [],
        visualization_settings: buildVirtualTextVisualizationSettings(text, display),
        series: [],
      },
    ],
  };
}

export function applyDashcardLayoutUpdate(dashcard, args) {
  const next = serializeDashcardForPut(dashcard);
  if (args.row !== undefined) next.row = args.row;
  if (args.col !== undefined) next.col = args.col;
  if (args.size_x !== undefined) next.size_x = args.size_x;
  if (args.size_y !== undefined) next.size_y = args.size_y;
  if (args.dashboard_tab_id !== undefined) next.dashboard_tab_id = args.dashboard_tab_id;
  return next;
}

export function summarizeCollections(collections, parentId) {
  const list = Array.isArray(collections) ? collections : [];
  const withoutPersonal = list.filter((c) => !c.personal_owner_id);
  const toRow = (c) => ({
    id: c.id,
    name: c.name,
    parent_id: c.parent_id ?? null,
  });
  if (parentId == null) {
    return withoutPersonal.map(toRow);
  }
  const byId = new Map(withoutPersonal.map((c) => [String(c.id), c]));
  const isDescendant = (col) => {
    let current = col;
    const seen = new Set();
    while (current && current.parent_id != null) {
      if (String(current.parent_id) === String(parentId)) return true;
      const key = String(current.id);
      if (seen.has(key)) break;
      seen.add(key);
      current = byId.get(String(current.parent_id));
    }
    return false;
  };
  return withoutPersonal.filter(isDescendant).map(toRow);
}

export const EMPTY_COLLECTION_LIST = { collections: [], count: 0 };
