// أدوات تقييم النطق: مقارنة نص المتعلّم المنطوق بالجملة الهدف.

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // إزالة التشكيل/العلامات
    .replace(/[^\p{L}\p{N}\s]/gu, "") // إزالة علامات الترقيم
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

export type WordMatch = { word: string; correct: boolean };

export type PronunciationResult = {
  accuracy: number; // نسبة مئوية 0-100
  charAccuracy: number; // دقة الحروف 0-100
  wordAccuracy: number; // دقة الكلمات 0-100
  words: WordMatch[]; // مقارنة كلمة بكلمة للجملة الهدف
  heard: string; // ما تم سماعه
  target: string; // الجملة الهدف
  label: string; // تقييم نصي بالعربية
  color: string; // لون التقييم
};

function scoreLabel(acc: number): { label: string; color: string } {
  if (acc >= 90)
    return { label: "ممتاز! نطق واضح جداً", color: "text-emerald-600 dark:text-emerald-400" };
  if (acc >= 75)
    return { label: "جيد جداً، اقتربت كثيراً", color: "text-emerald-600 dark:text-emerald-400" };
  if (acc >= 55)
    return { label: "جيد، تحتاج بعض التحسين", color: "text-amber-600 dark:text-amber-400" };
  if (acc >= 30)
    return { label: "مقبول، أعد المحاولة", color: "text-amber-600 dark:text-amber-400" };
  return { label: "حاول مجدداً وركّز على اللفظ", color: "text-destructive" };
}

export function assessPronunciation(target: string, heard: string): PronunciationResult {
  const nt = normalize(target);
  const nh = normalize(heard);

  const charDist = levenshtein(nt, nh);
  const charAccuracy = nt.length ? Math.max(0, Math.round((1 - charDist / nt.length) * 100)) : 0;

  const tWords = nt ? nt.split(" ") : [];
  const hWords = nh ? nh.split(" ") : [];
  const hSet = [...hWords];
  const words: WordMatch[] = tWords.map((w) => {
    const idx = hSet.indexOf(w);
    if (idx !== -1) {
      hSet.splice(idx, 1);
      return { word: w, correct: true };
    }
    return { word: w, correct: false };
  });
  const correctCount = words.filter((w) => w.correct).length;
  const wordAccuracy = tWords.length ? Math.round((correctCount / tWords.length) * 100) : 0;

  // متوسط الدقة = مزيج من دقة الكلمات والحروف
  const accuracy = Math.round(wordAccuracy * 0.6 + charAccuracy * 0.4);
  const { label, color } = scoreLabel(accuracy);

  return {
    accuracy,
    charAccuracy,
    wordAccuracy,
    words,
    heard: heard.trim(),
    target: target.trim(),
    label,
    color,
  };
}
