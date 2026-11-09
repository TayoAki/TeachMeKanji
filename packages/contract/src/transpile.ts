import { transform } from "sucrase";

export type TranspileResult = { ok: true; code: string } | { ok: false; message: string };

/** TSX -> CommonJS (React automatic runtime). Used by the validator and the preview runtime. */
export function transpile(path: string, source: string): TranspileResult {
  try {
    const { code } = transform(source, {
      transforms: ["typescript", "jsx", "imports"],
      jsxRuntime: "automatic",
      production: true,
      filePath: path,
    });
    return { ok: true, code };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}
