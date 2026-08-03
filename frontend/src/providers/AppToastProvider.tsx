import { useEffect, type ReactNode } from 'react';
import { registerExternalToast, ToastProvider, useToast } from './ToastProvider';

function ToastBridge({ children }: { children: ReactNode }) {
  const { showToast } = useToast();
  useEffect(() => {
    registerExternalToast(showToast);
    return () => registerExternalToast(null);
  }, [showToast]);
  return children;
}

export function AppToastProvider({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ToastBridge>{children}</ToastBridge>
    </ToastProvider>
  );
}
