/** Origins allowed to embed the preview, and the only origins generated apps may call (App Cloud). */
export const allowedParents = (
  process.env.PREVIEW_ALLOWED_PARENTS || "http://localhost:3000"
).split(",");

/** Headers the preview origin must be served with, in development and production alike. */
export function securityHeaders(): Record<string, string> {
  return {
    "Content-Security-Policy": [
      "default-src 'self'",
      // Generated modules are evaluated with new Function() inside the sandboxed frame.
      "script-src 'self' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      // https: for ImageKit and the app's own images in production; the parents for local dev.
      `img-src 'self' data: blob: https: ${allowedParents.join(" ")}`,
      "font-src 'self'",
      // Generated apps may only call App Cloud on the app's own origin; nothing else. 'self' lets
      // a screen read the preview's own files (the icon font) when it renders itself to an image.
      `connect-src 'self' ${allowedParents.join(" ")}`,
      `frame-ancestors ${allowedParents.join(" ")}`,
    ].join("; "),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    // The frame has an opaque origin, so its font and asset requests are cross-origin.
    "Access-Control-Allow-Origin": "*",
  };
}
