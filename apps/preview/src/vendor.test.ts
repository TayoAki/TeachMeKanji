import { describe, expect, it } from "vitest";
import { IMPORTABLE_MODULES } from "@appbuilder/contract";
import { vendorModules } from "./vendor";

describe("vendor registry", () => {
  it("provides every module and named export the contract allows", () => {
    for (const [name, allowed] of Object.entries(IMPORTABLE_MODULES)) {
      const module = vendorModules[name] as Record<string, unknown> | undefined;
      expect(module, `missing vendor module ${name}`).toBeDefined();
      if (allowed === "*") continue;
      for (const exported of allowed) {
        expect(module![exported], `${name} is missing export ${exported}`).toBeDefined();
      }
    }
  });

  it("does not expose modules the contract forbids", () => {
    const extra = Object.keys(vendorModules).filter(
      (name) => !(name in IMPORTABLE_MODULES) && name !== "react/jsx-runtime",
    );
    expect(extra).toEqual([]);
  });
});
