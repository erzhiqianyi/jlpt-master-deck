import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ConfirmationContext, type ConfirmationOptions } from './confirmation';

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmationOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const confirm = useCallback((options: ConfirmationOptions) => {
    // Ignore repeated activation while a confirmation is already open.
    if (resolver.current) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setRequest(options);
    });
  }, []);
  const finish = useCallback((accepted: boolean) => {
    dialog.current?.close();
    const resolve = resolver.current;
    resolver.current = null;
    setRequest(null);
    resolve?.(accepted);
  }, []);
  useEffect(() => {
    if (request && !dialog.current?.open) dialog.current?.showModal();
  }, [request]);
  useEffect(() => () => { resolver.current?.(false); resolver.current = null; }, []);

  return <ConfirmationContext.Provider value={confirm}>
    {children}
    <dialog ref={dialog} className="app-confirmation" aria-labelledby="confirmation-title" aria-describedby="confirmation-description"
      onCancel={(event) => { event.preventDefault(); finish(false); }}>
      {request && <>
        <div className="app-confirmation-body">
          <h2 id="confirmation-title">{request.title}</h2>
          <p id="confirmation-description">{request.description}</p>
        </div>
        <footer>
          <button type="button" autoFocus onClick={() => finish(false)}>{request.cancelLabel}</button>
          <button type="button" className={request.danger ? 'is-danger' : 'is-primary'} onClick={() => finish(true)}>{request.confirmLabel}</button>
        </footer>
      </>}
    </dialog>
  </ConfirmationContext.Provider>;
}
