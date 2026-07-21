"use client";

import { useState } from "react";
import {
  ApiError,
  ModelConfigIn,
  ModelProvider,
  createModelConfig,
  deleteModelConfig,
  listModelConfigs,
  slugifyName,
} from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useToast } from "@/components/Toast";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ReadyBadge } from "@/components/Badge";
import { ConfirmButton } from "@/components/ConfirmButton";

const PROVIDERS: ModelProvider[] = [
  "OpenAI",
  "Anthropic",
  "AzureOpenAI",
  "Ollama",
  "Gemini",
  "GeminiVertexAI",
  "AnthropicVertexAI",
];

export default function ModelConfigsPage() {
  const { showError } = useToast();
  const { data: configs, error, loading, refetch } = useApi(listModelConfigs, []);

  const [name, setName] = useState("");
  const [provider, setProvider] = useState<ModelProvider>("OpenAI");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const input: ModelConfigIn = {
        name,
        provider,
        model,
        base_url: baseUrl || undefined,
        api_key: apiKey || undefined,
      };
      await createModelConfig(input);
      setName("");
      setModel("");
      setBaseUrl("");
      setApiKey("");
      refetch();
    } catch (err) {
      showError(err instanceof ApiError ? err.message : "Failed to create model config");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="mb-6 text-xl font-semibold">Model configs</h1>
        {error && <ErrorBanner message={error} />}
        {loading && <p style={{ color: "var(--muted)" }}>Loading…</p>}
        {configs?.length === 0 && !loading && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No model configs yet.
          </p>
        )}
        {configs && configs.length > 0 && (
          <div className="surface overflow-x-auto rounded-md">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Provider</th>
                  <th className="px-3 py-2 font-medium">Model</th>
                  <th className="px-3 py-2 font-medium">Base URL</th>
                  <th className="px-3 py-2 font-medium">Ready</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {configs.map((mc) => (
                  <tr key={`${mc.namespace}/${mc.name}`} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-2">{mc.name}</td>
                    <td className="px-3 py-2">{mc.provider}</td>
                    <td className="px-3 py-2 font-mono text-xs">{mc.model}</td>
                    <td className="px-3 py-2 text-xs" style={{ color: "var(--muted)" }}>
                      {mc.base_url ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <ReadyBadge ready={mc.ready} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <ConfirmButton
                        label="Delete"
                        confirmMessage={`Delete model config "${mc.name}"? This cannot be undone.`}
                        onConfirm={async () => {
                          try {
                            await deleteModelConfig(mc.namespace, mc.name);
                            refetch();
                          } catch (err) {
                            showError(err instanceof Error ? err.message : "Delete failed");
                          }
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold">New model config</h2>
        <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-5">
          <div>
            <label className="field-label" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              required
              value={name}
              onChange={(e) => setName(slugifyName(e.target.value))}
              className="field-input"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="provider">
              Provider
            </label>
            <select
              id="provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value as ModelProvider)}
              className="field-input"
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label" htmlFor="model">
              Model
            </label>
            <input
              id="model"
              required
              placeholder="e.g. gpt-oss"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="field-input"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="base_url">
              Base URL
            </label>
            <input
              id="base_url"
              placeholder="http://10.20.0.1:9292/v1"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="field-input"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="api_key">
              API key
            </label>
            <input
              id="api_key"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="field-input"
            />
            <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
              Stored as a cluster Secret. It will never be shown again after saving.
            </p>
          </div>

          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? "Creating…" : "Create model config"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
