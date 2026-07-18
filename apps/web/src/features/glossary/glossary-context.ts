import { createContext, useContext } from 'react';

export interface GlossaryHandle {
  open: (termId?: string) => void;
}

export const GlossaryContext = createContext<GlossaryHandle>({ open: () => undefined });

export function useGlossary(): GlossaryHandle {
  return useContext(GlossaryContext);
}
