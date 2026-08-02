import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * عرض تدريجي (Virtualized/Lazy) لقوائم البطاقات الطويلة:
 * يُظهر دفعة أولى فقط ثم يحمّل الباقي عند الوصول لنهاية القائمة،
 * لتفادي بطء الواجهة وانهيار التطبيق على الأجهزة محدودة الذاكرة.
 */
export function LazyList<T>({
  items,
  renderItem,
  keyOf,
  className,
  batch = 18,
}: {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  keyOf: (item: T, index: number) => string;
  className?: string;
  batch?: number;
}) {
  const [count, setCount] = useState(batch);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCount(batch);
  }, [items, batch]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || count >= items.length) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setCount((c) => Math.min(items.length, c + batch));
    });
    io.observe(el);
    return () => io.disconnect();
  }, [count, items.length, batch]);

  return (
    <>
      <div className={className}>
        {items.slice(0, count).map((it, i) => (
          <div key={keyOf(it, i)}>{renderItem(it, i)}</div>
        ))}
      </div>
      {count < items.length && <div ref={sentinel} className="h-8" aria-hidden />}
    </>
  );
}
