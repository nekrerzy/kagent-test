"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DEFAULT_NAMESPACE, EnvironmentOut, createEnvironment, listEnvironments, slugifyName } from "./api";

const STORAGE_KEY = "kagent-portal-env";

interface EnvironmentContextValue {
  namespace: string;
  environments: EnvironmentOut[];
  loading: boolean;
  setNamespace: (namespace: string) => void;
  addEnvironment: (name: string) => Promise<void>;
}

const EnvironmentContext = createContext<EnvironmentContextValue | null>(null);

export function EnvironmentProvider({ children }: { children: React.ReactNode }) {
  const [environments, setEnvironments] = useState<EnvironmentOut[]>([]);
  const [namespace, setNamespaceState] = useState(DEFAULT_NAMESPACE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listEnvironments()
      .then((envs) => {
        if (cancelled) return;
        setEnvironments(envs);
        const stored = window.localStorage.getItem(STORAGE_KEY);
        const fallback = envs.find((e) => e.default)?.name ?? envs[0]?.name ?? DEFAULT_NAMESPACE;
        setNamespaceState(stored && envs.some((e) => e.name === stored) ? stored : fallback);
      })
      .catch(() => {
        // API unreachable — stay on the default namespace, no env list to switch between.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setNamespace = useCallback((ns: string) => {
    setNamespaceState(ns);
    window.localStorage.setItem(STORAGE_KEY, ns);
  }, []);

  const addEnvironment = useCallback(
    async (rawName: string) => {
      const name = slugifyName(rawName);
      if (!name) return;
      const created = await createEnvironment({ name });
      setEnvironments((prev) => [...prev, created]);
      setNamespace(created.name);
    },
    [setNamespace],
  );

  return (
    <EnvironmentContext.Provider value={{ namespace, environments, loading, setNamespace, addEnvironment }}>
      {children}
    </EnvironmentContext.Provider>
  );
}

export function useEnvironment(): EnvironmentContextValue {
  const ctx = useContext(EnvironmentContext);
  if (!ctx) throw new Error("useEnvironment must be used within EnvironmentProvider");
  return ctx;
}
