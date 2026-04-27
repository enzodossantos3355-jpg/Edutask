import { LogOut, Sun, Moon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import Logo from "@/components/Logo";
import Avatar from "@/components/Avatar";

export default function AppHeader({ title }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const roleLabel = user?.role === "admin" ? "Admin" : "Aluno";
  const badgeClass = user?.role === "admin" ? "bg-red-300" : "bg-sky-300";

  return (
    <header className="border-b-2 border-black bg-white sticky top-0 z-30" data-testid="app-header">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Logo size={36} />
          <div className="min-w-0">
            <div className="font-heading font-black text-base sm:text-lg leading-tight">
              <span className="dark:text-white">Edu</span><span className="text-sky-500">task</span>
            </div>
            <div className="text-[11px] sm:text-xs text-neutral-600 font-medium leading-tight truncate max-w-[180px] sm:max-w-none">
              {title}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
          {user && (
            <Avatar
              userId={user.id}
              name={user.name}
              size={32}
              hasAvatar={user.has_avatar}
              bg={badgeClass}
            />
          )}
          <div className="hidden md:flex flex-col items-end leading-tight">
            <span className="font-bold text-sm" data-testid="user-name">{user?.name}</span>
            {user?.role === "admin" && user?.email && (
              <span className="text-xs text-neutral-600">{user?.email}</span>
            )}
          </div>
          <span className={`nb-badge hidden sm:inline-flex ${badgeClass}`} data-testid="user-role-badge">{roleLabel}</span>
          <button
            onClick={toggle}
            className="nb-btn bg-white hover:bg-amber-100 px-2 py-1.5 sm:py-2"
            data-testid="theme-toggle"
            aria-label={theme === "light" ? "Modo escuro" : "Modo claro"}
            title={theme === "light" ? "Modo escuro" : "Modo claro"}
          >
            {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
          <button
            onClick={logout}
            className="nb-btn bg-white hover:bg-red-100 px-2 sm:px-3 py-1.5 sm:py-2 flex items-center gap-2 text-sm"
            data-testid="logout-button"
            aria-label="Sair"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </div>
    </header>
  );
}
