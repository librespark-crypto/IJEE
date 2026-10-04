"use client";

import { useState } from "react";
import { useStore } from "@/components/store";
import { exportBackup, importBackup } from "@/lib/storage";
import type { NumberingMode } from "@/lib/types";

export default function SettingsPage() {
  const { settings, putSettings, wipe } = useStore();
  const [notice, setNotice] = useState("");

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
    <div className="mx-auto w-full max-w-3xl min-w-0 px-4 py-8">
      <p className="font-note text-2xl">The margin notes</p>
      <h1 className="font-display text-5xl">Settings</h1>
      <section className="manga-panel mt-6 min-w-0 p-4">
        <h2 className="font-display text-3xl">Gemini</h2>
        <p className="mt-2 max-w-full text-sm leading-6">
          Gemini access is server-side only. To enable the tutor, the site operator sets <code>GEMINI_API_KEY</code> as a server environment variable (for example, in Vercel Project Settings). The key is not stored in this browser, sent from the browser, or included in backups. Scoring never uses Gemini.
        </p>
        <label className="mt-3 block text-sm">Model
          <input
            className="mt-1 min-h-11 w-full min-w-0 border-2 border-[var(--ink)] bg-white px-3 py-2"
            value={settings.geminiModel}
            onChange={(event) => void putSettings({ ...settings, geminiModel: event.target.value })}
            aria-label="Gemini model"
          />
        </label>
      </section>
      <section className="manga-panel mt-4 min-w-0 p-4">
        <h2 className="font-display text-3xl">Exam defaults</h2>
        <label className="mt-3 block text-sm">Question numbering
          <select className="mt-1 min-h-11 w-full min-w-0 border-2 border-[var(--ink)] bg-white px-3 py-2" value={settings.numbering} onChange={(event) => void putSettings({ ...settings, numbering: event.target.value as NumberingMode })}>
            <option value="original">Original numbers from the ZIP</option>
            <option value="cumulative">Cumulative 1…N</option>
            <option value="section-wise">Restart in each section</option>
          </select>
        </label>
        <label className="mt-3 flex min-w-0 items-start gap-2 text-sm">
          <input className="mt-1 shrink-0" type="checkbox" checked={settings.realExamSave} onChange={(event) => void putSettings({ ...settings, realExamSave: event.target.checked })} />
          <span>Real-exam save: an option is scored only after Save &amp; Next or Mark for Review. Off means every selection is saved immediately.</span>
        </label>
      </section>
      <section className="manga-panel mt-4 min-w-0 p-4">
        <h2 className="font-display text-3xl">This browser</h2>
        <p className="mt-2 text-sm">Export includes papers, images, attempts, syllabus progress and settings. Any Gemini key left by an older version is removed and never exported. Import restores them after a refresh.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="min-h-11 border-2 border-[var(--ink)] px-4 py-2" onClick={() => void download()}>Export backup</button>
          <label className="inline-flex min-h-11 cursor-pointer items-center border-2 border-[var(--ink)] px-4 py-2 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--indigo)]">Import backup<input className="sr-only" type="file" accept="application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void restore(file); }} /></label>
          <button className="min-h-11 border-2 border-[var(--vermilion)] px-4 py-2" onClick={() => { if (confirm("Erase every local FJEE paper, attempt and syllabus note on this browser?")) void wipe(); }}>Erase local data</button>
        </div>
      </section>
      {notice ? <p className="mt-4 text-sm" role="status">{notice}</p> : null}
    </div>
  );
}
