"use client";

import type { Dispatch, SetStateAction } from "react";
import type { AstraCliStatus } from "@/lib/astraCli";
import { inputStyle, labelStyle } from "@/components/connection/styles";

interface AstraCliFormProps {
  astraCliStatus: AstraCliStatus | null;
  astraCliProfile: string;
  setAstraCliProfile: Dispatch<SetStateAction<string>>;
  astraCliDatabase: string;
  setAstraCliDatabase: Dispatch<SetStateAction<string>>;
}

export function AstraCliForm({
  astraCliStatus,
  astraCliProfile,
  setAstraCliProfile,
  astraCliDatabase,
  setAstraCliDatabase,
}: AstraCliFormProps) {
  const databases = astraCliStatus?.databases ?? [];
  const selectedDatabase = databases.find((database) => database.id === astraCliDatabase) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label style={{ ...labelStyle, marginBottom: 0 }}>Astra CLI Profile</label>
          {astraCliStatus?.selectedProfile ? (
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              Default: {astraCliStatus.selectedProfile}
            </span>
          ) : null}
        </div>
        <select
          value={astraCliProfile}
          onChange={(event) => setAstraCliProfile(event.target.value)}
          data-testid="astra-cli-profile-select"
          style={inputStyle}
        >
          <option value="">Choose a profile…</option>
          {astraCliStatus?.profiles.map((profile) => (
            <option key={profile.name} value={profile.name}>
              {profile.name}
              {profile.isDefault ? " (default)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label style={{ ...labelStyle, marginBottom: 0 }}>Astra CLI Database</label>
          {selectedDatabase?.region ? (
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              {selectedDatabase.region}
            </span>
          ) : null}
        </div>
        <select
          value={astraCliDatabase}
          onChange={(event) => setAstraCliDatabase(event.target.value)}
          data-testid="astra-cli-database-select"
          style={inputStyle}
        >
          <option value="">Choose a database…</option>
          {databases.map((database) => (
            <option key={database.id} value={database.id}>
              {database.name}
            </option>
          ))}
        </select>
        <p className="text-[11px] mt-1.5" style={{ color: "var(--text-muted)" }}>
          The app resolves the token and endpoint from your local `astra` setup only when this mode is selected.
        </p>
      </div>

      {selectedDatabase ? (
        <div
          className="rounded-xl px-3 py-2.5"
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div
            className="text-[10px] uppercase tracking-widest font-semibold"
            style={{ color: "var(--text-muted)" }}
          >
            Resolved Endpoint
          </div>
          <div
            className="text-[12px] mt-1"
            style={{
              color: "var(--text-primary)",
              fontFamily: "IBM Plex Mono, monospace",
              overflowWrap: "anywhere",
            }}
          >
            {selectedDatabase.endpoint}
          </div>
        </div>
      ) : null}

      {astraCliStatus?.error ? (
        <div
          className="rounded-lg px-3 py-2 text-[12px]"
          style={{
            color: "#fecaca",
            backgroundColor: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
          }}
        >
          {astraCliStatus.error}
        </div>
      ) : null}
    </div>
  );
}
