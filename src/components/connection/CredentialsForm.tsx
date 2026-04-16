"use client";

import { CheckCircle2, Eye, EyeOff, UserRound } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { BackendStatuses, DataApiBackendKind } from "@/lib/backends/types";
import { inputStyle, labelStyle } from "@/components/connection/styles";

interface CredentialsFormProps {
  draftSelectedBackend: DataApiBackendKind;
  currentBackendStatus:
    | BackendStatuses["astra"]
    | BackendStatuses["hcd"]
    | null
    | undefined;
  astraToken: string;
  setAstraToken: Dispatch<SetStateAction<string>>;
  astraEndpoint: string;
  setAstraEndpoint: Dispatch<SetStateAction<string>>;
  hcdEndpoint: string;
  setHcdEndpoint: Dispatch<SetStateAction<string>>;
  hcdUsername: string;
  setHcdUsername: Dispatch<SetStateAction<string>>;
  hcdPassword: string;
  setHcdPassword: Dispatch<SetStateAction<string>>;
  showSecret: boolean;
  setShowSecret: Dispatch<SetStateAction<boolean>>;
}

export function CredentialsForm({
  draftSelectedBackend,
  currentBackendStatus,
  astraToken,
  setAstraToken,
  astraEndpoint,
  setAstraEndpoint,
  hcdEndpoint,
  setHcdEndpoint,
  hcdUsername,
  setHcdUsername,
  hcdPassword,
  setHcdPassword,
  showSecret,
  setShowSecret,
}: CredentialsFormProps) {
  const isHcd = draftSelectedBackend === "hcd";

  const secretLabel = isHcd ? "HCD Password" : "Data API Application Token";
  const secretValue = isHcd ? hcdPassword : astraToken;
  const setSecretValue = isHcd ? setHcdPassword : setAstraToken;
  const secretTestId = isHcd ? "hcd-password-input" : "astra-token-input";
  const endpointValue = isHcd ? hcdEndpoint : astraEndpoint;
  const setEndpointValue = isHcd ? setHcdEndpoint : setAstraEndpoint;
  const endpointTestId = isHcd ? "hcd-endpoint-input" : "astra-endpoint-input";
  const endpointLabel = isHcd ? "HCD Endpoint" : "Data API Endpoint";
  const endpointPlaceholder = isHcd
    ? "https://my-hcd-host:8181"
    : "https://xxxx-xxxx.apps.astra.datastax.com";
  const secretPlaceholder = isHcd ? "••••••••" : "AstraCS:••••••••••••";

  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label style={{ ...labelStyle, marginBottom: 0 }}>{endpointLabel}</label>
          {currentBackendStatus?.hasEndpoint && !endpointValue ? (
            <span
              className="flex items-center gap-1 text-[10px]"
              style={{ color: "#22c55e" }}
            >
              <CheckCircle2 size={10} /> Set via environment
            </span>
          ) : null}
        </div>
        <input
          type="text"
          value={endpointValue}
          onChange={(event) => setEndpointValue(event.target.value)}
          data-testid={endpointTestId}
          placeholder={endpointPlaceholder}
          style={inputStyle}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {isHcd && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label style={{ ...labelStyle, marginBottom: 0 }}>HCD Username</label>
            {currentBackendStatus?.hasUsername && !hcdUsername ? (
              <span
                className="flex items-center gap-1 text-[10px]"
                style={{ color: "#22c55e" }}
              >
                <CheckCircle2 size={10} /> Set via environment
              </span>
            ) : null}
          </div>
          <div className="relative">
            <input
              type="text"
              value={hcdUsername}
              onChange={(event) => setHcdUsername(event.target.value)}
              data-testid="hcd-username-input"
              placeholder="cassandra"
              style={{ ...inputStyle, paddingLeft: "36px" }}
              autoComplete="off"
              spellCheck={false}
            />
            <UserRound
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: "var(--text-muted)" }}
            />
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label style={{ ...labelStyle, marginBottom: 0 }}>{secretLabel}</label>
          {!isHcd && currentBackendStatus?.hasToken && !astraToken ? (
            <span
              className="flex items-center gap-1 text-[10px]"
              style={{ color: "#22c55e" }}
            >
              <CheckCircle2 size={10} /> Set via environment
            </span>
          ) : null}
          {isHcd && currentBackendStatus?.hasPassword && !hcdPassword ? (
            <span
              className="flex items-center gap-1 text-[10px]"
              style={{ color: "#22c55e" }}
            >
              <CheckCircle2 size={10} /> Set via environment
            </span>
          ) : null}
        </div>
        <div className="relative">
          <input
            type={showSecret ? "text" : "password"}
            value={secretValue}
            onChange={(event) => setSecretValue(event.target.value)}
            data-testid={secretTestId}
            placeholder={secretPlaceholder}
            style={{ ...inputStyle, paddingRight: "40px" }}
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            data-bwignore="true"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => setShowSecret((value) => !value)}
            className="absolute right-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--text-muted)" }}
          >
            {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <p className="text-[11px] mt-1.5" style={{ color: "var(--text-muted)" }}>
          Stored in session memory only. Leave blank to use environment-backed credentials when available.
        </p>
      </div>
    </>
  );
}
