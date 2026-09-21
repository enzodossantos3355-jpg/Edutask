import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const AIStatusContext = createContext({ enabled: true, loading: true, refresh: () => {}, setEnabled: () => {} });

export function AIStatusProvider({ children }) {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/ai/status");
      setEnabled(Boolean(data.enabled));
    } catch {
      // default to enabled on error
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <AIStatusContext.Provider value={{ enabled, loading, refresh, setEnabled }}>
      {children}
    </AIStatusContext.Provider>
  );
}

export function useAIStatus() {
  return useContext(AIStatusContext);
}
