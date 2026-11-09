/** Make server data safe to pass to client components (Dates -> ISO strings). */
export function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
