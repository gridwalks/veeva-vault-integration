export async function listApproved({ name = "", limit = 50, offset = 0 } = {}) {
  const p = new URLSearchParams({ name, limit, offset });
  const res = await fetch(`/api/list-approved?${p}`);
  if (!res.ok) throw new Error("Failed to load documents");
  return res.json();
}

export async function indexDocuments({ name = "", limit = 100 } = {}) {
  const p = new URLSearchParams({ name, limit });
  const res = await fetch(`/api/index-documents?${p}`);
  if (!res.ok) throw new Error("Failed to index documents");
  return res.json();
}

export async function getIndexedDocuments({ name = "", limit = 50, offset = 0 } = {}) {
  const p = new URLSearchParams({ name, limit, offset });
  const res = await fetch(`/api/get-indexed-documents?${p}`);
  if (!res.ok) throw new Error("Failed to load indexed documents");
  return res.json();
}

export function downloadUrl({ id, major, minor }) {
  const p = new URLSearchParams({ docId: id });
  if (major && minor) { p.set("major", major); p.set("minor", minor); }
  return `/api/download-file?${p}`;
}
