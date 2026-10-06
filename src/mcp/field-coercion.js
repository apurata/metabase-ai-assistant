/**
 * Admin "Cast to a specific data type" strategies.
 * Mirrors metabase.types.core define-types! / define-non-inheritable-type!.
 * Bytes casts (ISO8601Bytes, YYYYMMDDHHMMSSBytes) are omitted: they target
 * base_type type/* and break Preview (DEV-612).
 */

export const UNCASTABLE_BASE_TYPE = 'type/*';

export const UNCASTABLE_HINT =
  'Metabase does not rewrite base_type type/* via Table Metadata cast. ' +
  'Projecting the column and Sync schema often still leave All Lend Metabase as type/* ' +
  '(sparse fingerprint or mixed values). Use All Lend Metabase Funded or a native query. ' +
  'See DEV-612, DEV-689, and DEV-348. ' +
  'Do not use Coercion/ISO8601Bytes->Temporal (it breaks Preview).';

/** Parent links for inheritable strategies (UNIX* and DateTime->Date). Exact match is always allowed. */
const TYPE_PARENTS = {
  'type/BigInteger': 'type/Integer',
  'type/Integer': 'type/Number',
  'type/Float': 'type/Number',
  'type/Decimal': 'type/Number',
  'type/DateTimeWithLocalTZ': 'type/DateTime',
  'type/DateTimeWithZoneID': 'type/DateTime',
  'type/DateTimeWithTZ': 'type/DateTime',
};

/**
 * inheritable: Metabase define-types! (isa? on base type).
 * Otherwise define-non-inheritable-type! (exact base type only).
 */
export const COERCION_STRATEGIES = {
  'Coercion/String->Float': { from: ['type/Text'], to: 'type/Float' },
  'Coercion/String->Integer': { from: ['type/Text'], to: 'type/Integer' },
  'Coercion/Float->Integer': { from: ['type/Float'], to: 'type/Integer' },
  'Coercion/ISO8601->Date': { from: ['type/Text'], to: 'type/Date' },
  'Coercion/ISO8601->Time': { from: ['type/Text'], to: 'type/Time' },
  'Coercion/ISO8601->DateTime': { from: ['type/Text'], to: 'type/DateTime' },
  'Coercion/YYYYMMDDHHMMSSString->Temporal': { from: ['type/Text'], to: 'type/DateTime' },
  'Coercion/DateTime->Date': { from: ['type/DateTime'], to: 'type/Date', inheritable: true },
  'Coercion/UNIXSeconds->DateTime': { from: ['type/Integer', 'type/Decimal'], to: 'type/Instant', inheritable: true },
  'Coercion/UNIXMilliSeconds->DateTime': { from: ['type/Integer', 'type/Decimal'], to: 'type/Instant', inheritable: true },
  'Coercion/UNIXMicroSeconds->DateTime': { from: ['type/Integer', 'type/Decimal'], to: 'type/Instant', inheritable: true },
  'Coercion/UNIXNanoSeconds->DateTime': { from: ['type/Integer', 'type/Decimal'], to: 'type/Instant', inheritable: true },
};

export const COERCION_STRATEGY_NAMES = Object.keys(COERCION_STRATEGIES);

function isa(baseType, parent) {
  let current = baseType;
  const seen = new Set();
  while (current && !seen.has(current)) {
    if (current === parent) return true;
    seen.add(current);
    current = TYPE_PARENTS[current];
  }
  return false;
}

function strategyAllows(spec, baseType) {
  if (spec.inheritable) return spec.from.some((parent) => isa(baseType, parent));
  return spec.from.includes(baseType);
}

export function effectiveTypeFor(strategy) {
  return COERCION_STRATEGIES[strategy]?.to ?? null;
}

/**
 * @returns {string|null} refusal message, or null when the cast is allowed
 */
export function coercionRefusal(baseType, strategy) {
  if (!strategy) return null;
  if (!baseType || baseType === UNCASTABLE_BASE_TYPE) {
    return `Cannot cast field with base_type ${baseType || '(missing)'}. ${UNCASTABLE_HINT}`;
  }
  const spec = COERCION_STRATEGIES[strategy];
  if (!spec) {
    return `Unknown coercion_strategy "${strategy}". Allowed: ${COERCION_STRATEGY_NAMES.join(', ')}.`;
  }
  if (!strategyAllows(spec, baseType)) {
    return (
      `coercion_strategy ${strategy} does not apply to base_type ${baseType}. ` +
      `Allowed base types: ${spec.from.join(', ')} (effective type ${spec.to}). ` +
      'Changing semantic_type does not cast the column.'
    );
  }
  return null;
}

export function isCastable(baseType) {
  if (!baseType || baseType === UNCASTABLE_BASE_TYPE) return false;
  return COERCION_STRATEGY_NAMES.some((name) => coercionRefusal(baseType, name) === null);
}

