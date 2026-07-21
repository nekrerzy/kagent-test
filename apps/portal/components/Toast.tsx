"use client";

import { createContext, useCallback, useContext, useState } from "react";

interface Toast {
  id: number;
  message: string;
}

interface ToastContextValue {
  showError: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showError = useCallback((message: string) => {
    const id = nextId++;
    setToasts((t) => [...t, { id, message }]);
    setTimeout(() => {
      setToasts((t) => t.filter((toast) => toast.id !== id));
    }, 6000);
  }, []);

  const dismiss = (id: number) =>
    setToasts((t) => t.filter((toast) => toast.id !== id));

  return (
    <ToastContext.Provider value={{ showError }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="surface flex max-w-sm items-start gap-3 rounded-md border-l-4 px-4 py-3 text-sm shadow-lg"
            style={{ borderLeftColor: "var(--danger)" }}
          >
            <span className="flex-1">{toast.message}</span>
            <button
              onClick={() => dismiss(toast.id)}
              className="text-xs opacity-60 hover:opacity-100"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
