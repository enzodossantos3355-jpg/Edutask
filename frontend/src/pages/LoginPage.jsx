import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { BookOpen, Pencil, ArrowLeft, ShieldCheck, User, Wrench, Lock } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import api, { formatApiError } from "@/lib/api";
import Logo from "@/components/Logo";

const STATUS_META = {
  active: { label: null, icon: null, bg: null, dim: false },
  maintenance: { label: "Manutenção", icon: Wrench, bg: "bg-orange-300", dim: true },
  blocked: { label: "Bloqueado", icon: Lock, bg: "bg-neutral-400", dim: true },
};

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, user } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      navigate(user.role === "admin" ? "/admin" : "/aluno", { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get("/auth/profiles");
        setProfiles(data);
      } catch (e) {
        toast.error(formatApiError(e?.response?.data?.detail) || "Falha ao carregar perfis");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    try {
      const u = await login({ user_id: selected.id, password });
      toast.success(`Bem-vindo, ${u.name}!`);
      navigate(u.role === "admin" ? "/admin" : "/aluno", { replace: true });
    } catch (err) {
      const msg = formatApiError(err?.response?.data?.detail) || "Senha incorreta";
      toast.error(msg);
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  };

  const handleProfileClick = (p) => {
    const meta = STATUS_META[p.status] || STATUS_META.active;
    if (p.status === "maintenance") {
      toast.warning("Este perfil está em manutenção. Fale com o administrador.");
      return;
    }
    if (p.status === "blocked") {
      toast.error("Este perfil está bloqueado. Fale com o administrador.");
      return;
    }
    setSelected(p);
    setPassword("");
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[#FAFAFA]" data-testid="login-page">
      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[42%] relative border-r-2 border-black overflow-hidden bg-amber-100">
        <img
          src="https://images.pexels.com/photos/28503354/pexels-photo-28503354.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=1200&w=900"
          alt="Material escolar"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-amber-200/40 via-transparent to-sky-200/30" />
        <div className="relative z-10 p-10 flex flex-col justify-between w-full">
          <div className="flex items-center gap-3">
            <Logo size={48} />
            <span className="font-heading font-black text-3xl tracking-tight text-white drop-shadow-[2px_2px_0_rgba(0,0,0,0.9)]">
              Edu<span className="text-sky-300">task</span>
            </span>
          </div>
          <div className="space-y-4">
            <div className="inline-block nb-card bg-amber-300 px-4 py-2">
              <span className="font-heading font-bold tracking-wide text-sm">Tarefas de Casa Escolares</span>
            </div>
            <h1 className="font-heading font-black text-5xl xl:text-6xl leading-[1.05] text-black drop-shadow-[2px_2px_0_rgba(255,255,255,0.6)]">
              A lição de hoje, organizada para amanhã.
            </h1>
            <p className="text-base text-black/80 max-w-md font-medium">
              Professores criam, alunos completam. Anexos, prazos e progresso — tudo em um só lugar.
            </p>
          </div>
          <div className="flex gap-3">
            <div className="nb-card bg-white px-3 py-2 flex items-center gap-2 text-sm font-bold">
              <BookOpen className="w-4 h-4" /> Matérias
            </div>
            <div className="nb-card bg-white px-3 py-2 flex items-center gap-2 text-sm font-bold">
              <Pencil className="w-4 h-4" /> Anexos
            </div>
          </div>
        </div>
      </div>

      {/* Right side */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-2xl">
          <div className="flex items-center gap-3 mb-6 lg:hidden">
            <Logo size={40} />
            <span className="font-heading font-black text-2xl tracking-tight">
              <span className="text-black">Edu</span><span className="text-sky-500">task</span>
            </span>
          </div>

          {!selected ? (
            <div className="nb-fade-in">
              <h2 className="font-heading font-black text-4xl mb-2">Quem está usando?</h2>
              <p className="text-neutral-600 mb-8">Escolha seu perfil para continuar.</p>

              {loading ? (
                <p className="text-neutral-500">Carregando perfis...</p>
              ) : profiles.length === 0 ? (
                <div className="nb-card bg-white p-8 text-center">
                  <p className="font-bold mb-1">Nenhum perfil cadastrado</p>
                  <p className="text-sm text-neutral-600">Aguarde o administrador criar seu perfil.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4" data-testid="profiles-grid">
                  {profiles.map((p, i) => {
                    const meta = STATUS_META[p.status] || STATUS_META.active;
                    const StatusIcon = meta.icon;
                    return (
                      <button
                        key={p.id}
                        onClick={() => handleProfileClick(p)}
                        className={`nb-card nb-card-hover p-4 bg-white text-center group nb-fade-in relative ${meta.dim ? "opacity-60" : ""}`}
                        style={{ animationDelay: `${i * 50}ms` }}
                        data-testid={`profile-${p.id}`}
                      >
                        <div className={`w-20 h-20 mx-auto mb-3 nb-card flex items-center justify-center font-heading font-black text-3xl ${p.role === "admin" ? "bg-red-300" : "bg-sky-300"} ${meta.dim ? "grayscale" : ""}`}>
                          {p.name?.[0]?.toUpperCase() || "?"}
                        </div>
                        <div className="font-heading font-bold text-base leading-tight truncate">{p.name}</div>
                        {meta.label ? (
                          <span className={`nb-badge mt-2 inline-flex items-center gap-1 ${meta.bg}`} data-testid={`profile-status-${p.id}`}>
                            {StatusIcon && <StatusIcon className="w-3 h-3" strokeWidth={2.5} />}
                            {meta.label}
                          </span>
                        ) : (
                          <span className={`nb-badge mt-2 inline-flex items-center gap-1 ${p.role === "admin" ? "bg-red-200" : "bg-sky-200"}`}>
                            {p.role === "admin" ? <ShieldCheck className="w-3 h-3" /> : <User className="w-3 h-3" />}
                            {p.role === "admin" ? "Admin" : "Aluno"}
                          </span>
                        )}
                        {StatusIcon && (
                          <div className={`absolute -top-2 -right-2 w-9 h-9 nb-card flex items-center justify-center ${meta.bg}`}>
                            <StatusIcon className="w-4 h-4" strokeWidth={3} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="max-w-md mx-auto nb-card p-8 sm:p-10 bg-white nb-fade-in" data-testid="password-step">
              <button
                onClick={() => { setSelected(null); setPassword(""); }}
                className="nb-btn bg-white px-3 py-1.5 text-sm flex items-center gap-1 mb-6"
                data-testid="back-to-profiles"
              >
                <ArrowLeft className="w-4 h-4" /> Trocar perfil
              </button>

              <div className="text-center mb-6">
                <div className={`w-24 h-24 mx-auto nb-card flex items-center justify-center font-heading font-black text-4xl mb-4 ${selected.role === "admin" ? "bg-red-300" : "bg-sky-300"}`}>
                  {selected.name?.[0]?.toUpperCase() || "?"}
                </div>
                <h2 className="font-heading font-black text-2xl mb-1">Olá, {selected.name}!</h2>
                <span className={`nb-badge inline-flex items-center gap-1 ${selected.role === "admin" ? "bg-red-200" : "bg-sky-200"}`}>
                  {selected.role === "admin" ? <ShieldCheck className="w-3 h-3" /> : <User className="w-3 h-3" />}
                  {selected.role === "admin" ? "Admin" : "Aluno"}
                </span>
              </div>

              <form onSubmit={onSubmit} className="space-y-5" data-testid="login-form">
                <div>
                  <label className="block text-sm font-bold mb-2">Senha</label>
                  <input
                    type="password"
                    required
                    autoFocus
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="nb-input"
                    placeholder="••••••••"
                    data-testid="login-password-input"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="nb-btn w-full bg-sky-400 hover:bg-sky-300 text-black px-6 py-3 text-base"
                  data-testid="login-submit-button"
                >
                  {submitting ? "Entrando..." : "Entrar"}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
