// قائمة ألفاظ بذيئة/مسيئة للكشف التلقائي (عربي + إنجليزي شائعة)
// تُستخدم لمنع الإزعاج والألفاظ النابية في الدردشة المشتركة.
const BAD_WORDS: string[] = [
  // عربي
  "كلب", "حمار", "غبي", "غبية", "احمق", "أحمق", "خرا", "خراء", "قذر", "قذرة",
  "تفو", "لعنة", "ملعون", "ملعونة", "حقير", "حقيرة", "وسخ", "وسخة", "كس", "زب",
  "طيز", "شرموط", "شرموطة", "عاهر", "عاهرة", "منيك", "متناك", "نيك", "زبي",
  "خول", "خنيث", "قحبة", "زانية", "زاني", "معرص", "ابن الكلب", "ابن الحرام",
  "يلعن", "انقلع", "اخرس", "اخرسي", "تبا", "تباً",
  // إنجليزي
  "fuck", "fucker", "fucking", "shit", "bitch", "bastard", "asshole", "dick",
  "pussy", "cunt", "slut", "whore", "motherfucker", "idiot", "stupid", "moron",
  "retard", "damn", "crap", "dumb", "jerk", "prick", "faggot", "nigger",
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[إأآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\u064B-\u0652]/g, "") // تشكيل
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type ModerationResult = { clean: boolean; hits: string[] };

// يفحص النص ويعيد الكلمات المخالفة إن وُجدت
export function moderateText(text: string): ModerationResult {
  const norm = normalize(text);
  const padded = ` ${norm} `;
  const hits: string[] = [];
  for (const w of BAD_WORDS) {
    const nw = normalize(w);
    if (!nw) continue;
    if (padded.includes(` ${nw} `) || padded.includes(nw)) hits.push(w);
  }
  return { clean: hits.length === 0, hits: [...new Set(hits)] };
}
