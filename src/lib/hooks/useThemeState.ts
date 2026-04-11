"use client";

import { useCallback, useEffect, useState } from "react";

export function useThemeState() {
  const [theme, setThemeState] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    return (localStorage.getItem("theme") as "dark" | "light" | null) ?? "dark";
  });

  const applyTheme = useCallback((nextTheme: "dark" | "light") => {
    const html = document.documentElement;
    if (nextTheme === "dark") html.classList.add("dark");
    else html.classList.remove("dark");
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((currentTheme) => {
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      localStorage.setItem("theme", nextTheme);
      return nextTheme;
    });
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [applyTheme, theme]);

  return {
    theme,
    toggleTheme,
  };
}
