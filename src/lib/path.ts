export function getAt(obj: object, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), obj)
}

// Immutable: copies only the objects along the path.
export function setAt<T>(obj: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split('.')
  const o = obj as Record<string, unknown>
  return { ...o, [head]: rest.length ? setAt(o[head] as object, rest.join('.'), value) : value } as T
}
