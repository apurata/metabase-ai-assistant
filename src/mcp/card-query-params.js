/**
 * Normalize mb_card_data parameters for POST /api/card/:id/query (DEV-681).
 *
 * Accepts:
 * - Metabase array: [{ id, type, target, value }, ...]
 * - Apurata shorthand object: { created: "past120days~" }
 * - JSON string of either
 */

export function parseParametersArg(parameters) {
  if (parameters == null || parameters === '') return null;
  if (typeof parameters === 'string') {
    try {
      return JSON.parse(parameters);
    } catch {
      return parameters;
    }
  }
  return parameters;
}

export function extractTemplateTagsFromDatasetQuery(datasetQuery) {
  if (!datasetQuery || typeof datasetQuery !== 'object') return null;

  if (datasetQuery.type === 'native' && datasetQuery.native && typeof datasetQuery.native === 'object') {
    const tags = datasetQuery.native['template-tags'];
    if (tags && typeof tags === 'object') return tags;
  }

  if (datasetQuery['lib/type'] === 'mbql/query' && Array.isArray(datasetQuery.stages)) {
    const stage = datasetQuery.stages[0] || {};
    if (stage['template-tags'] && typeof stage['template-tags'] === 'object') {
      return stage['template-tags'];
    }
    if (stage.native && typeof stage.native === 'object' && stage.native['template-tags']) {
      return stage.native['template-tags'];
    }
  }

  return null;
}

export function inferParamTypeFromValue(value) {
  if (typeof value === 'number') return 'number/=';
  if (Array.isArray(value)) return 'string/=';
  if (typeof value === 'string') {
    if (
      /^(past|next)\d+(day|days|week|weeks|month|months|year|years)~?$/i.test(value) ||
      /^(this|last|previous)(day|week|month|year|quarter)/i.test(value) ||
      value === 'today' ||
      value === 'yesterday'
    ) {
      return 'date/relative';
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'date/single';
  }
  return 'category';
}

export function paramTypeFromTemplateTag(tag) {
  if (!tag || typeof tag !== 'object') return 'category';
  if (typeof tag['widget-type'] === 'string' && tag['widget-type']) return tag['widget-type'];
  if (tag.type === 'date') return 'date/single';
  if (tag.type === 'number') return 'number/=';
  if (tag.type === 'dimension') return 'string/=';
  if (tag.type === 'text') return 'string/=';
  return 'category';
}

export function targetFromTemplateTag(name, tag) {
  if (tag && tag.type === 'dimension') {
    return ['dimension', ['template-tag', name]];
  }
  return ['variable', ['template-tag', name]];
}

function findCardParameter(cardParams, key) {
  if (!Array.isArray(cardParams)) return null;
  return (
    cardParams.find(
      (p) => p && (p.slug === key || p.name === key || p.id === key || String(p.id) === String(key))
    ) || null
  );
}

/**
 * @param {unknown} parameters - parsed parameters arg
 * @param {object|null} card - Metabase card (required for object shorthand)
 * @returns {Array<object>|null}
 */
export function normalizeCardQueryParameters(parameters, card = null) {
  const parsed = parseParametersArg(parameters);
  if (parsed == null) return null;

  if (Array.isArray(parsed)) {
    return parsed.length > 0 ? parsed : null;
  }

  if (typeof parsed !== 'object') {
    throw new Error('parameters must be an array, a slug→value object, or a JSON string of either');
  }

  const entries = Object.entries(parsed);
  if (entries.length === 0) return null;

  const cardParams = card?.parameters || [];
  const tags = extractTemplateTagsFromDatasetQuery(card?.dataset_query);

  return entries.map(([key, value]) => {
    const fromCard = findCardParameter(cardParams, key);
    if (fromCard) {
      return {
        id: fromCard.id != null && String(fromCard.id).trim() !== '' ? String(fromCard.id) : key,
        type: fromCard.type || inferParamTypeFromValue(value),
        target: fromCard.target || ['dimension', ['template-tag', key]],
        value,
      };
    }

    const tag = tags?.[key];
    if (tag && typeof tag === 'object') {
      const id =
        tag.id != null && String(tag.id).trim() !== '' ? String(tag.id) : key;
      return {
        id,
        type: paramTypeFromTemplateTag(tag),
        target: targetFromTemplateTag(key, tag),
        value,
      };
    }

    return {
      id: key,
      type: inferParamTypeFromValue(value),
      target: ['dimension', ['template-tag', key]],
      value,
    };
  });
}
