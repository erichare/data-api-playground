"use client";

import { useCallback, useEffect, useState } from "react";

export function usePlaygroundAuth() {
  const [authEnabled, setAuthEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/auth/status")
      .then((response) => response.json() as Promise<{ enabled?: boolean }>)
      .then((payload) => {
        if (!cancelled) {
          setAuthEnabled(!!payload.enabled);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/login";
  }, []);

  return {
    authEnabled,
    handleSignOut,
  };
}
