/** The signed query of an OAuth authorization request (an MCP client connecting), if any. */
export function oauthQueryFrom(
  params: Record<string, string | string[] | undefined>,
): string | undefined {
  if (typeof params.sig !== "string" || typeof params.client_id !== "string") return undefined;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      query.append(key, v);
    }
  }
  return query.toString();
}

/** A same-site path to return to after signing in (never another origin). */
export function safeNextPath(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//"))
    return undefined;
  if (value.includes("\\") || /[\u0000-\u001f]/.test(value)) return undefined;
  return value;
}
