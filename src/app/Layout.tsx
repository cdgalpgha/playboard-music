import { NavLink, Outlet, useLocation } from "react-router";
import { useEffect, useRef } from "react";
import { Icon, type IconName } from "@/ui/Icon.tsx";
import { Banners } from "./Banners.tsx";

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: "/learn", label: "Learn", icon: "learn" },
  { to: "/play", label: "Free play", icon: "piano" },
  { to: "/pieces", label: "Pieces", icon: "songs" },
  { to: "/import", label: "Import", icon: "upload" },
  { to: "/setup", label: "Device setup", icon: "midi" },
  { to: "/settings", label: "Settings", icon: "settings" },
  { to: "/about", label: "About", icon: "info" },
];

export function Layout() {
  const location = useLocation();
  const main = useRef<HTMLElement>(null);
  // Move focus to the page on navigation so keyboard and screen-reader users land in it.
  useEffect(() => {
    main.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="min-h-dvh lg:flex">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-green px-3 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <aside className="border-line bg-card lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-60 lg:flex-col lg:border-r">
        <div className="flex items-center justify-between px-4 py-3 lg:block lg:px-5 lg:py-6">
          <NavLink to="/" className="flex items-center gap-2 font-display text-xl font-bold text-green-dark">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-green text-white">
              <Icon name="piano" size={20} />
            </span>
            playboard<span className="text-sage">.</span>
          </NavLink>
        </div>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:px-3 lg:pb-0">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${
                  isActive ? "bg-sage-soft text-green-dark" : "text-ink-soft hover:bg-paper"
                }`
              }
            >
              <Icon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto hidden px-5 py-6 text-xs leading-relaxed text-muted lg:block">
          Piano: Salamander Grand by Alexander Holm, CC BY 3.0.{" "}
          <NavLink to="/about" className="underline">
            Credits
          </NavLink>
        </div>
      </aside>
      <main id="main" ref={main} tabIndex={-1} className="min-w-0 flex-1 outline-none">
        <Banners />
        <Outlet />
      </main>
    </div>
  );
}
