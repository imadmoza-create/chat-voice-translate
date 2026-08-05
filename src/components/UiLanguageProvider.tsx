import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNativeLang } from "@/lib/prefs";
import { langByCode } from "@/lib/languages";
import { translateUiStrings } from "@/lib/ui-translate.functions";

const RTL = new Set(["ar", "fa", "ur", "he"]);
const ARABIC = /[\u0600-\u06FF]/;
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE", "TEXTAREA"]);
const ATTRS = ["placeholder", "title", "aria-label", "alt"] as const;

const cacheKey = (lang: string) => `ui_i18n_${lang}`;

function loadCache(lang: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(cacheKey(lang)) || "{}");
  } catch {
    return {};
  }
}

function saveCache(lang: string, cache: Record<string, string>) {
  try {
    localStorage.setItem(cacheKey(lang), JSON.stringify(cache));
  } catch {
    /* ignore quota */
  }
}

/**
 * طبقة ترجمة تلقائية لواجهة التطبيق:
 * تترجم كل النصوص العربية الظاهرة إلى لغة المستخدم الأم المختارة من الإعدادات،
 * مع تخزين الترجمات محلياً حتى لا تتكرر الطلبات.
 */
export function UiLanguageProvider() {
  const [nativeLang] = useNativeLang();
  const runTranslate = useServerFn(translateUiStrings);

  // النصوص الأصلية لكل عقدة حتى نستطيع إعادة الترجمة عند تغيير اللغة
  const originals = useRef(new WeakMap<Node, string>());
  const attrOriginals = useRef(new WeakMap<Element, Record<string, string>>());
  const cacheRef = useRef<Record<string, string>>({});
  const pending = useRef(new Set<string>());
  const inflight = useRef(false);
  const applying = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = nativeLang;
    document.documentElement.dir = RTL.has(nativeLang) ? "rtl" : "ltr";
  }, [nativeLang]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const target = langByCode(nativeLang);
    const isArabic = nativeLang === "ar" || !target;

    cacheRef.current = isArabic ? {} : loadCache(nativeLang);
    pending.current.clear();

    function translateNode(node: Node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const parent = node.parentElement;
        if (!parent || SKIP_TAGS.has(parent.tagName)) return;
        if (parent.closest("[data-no-translate]")) return;
        const original = originals.current.get(node) ?? node.nodeValue ?? "";
        if (!ARABIC.test(original)) return;
        originals.current.set(node, original);
        const key = original.trim();
        if (!key) return;
        if (isArabic) {
          if (node.nodeValue !== original) node.nodeValue = original;
          return;
        }
        const hit = cacheRef.current[key];
        if (hit) {
          const next = original.replace(key, hit);
          if (node.nodeValue !== next) node.nodeValue = next;
        } else {
          pending.current.add(key);
        }
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as Element;
      if (SKIP_TAGS.has(el.tagName)) return;

      const store = attrOriginals.current.get(el) ?? {};
      for (const attr of ATTRS) {
        const current = el.getAttribute(attr);
        if (current == null) continue;
        const original = store[attr] ?? current;
        if (!ARABIC.test(original)) continue;
        store[attr] = original;
        if (isArabic) {
          if (current !== original) el.setAttribute(attr, original);
          continue;
        }
        const hit = cacheRef.current[original.trim()];
        if (hit) {
          if (current !== hit) el.setAttribute(attr, hit);
        } else {
          pending.current.add(original.trim());
        }
      }
      attrOriginals.current.set(el, store);

      el.childNodes.forEach(translateNode);
    }

    function scan() {
      applying.current = true;
      translateNode(document.body);
      applying.current = false;
      if (!isArabic && pending.current.size) schedule();
    }

    function schedule() {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 350);
    }

    async function flush() {
      if (inflight.current || isArabic) return;
      const batch = Array.from(pending.current).slice(0, 50);
      if (!batch.length) return;
      inflight.current = true;
      try {
        const res = await runTranslate({ data: { texts: batch, targetLang: target!.name } });
        batch.forEach((src, i) => {
          const out = res.translations[i];
          if (out) cacheRef.current[src] = out;
          pending.current.delete(src);
        });
        saveCache(nativeLang, cacheRef.current);
        scan();
      } catch {
        // تجاهل — تبقى النصوص بالعربية
        batch.forEach((src) => pending.current.delete(src));
      } finally {
        inflight.current = false;
        if (pending.current.size) schedule();
      }
    }

    scan();

    const observer = new MutationObserver((records) => {
      if (applying.current) return;
      let touched = false;
      for (const r of records) {
        if (r.type === "childList") {
          r.addedNodes.forEach((n) => {
            touched = true;
            applying.current = true;
            translateNode(n);
            applying.current = false;
          });
        } else if (r.type === "characterData" && r.target.nodeType === Node.TEXT_NODE) {
          touched = true;
          originals.current.delete(r.target);
          applying.current = true;
          translateNode(r.target);
          applying.current = false;
        }
      }
      if (touched && !isArabic && pending.current.size) schedule();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [nativeLang, runTranslate]);

  return null;
}
