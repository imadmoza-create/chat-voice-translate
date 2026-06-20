import { useEffect, useState } from "react";
import { LANGUAGES } from "@/lib/languages";

const LANG_KEY = "app_lang";
const GENDER_KEY = "app_gender";
const LANG_EVENT = "app-lang-change";
const GENDER_EVENT = "app-gender-change";

export type UserGender = "male" | "female";

// لغة الجهاز الافتراضية (لغة الهاتف) — تُطابق مع اللغات المدعومة
export function detectDeviceLang(): string {
  if (typeof navigator === "undefined") return "en";
  const candidates = [navigator.language, ...(navigator.languages ?? [])];
  for (const c of candidates) {
    const base = (c || "").toLowerCase().split("-")[0];
    if (LANGUAGES.some((l) => l.code === base)) return base;
  }
  return "en";
}

export function getAppLang(): string {
  if (typeof window === "undefined") return "en";
  return localStorage.getItem(LANG_KEY) ?? detectDeviceLang();
}

export function setAppLang(lang: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LANG_KEY, lang);
  window.dispatchEvent(new CustomEvent(LANG_EVENT, { detail: lang }));
}

export function getUserGender(): UserGender {
  if (typeof window === "undefined") return "male";
  return (localStorage.getItem(GENDER_KEY) as UserGender) ?? "male";
}

export function setUserGender(g: UserGender) {
  if (typeof window === "undefined") return;
  localStorage.setItem(GENDER_KEY, g);
  window.dispatchEvent(new CustomEvent(GENDER_EVENT, { detail: g }));
}

export function useAppLang(): [string, (l: string) => void] {
  const [lang, setLang] = useState<string>("en");
  useEffect(() => {
    setLang(getAppLang());
    const handler = () => setLang(getAppLang());
    window.addEventListener(LANG_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(LANG_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);
  return [lang, setAppLang];
}

export function useUserGender(): [UserGender, (g: UserGender) => void] {
  const [gender, setGender] = useState<UserGender>("male");
  useEffect(() => {
    setGender(getUserGender());
    const handler = () => setGender(getUserGender());
    window.addEventListener(GENDER_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(GENDER_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);
  return [gender, setUserGender];
}
