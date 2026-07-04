export type Language = { code: string; name: string; nameAr: string; bcp47: string };

// "auto" handled separately for source
export const LANGUAGES: Language[] = [
  { code: "ar", name: "Arabic", nameAr: "العربية", bcp47: "ar-SA" },
  { code: "en", name: "English", nameAr: "الإنجليزية", bcp47: "en-US" },
  { code: "fr", name: "French", nameAr: "الفرنسية", bcp47: "fr-FR" },
  { code: "es", name: "Spanish", nameAr: "الإسبانية", bcp47: "es-ES" },
  { code: "de", name: "German", nameAr: "الألمانية", bcp47: "de-DE" },
  { code: "it", name: "Italian", nameAr: "الإيطالية", bcp47: "it-IT" },
  { code: "tr", name: "Turkish", nameAr: "التركية", bcp47: "tr-TR" },
  { code: "ru", name: "Russian", nameAr: "الروسية", bcp47: "ru-RU" },
  { code: "zh", name: "Chinese", nameAr: "الصينية", bcp47: "zh-CN" },
  { code: "ja", name: "Japanese", nameAr: "اليابانية", bcp47: "ja-JP" },
  { code: "ko", name: "Korean", nameAr: "الكورية", bcp47: "ko-KR" },
  { code: "hi", name: "Hindi", nameAr: "الهندية", bcp47: "hi-IN" },
  { code: "pt", name: "Portuguese", nameAr: "البرتغالية", bcp47: "pt-PT" },
  { code: "ur", name: "Urdu", nameAr: "الأردية", bcp47: "ur-PK" },
  { code: "fa", name: "Persian", nameAr: "الفارسية", bcp47: "fa-IR" },
  { code: "id", name: "Indonesian", nameAr: "الإندونيسية", bcp47: "id-ID" },
  { code: "ro", name: "Romanian", nameAr: "الرومانية", bcp47: "ro-RO" },
];

export function langByCode(code: string): Language | undefined {
  return LANGUAGES.find((l) => l.code === code);
}
