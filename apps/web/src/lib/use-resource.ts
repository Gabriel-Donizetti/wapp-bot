import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
export function useResource<T>(path: string | null, interval = 5000) {
  const [state, setState] = useState<{
    path: string | null;
    data?: T;
    error?: string;
    loading: boolean;
  }>({ path: null, loading: false });
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((value) => value + 1), []);
  useEffect(() => {
    if (!path) {
      setState({ path: null, loading: false });
      return;
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setState((previous) => ({
      path,
      data: previous.path === path ? previous.data : undefined,
      loading: true,
    }));
    const load = async () => {
      try {
        const data = await api<T>(path, { signal: controller.signal });
        if (!controller.signal.aborted)
          setState({ path, data, loading: false });
      } catch (error) {
        if (!controller.signal.aborted)
          setState((previous) => ({
            ...previous,
            error:
              error instanceof Error
                ? error.message
                : "Falha ao carregar dados.",
            loading: false,
          }));
      } finally {
        if (!controller.signal.aborted && interval > 0)
          timer = setTimeout(() => {
            void load();
          }, interval);
      }
    };
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [path, interval, version]);
  return {
    data: state.path === path ? state.data : undefined,
    error: state.path === path ? state.error : undefined,
    loading: state.path !== path || state.loading,
    refresh,
  };
}
