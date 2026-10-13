/**
 * Safe mb_card_update for native Mongo (DEV-681; extends DEV-828).
 *
 * - Classic `type:native`: merge query/collection/template-tags.
 * - Lib/stages native: update stage 0 in place (do not rewrite to classic —
 *   that wipe often drops parameters[].id).
 */

import { extractTemplateTagsFromDatasetQuery } from './card-query-params.js';

export function isMongoNativeDatasetQuery(datasetQuery) {
  if (!datasetQuery || typeof datasetQuery !== 'object') return false;

  if (datasetQuery.type === 'native' && datasetQuery.native && typeof datasetQuery.native === 'object') {
    return Object.prototype.hasOwnProperty.call(datasetQuery.native, 'collection');
  }

  if (datasetQuery['lib/type'] === 'mbql/query' && Array.isArray(datasetQuery.stages)) {
    const stage = datasetQuery.stages[0] || {};
    if (stage['lib/type'] === 'mbql.stage/native' || stage.native != null) {
      if (Object.prototype.hasOwnProperty.call(stage, 'collection')) return true;
      return (
        stage.native &&
        typeof stage.native === 'object' &&
        Object.prototype.hasOwnProperty.call(stage.native, 'collection')
      );
    }
  }

  return false;
}

export function extractNativeCollection(datasetQuery) {
  if (!datasetQuery || typeof datasetQuery !== 'object') return null;

  if (datasetQuery.type === 'native' && datasetQuery.native && typeof datasetQuery.native === 'object') {
    const c = datasetQuery.native.collection;
    return typeof c === 'string' && c.trim() !== '' ? c.trim() : null;
  }

  if (datasetQuery['lib/type'] === 'mbql/query' && Array.isArray(datasetQuery.stages)) {
    const stage = datasetQuery.stages[0] || {};
    if (typeof stage.collection === 'string' && stage.collection.trim() !== '') {
      return stage.collection.trim();
    }
    if (stage.native && typeof stage.native === 'object') {
      const c = stage.native.collection;
      return typeof c === 'string' && c.trim() !== '' ? c.trim() : null;
    }
  }

  return null;
}

function parseTemplateTagsArg(templateTags) {
  if (templateTags === undefined) return undefined;
  if (typeof templateTags === 'string') return JSON.parse(templateTags);
  return templateTags;
}

function resolveCollection(existingCard, mongoCollection) {
  const current = existingCard?.dataset_query || {};
  const explicit =
    mongoCollection !== undefined && mongoCollection !== null && String(mongoCollection).trim() !== ''
      ? String(mongoCollection).trim()
      : undefined;
  const preserved = extractNativeCollection(current) || undefined;
  const collection = explicit ?? preserved;
  const isMongo =
    explicit !== undefined || isMongoNativeDatasetQuery(current) || preserved !== undefined;

  if (isMongo && !collection) {
    throw new Error(
      'Mongo native update requires mongo_collection (card has no persisted collection to preserve)'
    );
  }

  return { collection, isMongo };
}

function resolveTemplateTags(existingCard, templateTags) {
  const parsed = parseTemplateTagsArg(templateTags);
  if (parsed !== undefined) return parsed;
  const fromCard = extractTemplateTagsFromDatasetQuery(existingCard?.dataset_query);
  if (fromCard && typeof fromCard === 'object') return fromCard;
  return undefined;
}

function updateLibStagesNative(existingCard, nativeQuery, mongoCollection, templateTags) {
  const current = existingCard.dataset_query;
  const { collection } = resolveCollection(existingCard, mongoCollection);
  const tags = resolveTemplateTags(existingCard, templateTags);
  const database = current.database ?? existingCard.database_id;

  const stages = current.stages.map((stage, index) => {
    if (index !== 0) return stage;
    const next = { ...stage };

    if (typeof next.native === 'object' && next.native !== null) {
      next.native = { ...next.native, query: nativeQuery };
      if (collection) next.native.collection = collection;
      if (tags !== undefined) next.native['template-tags'] = tags;
    } else {
      next.native = nativeQuery;
    }

    if (collection) next.collection = collection;
    if (tags !== undefined) next['template-tags'] = tags;

    return next;
  });

  return {
    ...current,
    database,
    stages,
  };
}

function updateClassicNative(existingCard, nativeQuery, mongoCollection, templateTags) {
  const current = existingCard?.dataset_query || {};
  const database = current.database ?? existingCard?.database_id;
  const { collection } = resolveCollection(existingCard, mongoCollection);
  const tags = resolveTemplateTags(existingCard, templateTags);
  const prevNative =
    current.type === 'native' && current.native && typeof current.native === 'object'
      ? current.native
      : {};

  const native = {
    ...prevNative,
    query: nativeQuery,
  };

  if (collection) native.collection = collection;
  if (tags !== undefined) native['template-tags'] = tags;

  return {
    type: 'native',
    database,
    native,
  };
}

export function buildNativeDatasetQueryUpdate(
  existingCard,
  nativeQuery,
  mongoCollection,
  templateTags
) {
  const current = existingCard?.dataset_query || {};

  if (current['lib/type'] === 'mbql/query' && Array.isArray(current.stages)) {
    const stage = current.stages[0] || {};
    if (stage['lib/type'] === 'mbql.stage/native' || stage.native != null) {
      return updateLibStagesNative(existingCard, nativeQuery, mongoCollection, templateTags);
    }
  }

  return updateClassicNative(existingCard, nativeQuery, mongoCollection, templateTags);
}

/**
 * One-level deep merge so stackable / series_settings / graph patches do not wipe siblings.
 * Arrays (e.g. graph.dimensions) replace.
 */
export function mergeVisualizationSettings(existing, patch) {
  if (patch == null || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {};

  for (const [key, value] of Object.entries(patch)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      base[key] &&
      typeof base[key] === 'object' &&
      !Array.isArray(base[key])
    ) {
      base[key] = { ...base[key], ...value };
    } else {
      base[key] = value;
    }
  }

  return base;
}
