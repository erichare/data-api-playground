"use client";

import { ErrorBoundary } from "@/components/shell/ErrorBoundary";
import { Header } from "@/components/shell/Header";
import { PlaygroundDialogs } from "@/components/shell/PlaygroundDialogs";
import { PlaygroundMainPanel } from "@/components/shell/PlaygroundMainPanel";
import { Sidebar } from "@/components/shell/Sidebar";
import { ConnectionProvider } from "@/lib/context/ConnectionContext";
import { usePlaygroundState } from "@/lib/hooks/usePlaygroundState";

export default function PlaygroundPage() {
  const { connectionValue, headerProps, sidebarProps, mainPanelProps, dialogsProps } =
    usePlaygroundState();

  return (
    <ConnectionProvider value={connectionValue}>
      <div
        className="flex flex-col h-full overflow-hidden"
        style={{ backgroundColor: "var(--bg-primary)" }}
      >
        <Header {...headerProps} />

        <div className="flex flex-1 min-h-0 overflow-hidden relative">
          <Sidebar {...sidebarProps} />

          <ErrorBoundary>
            <PlaygroundMainPanel {...mainPanelProps} />
          </ErrorBoundary>
        </div>

        <PlaygroundDialogs {...dialogsProps} />
      </div>
    </ConnectionProvider>
  );
}
