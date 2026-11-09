import {
  instrumentForSelection,
  resolveRelative,
  transpile,
  type ProjectFiles,
} from "@appbuilder/contract";

export class ModuleError extends Error {
  constructor(
    readonly file: string,
    message: string,
  ) {
    super(message);
    this.name = "ModuleError";
  }
}

interface Module {
  exports: Record<string, unknown>;
}

/**
 * Evaluates a generated project's files as CommonJS modules in this (sandboxed) frame.
 * Bare imports resolve to the vendor registry only, so a project can never load anything
 * the contract does not allow.
 */
export function createModuleSystem(
  files: ProjectFiles,
  vendor: Readonly<Record<string, unknown>>,
  options: { instrument: boolean },
) {
  const paths = new Set(Object.keys(files));
  const cache = new Map<string, Module>();

  const load = (path: string): Record<string, unknown> => {
    const cached = cache.get(path);
    if (cached) return cached.exports;
    const source = files[path];
    if (source === undefined) throw new ModuleError(path, `File not found: ${path}`);

    const module: Module = { exports: {} };
    cache.set(path, module);

    if (path.endsWith(".json")) {
      module.exports = JSON.parse(source) as Record<string, unknown>;
      return module.exports;
    }

    const code =
      options.instrument && path.endsWith(".tsx") ? instrumentForSelection(path, source) : source;
    const result = transpile(path, code);
    if (!result.ok) {
      cache.delete(path);
      throw new ModuleError(path, result.message);
    }

    const require = (specifier: string): unknown => {
      if (specifier.startsWith(".")) {
        const resolved = resolveRelative(path, specifier, paths);
        if (!resolved) throw new ModuleError(path, `Cannot resolve "${specifier}" from ${path}`);
        return load(resolved);
      }
      if (specifier in vendor) return vendor[specifier];
      throw new ModuleError(path, `Module "${specifier}" is not available in the preview`);
    };

    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const factory = new Function(
        "require",
        "module",
        "exports",
        `${result.code}\n//# sourceURL=app:///${path}`,
      );
      factory(require, module, module.exports);
    } catch (error) {
      cache.delete(path);
      if (error instanceof ModuleError) throw error;
      throw new ModuleError(path, (error as Error).message);
    }
    return module.exports;
  };

  return { require: load };
}
