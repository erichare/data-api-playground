"use client";

import { Header } from "@/components/shell/Header";
import { PlaygroundDialogs } from "@/components/shell/PlaygroundDialogs";
import { PlaygroundMainPanel } from "@/components/shell/PlaygroundMainPanel";
import { Sidebar } from "@/components/shell/Sidebar";
import { usePlaygroundState } from "@/lib/hooks/usePlaygroundState";

export default function PlaygroundPage() {
  const { headerProps, sidebarProps, mainPanelProps, dialogsProps } =
    usePlaygroundState();

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <Header {...headerProps} />

      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        <Sidebar {...sidebarProps} />

        <PlaygroundMainPanel {...mainPanelProps} />
      </div>

      <PlaygroundDialogs {...dialogsProps} />
    </div>
  );
}
