import React from "react";
import { Link, useLocation } from "wouter";
import { FolderGit2, Settings, Terminal, Code2, PlaySquare, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

export function AppLayout({ children, hideBottomNav }: { children: React.ReactNode; hideBottomNav?: boolean }) {
  const [location] = useLocation();
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="flex flex-col h-screen w-full bg-background text-foreground overflow-hidden">
        {!hideBottomNav && (
          <header className="h-11 shrink-0 flex items-center px-4 border-b border-border bg-sidebar z-20">
            <div className="w-7 h-7 rounded flex items-center justify-center mr-3">
              {/* Netflix-style N logo */}
              <span className="text-[#E50914] font-black text-lg leading-none tracking-tighter">N</span>
            </div>
            <span className="text-sm font-bold text-foreground tracking-wide">CODELENS</span>
          </header>
        )}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">{children}</main>
        {!hideBottomNav && (
          <nav className="shrink-0 h-14 border-t border-border bg-sidebar flex items-center justify-around px-2 z-20">
            <MobileNavItem href="/" icon={<FolderGit2 className="w-5 h-5" />} label="Projetos"
              active={location === "/" || location.startsWith("/projects")} />
            <MobileNavItem href="/assistant" icon={<MessageSquare className="w-5 h-5" />} label="Assistente"
              active={location === "/assistant"} />
            <MobileNavItem href="/playground" icon={<PlaySquare className="w-5 h-5" />} label="Playground"
              active={location === "/playground"} />
            <MobileNavItem href="/settings" icon={<Settings className="w-5 h-5" />} label="Config"
              active={location === "/settings"} />
          </nav>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden" style={{ background: "#141414", color: "#e5e5e5" }}>
      {/* Netflix-style sidebar */}
      <aside
        className="w-14 flex flex-col items-center pt-4 pb-8 shrink-0 z-10 border-r"
        style={{ background: "#0a0a0a", borderColor: "#1f1f1f" }}
      >
        {/* Logo */}
        <div className="mb-8">
          <div
            className="w-8 h-8 rounded flex items-center justify-center font-black text-lg leading-none"
            style={{ color: "#E50914" }}
          >
            N
          </div>
        </div>

        <nav className="flex flex-col gap-1 flex-1 w-full px-2">
          <SideNavItem
            href="/"
            icon={<FolderGit2 className="w-5 h-5" />}
            active={location === "/" || location.startsWith("/projects")}
            title="Projetos"
          />
          {/* Playground e Assistente ficam no cantinho, junto da Configuração */}
          <SideNavItem
            href="/playground"
            icon={<PlaySquare className="w-5 h-5" />}
            active={location === "/playground"}
            title="Playground"
            className="mt-auto"
          />
          <SideNavItem
            href="/assistant"
            icon={<MessageSquare className="w-5 h-5" />}
            active={location === "/assistant"}
            title="Assistente Livre"
          />
          <SideNavItem
            href="/settings"
            icon={<Settings className="w-5 h-5" />}
            active={location === "/settings"}
            title="Configurações"
          />
        </nav>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden" style={{ background: "#141414" }}>
        {children}
      </main>

      {/* Status bar */}
      <footer
        className="absolute bottom-0 left-14 right-0 h-6 flex items-center px-3 text-[11px] z-20"
        style={{ background: "#0a0a0a", borderTop: "1px solid #1f1f1f", color: "#555" }}
      >
        <span className="flex items-center gap-1.5">
          <Terminal className="w-3 h-3" style={{ color: "#E50914" }} />
          <span>CodeLens</span>
          <span className="ml-1" style={{ color: "#E50914" }}>●</span>
          <span>Ready</span>
        </span>
      </footer>
    </div>
  );
}

function SideNavItem({
  href, icon, active, title, className,
}: {
  href: string; icon: React.ReactNode; active?: boolean; title: string; className?: string;
}) {
  return (
    <Link
      href={href}
      title={title}
      className={cn(
        "relative flex items-center justify-center w-10 h-10 rounded transition-all duration-200",
        active
          ? "text-white"
          : "hover:text-white",
        className
      )}
      style={
        active
          ? { color: "#fff" }
          : { color: "#777" }
      }
    >
      {/* Red left indicator */}
      {active && (
        <div
          className="absolute left-[-8px] top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full"
          style={{ background: "#E50914" }}
        />
      )}
      {/* Active background tint */}
      {active && (
        <div className="absolute inset-0 rounded" style={{ background: "rgba(229,9,20,0.12)" }} />
      )}
      <span className="relative z-10">{icon}</span>
    </Link>
  );
}

function MobileNavItem({
  href, icon, label, active,
}: {
  href: string; icon: React.ReactNode; label: string; active?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1 px-4 py-1 rounded-lg transition-colors"
      style={{ color: active ? "#E50914" : "#777" }}
    >
      {icon}
      <span className="text-[10px] font-semibold">{label}</span>
    </Link>
  );
}
