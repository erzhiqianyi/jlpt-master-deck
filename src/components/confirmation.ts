import { createContext, useContext } from 'react';

export type ConfirmationOptions = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
};
export const ConfirmationContext = createContext<(options: ConfirmationOptions) => Promise<boolean>>(() => Promise.resolve(false));
export function useConfirmation() { return useContext(ConfirmationContext); }
