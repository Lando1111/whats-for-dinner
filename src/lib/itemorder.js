// Order of shopping items within a section. Items carry sort_key (set by dragging); items without one
// come after, oldest first, so new items land at the bottom.
const GAP = 1024;

export function byPlace(a, b) {
  const ka = a.sort_key ?? Infinity, kb = b.sort_key ?? Infinity;
  if (ka !== kb) return ka < kb ? -1 : 1;
  return String(a.created_at || '').localeCompare(String(b.created_at || ''));
}

// `order` is the section's items in their new order, including the one that was dragged (`id`).
// Returns the sort_key changes to save: usually just the dragged item, or the whole section the
// first time (when some items haven't been placed yet) or when keys get too close together.
export function placeItem(order, id) {
  const i = order.findIndex((x) => x.id === id);
  if (i < 0) return [];
  const others = order.filter((x) => x.id !== id);
  const prev = order[i - 1]?.sort_key, next = order[i + 1]?.sort_key;
  const renumber = () => order.map((x, j) => ({ id: x.id, sort_key: (j + 1) * GAP })).filter((u, j) => order[j].sort_key !== u.sort_key);
  if (others.some((x) => x.sort_key == null)) return renumber();
  let key;
  if (prev == null && next == null) key = GAP;
  else if (prev == null) key = next - GAP;
  else if (next == null) key = prev + GAP;
  else key = (prev + next) / 2;
  if (prev != null && next != null && next - prev < 1e-6) return renumber();
  return [{ id, sort_key: key }];
}

// Move `id` to `index` in the list of `ids` (the dragged item counted out first).
export function moveTo(ids, id, index) {
  const rest = ids.filter((x) => x !== id);
  rest.splice(Math.max(0, Math.min(index, rest.length)), 0, id);
  return rest;
}