export function fieldStructured(field, { updated = false, error = null, fieldId = 0 } = {}) {
  const base = field?.base_type ?? '';
  const effective = field?.effective_type || base;
  return {
    field_id: field?.id ?? fieldId ?? 0,
    name: field?.name ?? '',
    display_name: field?.display_name ?? '',
    description: field?.description ?? null,
    base_type: base,
    effective_type: effective,
    database_type: field?.database_type ?? null,
    coercion_strategy: field?.coercion_strategy ?? null,
    semantic_type: field?.semantic_type ?? null,
    visibility_type: field?.visibility_type ?? '',
    has_field_values: field?.has_field_values ?? null,
    castable: isCastable(base),
    updated,
    error,
  };
}

export function formatFieldMetadataText(snap) {
  const header = snap.updated
    ? '✅ Field metadata updated'
    : `📋 Field metadata: ${snap.display_name || snap.name || snap.field_id}`;
  const lines = [
    header,
    `Field ID: ${snap.field_id}`,
    `Name: ${snap.name}`,
    `Display name: ${snap.display_name}`,
    `Description: ${snap.description || 'None'}`,
    `Base type: ${snap.base_type || 'None'}`,
    `Effective type: ${snap.effective_type || 'None'}`,
    `Database type: ${snap.database_type || 'None'}`,
    `Coercion strategy: ${snap.coercion_strategy || 'None'}`,
    `Semantic type: ${snap.semantic_type || 'None'}`,
    `Visibility: ${snap.visibility_type || 'None'}`,
    `Has field values: ${snap.has_field_values || 'None'}`,
    `Castable: ${snap.castable ? 'yes' : 'no'}`,
  ];
  if (snap.error) lines.push(`Error: ${snap.error}`);
  else if (snap.base_type === UNCASTABLE_BASE_TYPE) lines.push(UNCASTABLE_HINT);
  return lines.join('\n');
}

export function filterTableFields(fields, fieldName) {
  if (!fieldName) return fields || [];
  const needle = String(fieldName).toLowerCase();
  return (fields || []).filter((field) =>
    (field?.name || '').toLowerCase().includes(needle) ||
    (field?.display_name || '').toLowerCase().includes(needle)
  );
}

export function compactTableField(field) {
  const base = field?.base_type ?? '';
  return {
    id: field.id,
    name: field?.name ?? '',
    display_name: field?.display_name ?? '',
    base_type: base,
    effective_type: field?.effective_type || base,
    database_type: field?.database_type ?? null,
    coercion_strategy: field?.coercion_strategy ?? null,
  };
}

export function tableStructured(table, fields, { updated = false, error = null, tableId = 0 } = {}) {
  const rows = (fields || []).filter((field) => typeof field?.id === 'number').map(compactTableField);
  return {
    table_id: table?.id ?? tableId ?? 0,
    name: table?.name ?? '',
    display_name: table?.display_name ?? '',
    description: table?.description ?? null,
    visibility_type: table?.visibility_type ?? '',
    schema: table?.schema ?? null,
    field_count: rows.length,
    fields: rows,
    updated,
    error,
  };
}

const TABLE_FIELD_TEXT_LIMIT = 40;

export function formatTableMetadataText(snap) {
  const header = snap.updated
    ? '✅ Table metadata updated'
    : `📋 Table metadata: ${snap.display_name || snap.name || snap.table_id}`;
  const preview = snap.fields.slice(0, TABLE_FIELD_TEXT_LIMIT).map((field) =>
    `  - ${field.id} ${field.name} base=${field.base_type || 'none'} ` +
    `effective=${field.effective_type || 'none'} coercion=${field.coercion_strategy || 'none'}`
  );
  const extra = snap.fields.length > TABLE_FIELD_TEXT_LIMIT
    ? [`  ... ${snap.fields.length - TABLE_FIELD_TEXT_LIMIT} more in structuredContent.fields`]
    : [];
  const lines = [
    header,
    `Table ID: ${snap.table_id}`,
    `Name: ${snap.name}`,
    `Display name: ${snap.display_name}`,
    `Description: ${snap.description || 'None'}`,
    `Visibility: ${snap.visibility_type || 'None'}`,
    `Schema: ${snap.schema || 'None'}`,
  ];
  if (snap.updated) {
    lines.push('Fields: not reloaded on update');
  } else {
    lines.push(`Fields: ${snap.field_count}`, ...preview, ...extra);
  }
  if (snap.error) lines.push(`Error: ${snap.error}`);
  return lines.join('\n');
}

export function castDidNotApply(updated, strategy) {
  const expected = effectiveTypeFor(strategy);
  if (!expected) return `Unknown coercion_strategy "${strategy}".`;
  if (updated?.coercion_strategy === strategy && updated?.effective_type === expected) return null;
  const detail =
    `Cast did not apply (base_type=${updated?.base_type || 'none'}, ` +
    `effective_type=${updated?.effective_type || 'none'}, ` +
    `coercion_strategy=${updated?.coercion_strategy || 'none'}, expected effective type ${expected}).`;
  if (!updated?.base_type || updated.base_type === UNCASTABLE_BASE_TYPE) {
    return `${detail} ${UNCASTABLE_HINT}`;
  }
  return detail;
}
