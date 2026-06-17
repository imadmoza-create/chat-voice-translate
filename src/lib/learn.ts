export type LearnItem = { emoji: string; ar: string; en: string };
export type LearnCategory = { id: string; title: string; emoji: string; items: LearnItem[] };

// قوائم الكلمات الشائعة مصنّفة، لكل كلمة رمز توضيحي
export const WORD_CATEGORIES: LearnCategory[] = [
  {
    id: "family",
    title: "العائلة",
    emoji: "👨‍👩‍👧‍👦",
    items: [
      { emoji: "👨", ar: "أب", en: "Father" },
      { emoji: "👩", ar: "أم", en: "Mother" },
      { emoji: "👦", ar: "ابن", en: "Son" },
      { emoji: "👧", ar: "ابنة", en: "Daughter" },
      { emoji: "👴", ar: "جد", en: "Grandfather" },
      { emoji: "👵", ar: "جدة", en: "Grandmother" },
      { emoji: "👶", ar: "طفل", en: "Baby" },
      { emoji: "👫", ar: "صديق", en: "Friend" },
    ],
  },
  {
    id: "food",
    title: "الطعام",
    emoji: "🍎",
    items: [
      { emoji: "🍞", ar: "خبز", en: "Bread" },
      { emoji: "💧", ar: "ماء", en: "Water" },
      { emoji: "🍎", ar: "تفاحة", en: "Apple" },
      { emoji: "🍌", ar: "موز", en: "Banana" },
      { emoji: "🥛", ar: "حليب", en: "Milk" },
      { emoji: "🍚", ar: "أرز", en: "Rice" },
      { emoji: "🍗", ar: "دجاج", en: "Chicken" },
      { emoji: "☕", ar: "قهوة", en: "Coffee" },
    ],
  },
  {
    id: "animals",
    title: "الحيوانات",
    emoji: "🐱",
    items: [
      { emoji: "🐱", ar: "قطة", en: "Cat" },
      { emoji: "🐶", ar: "كلب", en: "Dog" },
      { emoji: "🐴", ar: "حصان", en: "Horse" },
      { emoji: "🐦", ar: "طائر", en: "Bird" },
      { emoji: "🐟", ar: "سمكة", en: "Fish" },
      { emoji: "🦁", ar: "أسد", en: "Lion" },
      { emoji: "🐘", ar: "فيل", en: "Elephant" },
      { emoji: "🐝", ar: "نحلة", en: "Bee" },
    ],
  },
  {
    id: "colors",
    title: "الألوان",
    emoji: "🌈",
    items: [
      { emoji: "🔴", ar: "أحمر", en: "Red" },
      { emoji: "🔵", ar: "أزرق", en: "Blue" },
      { emoji: "🟢", ar: "أخضر", en: "Green" },
      { emoji: "🟡", ar: "أصفر", en: "Yellow" },
      { emoji: "⚫", ar: "أسود", en: "Black" },
      { emoji: "⚪", ar: "أبيض", en: "White" },
      { emoji: "🟠", ar: "برتقالي", en: "Orange" },
      { emoji: "🟣", ar: "بنفسجي", en: "Purple" },
    ],
  },
  {
    id: "nature",
    title: "الطبيعة",
    emoji: "🌳",
    items: [
      { emoji: "☀️", ar: "شمس", en: "Sun" },
      { emoji: "🌙", ar: "قمر", en: "Moon" },
      { emoji: "⭐", ar: "نجمة", en: "Star" },
      { emoji: "🌳", ar: "شجرة", en: "Tree" },
      { emoji: "🌹", ar: "وردة", en: "Flower" },
      { emoji: "🌧️", ar: "مطر", en: "Rain" },
      { emoji: "🔥", ar: "نار", en: "Fire" },
      { emoji: "🏔️", ar: "جبل", en: "Mountain" },
    ],
  },
  {
    id: "actions",
    title: "أفعال",
    emoji: "🏃",
    items: [
      { emoji: "🍽️", ar: "يأكل", en: "Eat" },
      { emoji: "🥤", ar: "يشرب", en: "Drink" },
      { emoji: "😴", ar: "ينام", en: "Sleep" },
      { emoji: "🏃", ar: "يجري", en: "Run" },
      { emoji: "📖", ar: "يقرأ", en: "Read" },
      { emoji: "✍️", ar: "يكتب", en: "Write" },
      { emoji: "🗣️", ar: "يتكلم", en: "Speak" },
      { emoji: "👂", ar: "يستمع", en: "Listen" },
    ],
  },
];

// الضمائر مع رمز توضيحي يبيّن المقصود
export const PRONOUNS: LearnItem[] = [
  { emoji: "🙋", ar: "أنا", en: "I" },
  { emoji: "👉", ar: "أنتَ", en: "You (m)" },
  { emoji: "👉", ar: "أنتِ", en: "You (f)" },
  { emoji: "👨", ar: "هو", en: "He" },
  { emoji: "👩", ar: "هي", en: "She" },
  { emoji: "🧑‍🤝‍🧑", ar: "نحن", en: "We" },
  { emoji: "👥", ar: "أنتم", en: "You (pl)" },
  { emoji: "👫", ar: "هم", en: "They" },
  { emoji: "📦", ar: "هذا", en: "This" },
  { emoji: "📦", ar: "ذلك", en: "That" },
];
