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
    <header className="border-b-2 border-black bg-white" data-testid="app-header">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Logo size={40} />
          <div>
            <div className="font-heading font-black text-lg leading-tight"><span className="dark:text-white">Edu</span><span className="text-sky-500">task</span></div>
            <div className="text-xs text-neutral-600 font-medium leading-tight">{title}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {user && (
            <Avatar
              userId={user.id}
              name={user.name}
              size={36}
              hasAvatar={user.has_avatar}
              bg={badgeClass}
            />
          )}
          <div className="hidden sm:flex flex-col items-end leading-tight">
            <span className="font-bold text-sm" data-testid="user-name">{user?.name}</span>
            {user?.role === "admin" && (
              <span className="text-xs text-neutral-600">{user?.email}</span>
            )}
          </div>
          <span className={`nb-badge ${badgeClass}`} data-testid="user-role-badge">{roleLabel}</span>
          <button
            onClick={toggle}
            className="nb-btn bg-white hover:bg-amber-100 px-2 py-2"
            data-testid="theme-toggle"
            aria-label={theme === "light" ? "Modo escuro" : "Modo claro"}
            title={theme === "light" ? "Modo escuro" : "Modo claro"}
          >
            {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
          <button
            onClick={logout}
            className="nb-btn bg-white hover:bg-red-100 px-3 py-2 flex items-center gap-2 text-sm"
            data-testid="logout-button"
          >
            <LogOut className="w-4 h-4" /> Sair
          </button>
        </div>
      </div>
    </header>
  );
}
