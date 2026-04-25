import { useState } from "react";
import { Users, Check } from "lucide-react";

/**
 * Recipient picker. value=[] means "todos os alunos".
 * onChange receives the new list of student ids.
 */
export default function RecipientSelector({ students, value, onChange, testIdPrefix = "recipients" }) {
  const [mode, setMode] = useState(value && value.length > 0 ? "specific" : "all");

  const setAll = () => {
    setMode("all");
    onChange([]);
  };
  const setSpecific = () => {
    setMode("specific");
    if (!value || value.length === 0) onChange([]);
  };
  const toggleStudent = (id) => {
    const set = new Set(value || []);
    if (set.has(id)) set.delete(id); else set.add(id);
    onChange(Array.from(set));
  };

  return (
    <div className="space-y-3" data-testid={testIdPrefix}>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={setAll}
          className={`nb-btn px-3 py-2 text-sm flex items-center justify-center gap-2 ${mode === "all" ? "bg-emerald-300" : "bg-white"}`}
          data-testid={`${testIdPrefix}-all`}
        >
          <Users className="w-4 h-4" /> Todos os alunos
        </button>
        <button
          type="button"
          onClick={setSpecific}
          className={`nb-btn px-3 py-2 text-sm flex items-center justify-center gap-2 ${mode === "specific" ? "bg-sky-300" : "bg-white"}`}
          data-testid={`${testIdPrefix}-specific`}
        >
          <Check className="w-4 h-4" /> Alunos específicos
        </button>
      </div>

      {mode === "specific" && (
        <div className="nb-card bg-amber-50 p-3 max-h-44 overflow-auto">
          {students.length === 0 ? (
            <p className="text-sm text-neutral-600">Nenhum aluno cadastrado.</p>
          ) : (
            <div className="space-y-1.5">
              {students.map((s) => {
                const checked = (value || []).includes(s.id);
                return (
                  <label
                    key={s.id}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer ${checked ? "bg-sky-200" : "hover:bg-amber-100"}`}
                    data-testid={`${testIdPrefix}-student-${s.id}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleStudent(s.id)}
                      className="w-4 h-4 accent-black"
                    />
                    <span className="text-sm font-medium">{s.name}</span>
                  </label>
                );
              })}
            </div>
          )}
          {mode === "specific" && (value || []).length === 0 && (
            <p className="text-xs text-red-700 mt-2 font-bold">Selecione pelo menos 1 aluno.</p>
          )}
        </div>
      )}
    </div>
  );
}
