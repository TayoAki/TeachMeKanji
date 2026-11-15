"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Factory mode (FACTORY_MODE=1, see factoryMode() in @appbuilder/core): the team's own app
 * factory, with no plans, credits or prices. Pages that render per request read the flag and
 * wrap their view in this provider, so any component can hide plan and credit copy.
 */
const FactoryContext = createContext(false);

export function FactoryProvider({ factory, children }: { factory: boolean; children: ReactNode }) {
  return <FactoryContext.Provider value={factory}>{children}</FactoryContext.Provider>;
}

export function useFactory(): boolean {
  return useContext(FactoryContext);
}
