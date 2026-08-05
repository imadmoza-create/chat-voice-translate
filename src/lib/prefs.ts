import { useEffect, useState } from "react";
import { LANGUAGES } from "@/lib/languages";

const LANG_KEY = "app_lang";
const NATIVE_KEY = "app_native_lang";
const GENDER_KEY = "app_gender";
const PROFILE_KEY = "app_student_profile";
const LANG_EVENT = "app-lang-change";
const NATIVE_EVENT = "app-native-lang-change";
const GENDER_EVENT = "app-gender-change";
const PROFILE_EVENT = "app-profile-change";

export type UserGender = "male" | "female";

// معلومات الطالب لتخصيص التدريس على اسمه وعمره وعمله ولمحة عن حياته
export type StudentProfile = {
  name: string;
  age: string;
  job: string;
  bio: string;
};

const EMPTY_PROFILE: StudentProfile = { name: "", age: "", job: "", bio: "" };

export function getStudentProfile(): StudentProfile {
  if (typeof window === "undefined") return EMPTY_PROFILE;
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? { ...EMPTY_PROFILE, ...JSON.parse(raw) } : EMPTY_PROFILE;
  } catch {
    return EMPTY_PROFILE;
  }
}

export function setStudentProfile(p: StudentProfile) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  window.dispatchEvent(new CustomEvent(PROFILE_EVENT, { detail: p }));
}

export function useStudentProfile(): [StudentProfile, (p: StudentProfile) => void] {
  const [profile, setProfile] = useState<StudentProfile>(EMPTY_PROFILE);
  useEffect(() => {
    setProfile(getStudentProfile());
    const handler = () => setProfile(getStudentProfile());
    window.addEventListener(PROFILE_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(PROFILE_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);
  return [profile, setStudentProfile];
}

// بناء سطر تعريفي بالطالب لإدراجه في تعليمات الذكاء الاصطناعي
export function buildStudentContext(p: StudentProfile): string {
  const parts: string[] = [];
  if (p.name?.trim()) parts.push(`الاسم: ${p.name.trim()}`);
  if (p.age?.trim()) parts.push(`العمر: ${p.age.trim()}`);
  if (p.job?.trim()) parts.push(`العمل: ${p.job.trim()}`);
  if (p.bio?.trim()) parts.push(`لمحة عن حياته: ${p.bio.trim()}`);
  return parts.join(" | ");
}

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

// لغة هدف افتراضية مختلفة عن اللغة الأم
export function defaultTargetFor(native: string): string {
  if (native === "ar") return "it";
  if (native === "it") return "ar";
  if (native === "en") return "it";
  return "en";
}

export function getAppLang(): string {
  if (typeof window === "undefined") return "en";
  const native = getNativeLang();
  const stored = localStorage.getItem(LANG_KEY);
  if (!stored || stored === native) return defaultTargetFor(native);
  return stored;
}

export function setAppLang(lang: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LANG_KEY, lang);
  window.dispatchEvent(new CustomEvent(LANG_EVENT, { detail: lang }));
}

// اللغة الأساسية (لغتك الأم) — افتراضياً لغة الهاتف
export function getNativeLang(): string {
  if (typeof window === "undefined") return "ar";
  return localStorage.getItem(NATIVE_KEY) ?? detectDeviceLang();
}

export function setNativeLang(lang: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(NATIVE_KEY, lang);
  window.dispatchEvent(new CustomEvent(NATIVE_EVENT, { detail: lang }));
  // منع تطابق اللغتين: عدّل اللغة الهدف تلقائياً إن تساوت
  if (localStorage.getItem(LANG_KEY) === lang) {
    setAppLang(defaultTargetFor(lang));
  }
}


export function useNativeLang(): [string, (l: string) => void] {
  const [lang, setLang] = useState<string>("ar");
  useEffect(() => {
    setLang(getNativeLang());
    const handler = () => setLang(getNativeLang());
    window.addEventListener(NATIVE_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(NATIVE_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);
  return [lang, setNativeLang];
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
    window.addEventListener(NATIVE_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(LANG_EVENT, handler);
      window.removeEventListener(NATIVE_EVENT, handler);
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

// اسم اللغة الأم بالإنجليزية (لاستخدامه في تعليمات الذكاء الاصطناعي)
export function useNativeLangName(): string {
  const [code] = useNativeLang();
  return LANGUAGES.find((l) => l.code === code)?.name ?? "Arabic";
}
