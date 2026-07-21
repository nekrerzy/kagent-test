"use client";

import { useState } from "react";
import {
  ApiError,
  SkillIn,
  createSkill,
  deleteSkill,
  listSkills,
  slugifyName,
} from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useToast } from "@/components/Toast";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ConfirmButton } from "@/components/ConfirmButton";
import { TagsInput } from "@/components/TagsInput";
import { Tag } from "@/components/Badge";

export default function SkillsPage() {
  const { showError } = useToast();
  const { data: skills, error, loading, refetch } = useApi(listSkills, []);

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [path, setPath] = useState("");
  const [ref, setRef] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const input: SkillIn = {
        name,
        url,
        path: path || undefined,
        ref: ref || undefined,
        description: description || undefined,
        tags,
      };
      await createSkill(input);
      setName("");
      setUrl("");
      setPath("");
      setRef("");
      setDescription("");
      setTags([]);
      refetch();
    } catch (err) {
      showError(err instanceof ApiError ? err.message : "Failed to create skill");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="mb-6 text-xl font-semibold">Skills</h1>
        {error && <ErrorBanner message={error} />}
        {loading && <p style={{ color: "var(--muted)" }}>Loading…</p>}
        {skills?.length === 0 && !loading && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No skills yet.
          </p>
        )}
        {skills && skills.length > 0 && (
          <div className="surface overflow-x-auto rounded-md">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Git URL</th>
                  <th className="px-3 py-2 font-medium">Path</th>
                  <th className="px-3 py-2 font-medium">Ref</th>
                  <th className="px-3 py-2 font-medium">Description</th>
                  <th className="px-3 py-2 font-medium">Tags</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {skills.map((skill) => (
                  <tr
                    key={`${skill.namespace}/${skill.name}`}
                    className="border-b last:border-0"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <td className="px-3 py-2">{skill.name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{skill.url}</td>
                    <td className="px-3 py-2 text-xs" style={{ color: "var(--muted)" }}>
                      {skill.path ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs" style={{ color: "var(--muted)" }}>
                      {skill.ref ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs" style={{ color: "var(--muted)" }}>
                      {skill.description ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      {skill.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {skill.tags.map((tag) => (
                            <Tag key={tag}>{tag}</Tag>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <ConfirmButton
                        label="Delete"
                        confirmMessage={`Delete skill "${skill.name}"? This cannot be undone.`}
                        onConfirm={async () => {
                          try {
                            await deleteSkill(skill.namespace, skill.name);
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
        <h2 className="mb-4 text-lg font-semibold">New skill</h2>
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
            <label className="field-label" htmlFor="url">
              Git URL
            </label>
            <input
              id="url"
              required
              placeholder="https://github.com/org/repo"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="field-input"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="path">
              Path
            </label>
            <input
              id="path"
              placeholder="skills/my-skill"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              className="field-input"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="ref">
              Ref
            </label>
            <input
              id="ref"
              placeholder="main"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              className="field-input"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="description">
              Description
            </label>
            <input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="field-input"
            />
          </div>

          <div>
            <label className="field-label">Tags</label>
            <TagsInput value={tags} onChange={setTags} />
          </div>

          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? "Creating…" : "Create skill"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
