"use client";

import { useState } from "react";
import {
  ApiError,
  SkillIn,
  createSkill,
  deleteSkill,
  listSkills,
  slugifyName,
  uploadSkill,
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

  const [zipName, setZipName] = useState("");
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [zipDescription, setZipDescription] = useState("");
  const [zipTags, setZipTags] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zipFile) return;
    setUploading(true);
    try {
      await uploadSkill(zipName, zipFile, zipDescription || undefined, zipTags);
      setZipName("");
      setZipFile(null);
      setZipDescription("");
      setZipTags([]);
      const fileInput = document.getElementById("zip-file") as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";
      refetch();
    } catch (err) {
      showError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

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
        <h1 className="heading mb-6 text-xl">Skills</h1>
        {error && <ErrorBanner message={error} />}
        {loading && <p style={{ color: "var(--color-muted)" }}>Loading…</p>}
        {skills?.length === 0 && !loading && (
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            No skills yet.
          </p>
        )}
        {skills && skills.length > 0 && (
          <div className="table-shell overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Source</th>
                  <th>Path</th>
                  <th>Ref</th>
                  <th>Description</th>
                  <th>Tags</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {skills.map((skill) => (
                  <tr key={`${skill.namespace}/${skill.name}`}>
                    <td className="name-mono">{skill.name}</td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                      {skill.url ?? skill.image}
                      {skill.image && <span className="chip-uploaded ml-1.5">uploaded</span>}
                    </td>
                    <td style={{ color: "var(--color-muted)", fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                      {skill.path ?? "—"}
                    </td>
                    <td style={{ color: "var(--color-muted)", fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                      {skill.ref ?? "—"}
                    </td>
                    <td style={{ color: "var(--color-muted)" }}>{skill.description ?? "—"}</td>
                    <td>
                      {skill.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {skill.tags.map((tag) => (
                            <Tag key={tag}>{tag}</Tag>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="text-right">
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

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div>
          <h2 className="heading mb-2 text-lg">Upload skill (zip)</h2>
          <p className="mb-3 text-sm" style={{ color: "var(--color-muted)" }}>
            Zip a skill folder — a SKILL.md at the top plus any scripts and
            resources, subfolders included — and upload it. It is stored as an
            image in the platform registry; no git repo needed.
          </p>
          <form onSubmit={handleUpload} className="panel flex flex-col gap-5">
            <div>
              <label className="field-label" htmlFor="zip-name">
                Name
              </label>
              <input
                id="zip-name"
                required
                value={zipName}
                onChange={(e) => setZipName(slugifyName(e.target.value))}
                className="field-input font-mono"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="zip-file">
                Zip file
              </label>
              <input
                id="zip-file"
                type="file"
                required
                accept=".zip,application/zip"
                onChange={(e) => setZipFile(e.target.files?.[0] ?? null)}
                className="field-input"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="zip-description">
                Description
              </label>
              <input
                id="zip-description"
                value={zipDescription}
                onChange={(e) => setZipDescription(e.target.value)}
                className="field-input"
              />
            </div>
            <div>
              <label className="field-label">Tags</label>
              <TagsInput value={zipTags} onChange={setZipTags} />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary" disabled={uploading || !zipFile}>
                {uploading ? "Uploading…" : "Upload skill"}
              </button>
            </div>
          </form>
        </div>

        <div>
          <h2 className="heading mb-2 text-lg">New skill from git</h2>
          <p className="mb-3 text-sm" style={{ color: "var(--color-muted)" }}>
            Point at a git repo — optionally a subpath and ref — to register a
            skill that lives outside the platform.
          </p>
          <form onSubmit={handleSubmit} className="panel flex flex-col gap-5">
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
              <label className="field-label" htmlFor="url">
                Git URL
              </label>
              <input
                id="url"
                required
                placeholder="https://github.com/org/repo"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="field-input font-mono"
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
                className="field-input font-mono"
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
                className="field-input font-mono"
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
    </div>
  );
}
