/**
 * Dashboard tabs + dashcard PUT payloads.
 * Metabase has no POST /tabs: create tabs with a negative id on PUT /api/dashboard/:id.
 * Omitting a tab or dashcard from that PUT deletes it.
 */

export function dashcardsOf(dashboard) {
  return dashboard.dashcards || dashboard.ordered_cards || [];
}

export function formatTabList(tabs) {
  return (tabs || []).map((t) => `[${t.id}] ${t.name}`).join(', ');
}

/**
 * Dashboards with tabs require dashboard_tab_id (no silent default to the first tab).
 * Dashboards without tabs keep a single canvas (null tab).
 */
export function resolveDashboardTabId(dashboard, requestedTabId) {
  const tabs = dashboard.tabs || [];
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
    tabs: (dashboard.tabs || []).map(serializeTabForPut),
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
