import { useCallback, useEffect, useState } from "react";

/**
 * حالة محفوظة محلياً (localStorage) لمنع الرجوع للشاشة الأولى
 * عند إعادة التحميل أو إغلاق التطبيق بسبب نقص الذاكرة.
 */
export function usePersistedState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw != null) setValue(JSON.parse(raw) as T);
    } catch {
      /* ignore */
    }
  }, [key]);

  const update = useCallback(
    (v: T) => {
      setValue(v);
      try {
        window.localStorage.setItem(key, JSON.stringify(v));
      } catch {
        /* ignore */
      }
    },
    [key],
  );

  return [value, update];
}
