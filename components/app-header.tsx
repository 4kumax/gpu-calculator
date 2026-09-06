"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calculator, Settings2 } from "lucide-react";

export function AppHeader() {
  const pathname = usePathname();
  return (
    <header className="app-header">
      <div className="header-inner">
        <Link href="/" className="brand">
          <span className="wordmark">GPU</span>
          <span className="brand-caption">Инфраструктура ИИ</span>
        </Link>
        <nav className="main-nav" aria-label="Основная навигация">
          <Link href="/" className={pathname === "/" ? "active" : ""}>
            <Calculator size={17} />
            Сценарии
          </Link>
          <Link
            href="/settings"
            className={pathname.startsWith("/settings") ? "active" : ""}
          >
            <Settings2 size={17} />
            Параметры
          </Link>
        </nav>
      </div>
    </header>
  );
}
