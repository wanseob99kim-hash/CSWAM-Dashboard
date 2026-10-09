export function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function mergeUniqueById<T extends { id: string }>(current: T[], additions: T[]) {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...additions.filter((item) => !seen.has(item.id))];
}
