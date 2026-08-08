/**
 * Optional write allowlist for Metabase collection IDs.
 *
 * When METABASE_WRITABLE_COLLECTION_IDS is unset/empty: no extra restriction
 * (upstream-friendly; Metabase API key permissions still apply).
 * When set (e.g. "250,481"): card/dashboard creates and mutations must target
 * one of those collection IDs.
 */

export function getWritableCollectionIds() {
  const raw = process.env.METABASE_WRITABLE_COLLECTION_IDS || '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n));
}

/**
 * @param {number|null|undefined} collectionId
 * @param {string} action short label for error text
 * @throws {Error} when allowlist is active and collectionId is not allowed
 */
export function assertWritableCollection(collectionId, action) {
  const allowed = getWritableCollectionIds();
  if (allowed.length === 0) {
    return;
  }

  const id = collectionId == null ? null : Number(collectionId);
  if (id == null || !Number.isFinite(id) || !allowed.includes(id)) {
    throw new Error(
      `Write blocked: collection ${collectionId ?? 'Root/null'} is not in ` +
        `METABASE_WRITABLE_COLLECTION_IDS (${allowed.join(', ')}). Action: ${action}`
    );
  }
}
