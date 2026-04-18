"use client";

import { FormEvent, useState } from "react";
import { AlertCircle, Lock, Loader2 } from "lucide-react";

interface LoginFormProps {
  nextPath?: string;
}

export function LoginForm({ nextPath = "/" }: LoginFormProps) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Login failed");
      }

      window.location.href = nextPath || "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background:
          "radial-gradient(circle at top, rgba(15,98,254,0.16), transparent 38%), var(--bg-primary)",
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-8"
        style={{
          backgroundColor: "var(--bg-panel)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.25)",
        }}
      >
        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center"
            style={{
              background:
                "linear-gradient(135deg, rgba(15,98,254,0.16), rgba(108,99,255,0.16))",
              border: "1px solid var(--interactive-border)",
            }}
          >
            <Lock size={18} style={{ color: "var(--interactive)" }} />
          </div>
          <div>
            <h1
              className="text-lg font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Playground Login
            </h1>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Enter the app password to continue.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label
              className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: "var(--text-muted)" }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
              placeholder="Enter password"
              data-testid="login-password"
              style={{
                backgroundColor: "var(--bg-input)",
                border: "1px solid var(--border-strong)",
                color: "var(--text-primary)",
                borderRadius: "8px",
                padding: "10px 12px",
                fontSize: "14px",
                width: "100%",
                outline: "none",
              }}
            />
          </div>

          {error && (
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
              style={{
                backgroundColor: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.2)",
                color: "#ef4444",
              }}
            >
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !password.trim()}
            data-testid="login-submit"
            className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium"
            style={{
              backgroundColor:
                submitting || !password.trim()
                  ? "var(--bg-hover)"
                  : "var(--interactive)",
              color:
                submitting || !password.trim()
                  ? "var(--text-muted)"
                  : "#fff",
              border: "1px solid transparent",
            }}
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />}
            {submitting ? "Signing In..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
