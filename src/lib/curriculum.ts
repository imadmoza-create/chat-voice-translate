// خريطة المنهج للوصول إلى مستوى B2 — مستويات CEFR مع المواضيع لكل مستوى.

export type CEFRLevel = "A1" | "A2" | "B1" | "B2";

export type Theme = {
  id: string;
  title: string; // بالعربية
  emoji: string;
};

export type LevelPlan = {
  level: CEFRLevel;
  title: string;
  desc: string;
  wordTarget: string;
  color: string;
  themes: Theme[];
};

export const LEVELS: LevelPlan[] = [
  {
    level: "A1",
    title: "A1 — المبتدئ",
    desc: "أساسيات اللغة والتعارف والحياة اليومية البسيطة.",
    wordTarget: "≈ 1000 كلمة أساسية",
    color: "from-emerald-500 to-teal-500",
    themes: [
      { id: "a1-greetings", title: "التعارف والتحية", emoji: "👋" },
      { id: "a1-family", title: "العائلة", emoji: "👨‍👩‍👧‍👦" },
      { id: "a1-food", title: "الطعام والشراب", emoji: "🍎" },
      { id: "a1-home", title: "المنزل والأثاث", emoji: "🏠" },
      { id: "a1-numbers", title: "الأرقام", emoji: "🔢" },
      { id: "a1-time", title: "الوقت والأيام", emoji: "⏰" },
      { id: "a1-colors", title: "الألوان والأشكال", emoji: "🌈" },
      { id: "a1-body", title: "أجزاء الجسم", emoji: "🧍" },
    ],
  },
  {
    level: "A2",
    title: "A2 — ما قبل المتوسط",
    desc: "التعامل مع مواقف الحياة اليومية والاحتياجات العملية.",
    wordTarget: "≈ 2000 كلمة إضافية",
    color: "from-sky-500 to-blue-500",
    themes: [
      { id: "a2-shopping", title: "التسوق", emoji: "🛒" },
      { id: "a2-travel", title: "السفر والفنادق", emoji: "✈️" },
      { id: "a2-work", title: "العمل والمهن", emoji: "💼" },
      { id: "a2-health", title: "الصحة والطبيب", emoji: "🩺" },
      { id: "a2-transport", title: "المواصلات", emoji: "🚌" },
      { id: "a2-weather", title: "الطقس والفصول", emoji: "🌤️" },
      { id: "a2-clothes", title: "الملابس", emoji: "👕" },
      { id: "a2-hobbies", title: "الهوايات والرياضة", emoji: "⚽" },
    ],
  },
  {
    level: "B1",
    title: "B1 — المتوسط",
    desc: "التعبير عن الآراء والنقاشات اليومية والمواضيع المألوفة.",
    wordTarget: "≈ 3000 كلمة إضافية",
    color: "from-violet-500 to-purple-500",
    themes: [
      { id: "b1-discussions", title: "النقاشات اليومية", emoji: "💬" },
      { id: "b1-education", title: "التعليم والدراسة", emoji: "🎓" },
      { id: "b1-technology", title: "التكنولوجيا والإنترنت", emoji: "💻" },
      { id: "b1-culture", title: "الثقافة والفنون", emoji: "🎭" },
      { id: "b1-gov", title: "الخدمات الحكومية", emoji: "🏛️" },
      { id: "b1-environment", title: "البيئة والطبيعة", emoji: "🌳" },
      { id: "b1-feelings", title: "المشاعر والعلاقات", emoji: "❤️" },
      { id: "b1-media", title: "وسائل الإعلام", emoji: "📺" },
    ],
  },
  {
    level: "B2",
    title: "B2 — فوق المتوسط",
    desc: "الطلاقة في مواضيع متقدمة ومجردة وبيئة العمل الاحترافية.",
    wordTarget: "≈ 4000–5000 كلمة متقدمة",
    color: "from-amber-500 to-orange-500",
    themes: [
      { id: "b2-workplace", title: "بيئة العمل الاحترافية", emoji: "🏢" },
      { id: "b2-interviews", title: "المقابلات الوظيفية", emoji: "🤝" },
      { id: "b2-news", title: "الأخبار والسياسة", emoji: "📰" },
      { id: "b2-economy", title: "الاقتصاد والمال", emoji: "📈" },
      { id: "b2-social", title: "العلاقات الاجتماعية", emoji: "🌐" },
      { id: "b2-abstract", title: "مواضيع عامة متقدمة", emoji: "🧠" },
      { id: "b2-debate", title: "الجدل وإبداء الرأي", emoji: "⚖️" },
      { id: "b2-academic", title: "اللغة الأكاديمية", emoji: "📚" },
    ],
  },
];

// أنواع التمارين والمهارات لكل درس.
export const SKILLS = [
  { id: "vocab", title: "المفردات", emoji: "📖" },
  { id: "grammar", title: "القواعد وتكوين الجمل", emoji: "🧩" },
  { id: "verbs", title: "الأفعال والتصريف", emoji: "⚡" },
  { id: "listening", title: "الاستماع", emoji: "👂" },
  { id: "writing", title: "الكتابة", emoji: "✍️" },
  { id: "speaking", title: "التحدّث", emoji: "🗣️" },
] as const;

export function levelByCode(level: string): LevelPlan | undefined {
  return LEVELS.find((l) => l.level === level);
}

export function themeById(id: string): { theme: Theme; level: LevelPlan } | undefined {
  for (const level of LEVELS) {
    const theme = level.themes.find((t) => t.id === id);
    if (theme) return { theme, level };
  }
  return undefined;
}

export function nextLevel(level: CEFRLevel): CEFRLevel | null {
  const order: CEFRLevel[] = ["A1", "A2", "B1", "B2"];
  const idx = order.indexOf(level);
  return idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null;
}
