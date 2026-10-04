"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/components/store";
import { exportBackup, importBackup } from "@/lib/storage";
import type { NumberingMode } from "@/lib/types";

export default function SettingsPage() {
  const { settings, putSettings, wipe } = useStore();
  const [key, setKey] = useState(settings.geminiApiKey);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const timeout = setTimeout(() => {
    if (key !== settings.geminiApiKey) setKey(settings.geminiApiKey);
    }, 0);
    return () => clearTimeout(timeout);
  }, [settings.geminiApiKey]);

  async function save() {
    await putSettings({ ...settings, geminiApiKey: key.trim() });
    setNotice("Saved on this browser. The key is not written to the database.");
  }

  async function download() {
    const payload = await exportBackup();
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fjee-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function restore(file: File) {
    const payload = JSON.parse(await file.text()) as Parameters<typeof importBackup>[0];
    await importBackup(payload);
    setNotice("Backup restored into this browser. Reload if a list looks stale.");
    window.location.reload();
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <p className="font-note text-2xl">The margin notes</p>
      <h1 className="font-display text-5xl">Settings</h1>
      <section className="manga-panel mt-6 p-4">
        <h2 className="font-display text-3xl">Gemini</h2>
        <p className="mt-2 text-sm leading-6">Optional. Stored locally. Sent only to the tutor route on this app, which calls Google. Scoring never uses it. If the server has GEMINI_API_KEY, that is used when this field is empty.</p>
        <input className="mt-3 w-full border-2 border-[var(--ink)] bg-white px-3 py-2" type="password" value={key} placeholder="Gemini API key" onChange={(event) => setKey(event.target.value)} />
        <label className="mt-3 block text-sm">Model
          <input className="mt-1 w-full border-2 border-[var(--ink)] bg-white px-3 py-2" value={settings.geminiModel} onChange={(event) => void putSettings({ ...settings, geminiModel: event.target.value })} />
        </label>
        <div className="mt-3 flex gap-2">
          <button className="bg-[var(--ink)] px-4 py-2 text-white" onClick={() => void save()}>Save key</button>
          <button className="border-2 border-[var(--ink)] px-4 py-2" onClick={() => { setKey(""); void putSettings({ ...settings, geminiApiKey: "" }); }}>Clear key</button>
        </div>
      </section>
      <section className="manga-panel mt-4 p-4">
        <h2 className="font-display text-3xl">Exam defaults</h2>
        <label className="mt-3 block text-sm">Question numbering
          <select className="mt-1 w-full border-2 border-[var(--ink)] bg-white px-3 py-2" value={settings.numbering} onChange={(event) => void putSettings({ ...settings, numbering: event.target.value as NumberingMode })}>
            <option value="original">Original numbers from the ZIP</option>
            <option value="cumulative">Cumulative 1…N</option>
            <option value="section-wise">Restart in each section</option>
          </select>
        </label>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={settings.realExamSave} onChange={(event) => void putSettings({ ...settings, realExamSave: event.target.checked })} />
          Real-exam save: an option is scored only after Save & Next or Mark for Review. Off means every selection is saved immediately.
        </label>
      </section>
      <section className="manga-panel mt-4 p-4">
        <h2 className="font-display text-3xl">This browser</h2>
        <p className="mt-2 text-sm">Export includes papers, images, attempts, syllabus progress and settings. Import restores them after a refresh.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="border-2 border-[var(--ink)] px-4 py-2" onClick={() => void download()}>Export backup</button>
          <label className="border-2 border-[var(--ink)] px-4 py-2">Import backup<input className="hidden" type="file" accept="application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void restore(file); }} /></label>
          <button className="border-2 border-[var(--vermilion)] px-4 py-2" onClick={() => { if (confirm("Erase every local FJEE paper, attempt and syllabus note on this browser?")) void wipe(); }}>Erase local data</button>
        </div>
      </section>
      {notice ? <p className="mt-4 text-sm">{notice}</p> : null}
    </div>
  );
}
