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
        <h1 className="heading mb-6 text-xl">Model configs</h1>
        {error && <ErrorBanner message={error} />}
        {loading && <p style={{ color: "var(--color-muted)" }}>Loading…</p>}
        {configs?.length === 0 && !loading && (
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            No model configs yet.
          </p>
        )}
        {configs && configs.length > 0 && (
          <div className="table-shell overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Provider</th>
                  <th>Model</th>
                  <th>Base URL</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {configs.map((mc) => (
                  <tr key={`${mc.namespace}/${mc.name}`}>
                    <td className="name-mono">{mc.name}</td>
                    <td>
                      <span className="pill">{mc.provider}</span>
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}>{mc.model}</td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--color-muted)" }}>
                      {mc.base_url ?? "—"}
                    </td>
                    <td>
                      <ReadyBadge ready={mc.ready} />
                    </td>
                    <td className="text-right">
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
        <h2 className="heading mb-4 text-lg">New model config</h2>
        <form onSubmit={handleSubmit} className="panel flex max-w-2xl flex-col gap-5">
          <div>
            <label className="field-label" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              required
              value={name}
              onChange={(e) => setName(slugifyName(e.target.value))}
              className="field-input font-mono"
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
              className="field-input font-mono"
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
              className="field-input font-mono"
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
            <p className="mt-1 text-xs" style={{ color: "var(--color-muted)" }}>
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
