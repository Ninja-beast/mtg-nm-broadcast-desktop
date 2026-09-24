import { useCallback, useEffect, useRef, useState } from "react";

/**
 * HOOKS-LAG - KJERNEN
 * ====================
 * Samme [data, reload]-mønster som useJson (src/lib/apiClient.ts), men tar en
 * SERVICE-FUNKSJON (fra src/services/) i stedet for en rå URL-streng.
 *
 * Bakoverkompatibelt: `const [data, reload] = useX()` fungerer som før.
 * Valgfritt tredje element gir lasting/feil: `const [data, reload, { loading, error }] = useX()`.
 *
 * - Nyeste kall vinner: et tregt, utdatert svar overskriver aldri et nyere.
 * - Ingen state-oppdatering etter unmount.
 * - `reload` er stabil mellom renders.
 * - Ved feil settes data til null (som før), og feilen ligger i `error`.
 * - Eksisterende data blir stående mens en ny henting pågår.
 */
export type AsyncMeta = { loading: boolean; error: unknown };

export function useAsync<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = []
): [T | null, () => void, AsyncMeta] {
  const [data, setData] = useState<T | null>(null);
  const [meta, setMeta] = useState<AsyncMeta>({ loading: true, error: null });

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const requestId = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reload = useCallback(() => {
    const id = ++requestId.current;
    const isCurrent = () => mounted.current && id === requestId.current;

    setMeta((m) => ({ ...m, loading: true }));
    fetcherRef.current()
      .then((result) => {
        if (!isCurrent()) return;
        setData(result);
        setMeta({ loading: false, error: null });
      })
      .catch((error) => {
        if (!isCurrent()) return;
        setData(null);
        setMeta({ loading: false, error });
      });
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    reload();
  }, deps);

  return [data, reload, meta];
}
