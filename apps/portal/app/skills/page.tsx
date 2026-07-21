"use client";

import { useState } from "react";
import {
  ApiError,
  SkillIn,
  SkillOut,
  authorSkill,
  createSkill,
  deleteSkill,
  getSkillContent,
  listSkills,
  slugifyName,
  uploadSkill,
} from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useEnvironment } from "@/lib/environment";
import { useToast } from "@/components/Toast";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ConfirmButton } from "@/components/ConfirmButton";
import { TagsInput } from "@/components/TagsInput";
import { Tag } from "@/components/Badge";

const skillTemplate = (name: string) =>
  `---\nname: ${name || "<name>"}\ndescription: …\n---\n\n# Instructions\n…`;

export default function SkillsPage() {
  const { showError } = useToast();
  const { namespace } = useEnvironment();
  const { data: skills, error, loading, refetch } = useApi(
    () => listSkills(namespace),
    [namespace],
  );

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

  // "Author skill" panel — writes a SKILL.md straight into an image-backed
  // skill. `editingKey` locks the name field and tracks which skill's
  // versions/content we're replacing; null means "new skill" mode.
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [authorName, setAuthorName] = useState("");
  const [authorMd, setAuthorMd] = useState(skillTemplate(""));
  const [authorMdPristine, setAuthorMdPristine] = useState(true);
  const [authorDescription, setAuthorDescription] = useState("");
  const [authorTags, setAuthorTags] = useState<string[]>([]);
  const [authorVersions, setAuthorVersions] = useState<string[]>([]);
  const [authorCurrentTag, setAuthorCurrentTag] = useState<string | null>(null);
  const [authorLoading, setAuthorLoading] = useState(false);
  const [authorSubmitting, setAuthorSubmitting] = useState(false);

  const resetAuthorForm = () => {
    setEditingKey(null);
    setAuthorName("");
    setAuthorMd(skillTemplate(""));
    setAuthorMdPristine(true);
    setAuthorDescription("");
    setAuthorTags([]);
    setAuthorVersions([]);
    setAuthorCurrentTag(null);
  };

  const handleAuthorNameChange = (value: string) => {
    const slug = slugifyName(value);
    setAuthorName(slug);
    if (authorMdPristine) setAuthorMd(skillTemplate(slug));
  };

  const startEditSkill = async (skill: SkillOut) => {
    setEditingKey(`${skill.namespace}/${skill.name}`);
    setAuthorCurrentTag(skill.image?.split(":").pop() ?? null);
    setAuthorName(skill.name);
    setAuthorDescription(skill.description ?? "");
    setAuthorTags(skill.tags);
    setAuthorMdPristine(false);
    setAuthorLoading(true);
    setAuthorVersions([]);
    try {
      const content = await getSkillContent(skill.namespace, skill.name);
      setAuthorMd(content.skill_md);
      setAuthorVersions(content.versions);
    } catch (err) {
      showError(err instanceof ApiError ? err.message : "Failed to load skill content");
    } finally {
      setAuthorLoading(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zipFile) return;
    setUploading(true);
    try {
      await uploadSkill(zipName, zipFile, zipDescription || undefined, zipTags, namespace);
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
        namespace,
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

  const handleAuthorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthorSubmitting(true);
    try {
      await authorSkill({
        name: authorName,
        namespace,
        skill_md: authorMd,
        description: authorDescription || undefined,
        tags: authorTags,
      });
      resetAuthorForm();
      refetch();
    } catch (err) {
      showError(err instanceof ApiError ? err.message : "Failed to author skill");
    } finally {
      setAuthorSubmitting(false);
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
                      <div className="flex justify-end gap-2">
                        {skill.image && (
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => startEditSkill(skill)}
                          >
                            Edit
                          </button>
                        )}
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
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

        <div>
          <h2 className="heading mb-2 text-lg">Author skill</h2>
          <p className="mb-3 text-sm" style={{ color: "var(--color-muted)" }}>
            {editingKey
              ? "Editing an image-backed skill — saving writes a new version."
              : "Write a SKILL.md directly; it's stored as an image-backed skill, no zip or git repo needed."}
          </p>
          <form onSubmit={handleAuthorSubmit} className="panel flex flex-col gap-5">
            <div>
              <label className="field-label" htmlFor="author-name">
                Name
              </label>
              <input
                id="author-name"
                required
                disabled={!!editingKey}
                value={authorName}
                onChange={(e) => handleAuthorNameChange(e.target.value)}
                className="field-input font-mono disabled:opacity-60"
              />
            </div>

            {editingKey && authorVersions.length > 0 && (
              <div>
                <label className="field-label">Versions</label>
                <div className="flex flex-wrap gap-1.5">
                  {authorVersions.map((v) => (
                    <span
                      key={v}
                      className={`pill ${v === authorCurrentTag ? "pill-tint" : ""}`}
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {v}
                      {v === authorCurrentTag && " ●"}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="field-label" htmlFor="author-md">
                SKILL.md
              </label>
              {authorLoading ? (
                <p className="text-sm" style={{ color: "var(--color-muted)" }}>
                  Loading content…
                </p>
              ) : (
                <textarea
                  id="author-md"
                  required
                  rows={14}
                  value={authorMd}
                  onChange={(e) => {
                    setAuthorMd(e.target.value);
                    setAuthorMdPristine(false);
                  }}
                  className="code-block"
                />
              )}
            </div>

            <div>
              <label className="field-label" htmlFor="author-description">
                Description
              </label>
              <input
                id="author-description"
                value={authorDescription}
                onChange={(e) => setAuthorDescription(e.target.value)}
                className="field-input"
              />
            </div>

            <div>
              <label className="field-label">Tags</label>
              <TagsInput value={authorTags} onChange={setAuthorTags} />
            </div>

            <div className="flex gap-2">
              <button type="submit" className="btn-primary" disabled={authorSubmitting || authorLoading}>
                {authorSubmitting ? "Saving…" : editingKey ? "Save new version" : "Author skill"}
              </button>
              {editingKey && (
                <button type="button" className="btn-secondary" onClick={resetAuthorForm}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
