import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { translateImage } from "@/lib/translate.functions";
import type { Conjugation } from "@/lib/translate.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Upload, Loader2, Crop, X, Sparkles, Check, Camera as CameraIcon } from "lucide-react";

export type ImgResult = {
  detectedLang: string;
  translation: string;
  sourceText: string;
  conjugations: Conjugation[];
};

type ImgItem = { id: string; dataUrl: string };
type Rect = { x: number; y: number; w: number; h: number };

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Crop a region (in natural image coords) from a data URL.
function cropDataUrl(dataUrl: string, rect: Rect): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(rect.w));
      canvas.height = Math.max(1, Math.round(rect.h));
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no ctx"));
      ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export function ImageTranslator({
  targetLangName,
  onResult,
}: {
  targetLangName: string;
  onResult: (r: ImgResult) => void;
}) {
  const doImage = useServerFn(translateImage);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ImgItem[]>([]);
  const [busy, setBusy] = useState(false);

  // crop dialog state
  const [cropping, setCropping] = useState<ImgItem | null>(null);
  const imgElRef = useRef<HTMLImageElement>(null);
  const [sel, setSel] = useState<Rect | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const addFiles = async (files: FileList) => {
    const next: ImgItem[] = [];
    for (const file of Array.from(files).slice(0, 6)) {
      if (file.size > 8_000_000) { toast.error(`تم تجاوز الحد 8MB: ${file.name}`); continue; }
      const dataUrl = await readFile(file);
      next.push({ id: crypto.randomUUID(), dataUrl });
    }
    setItems((p) => [...p, ...next].slice(0, 6));
  };

  const removeItem = (id: string) => setItems((p) => p.filter((i) => i.id !== id));

  const pointer = (e: React.PointerEvent) => {
    const el = imgElRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: Math.min(Math.max(e.clientX - rect.left, 0), rect.width),
      y: Math.min(Math.max(e.clientY - rect.top, 0), rect.height),
    };
  };

  const onDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = pointer(e);
    dragStart.current = p;
    setSel({ x: p.x, y: p.y, w: 0, h: 0 });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragStart.current) return;
    const p = pointer(e);
    const s = dragStart.current;
    setSel({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  };
  const onUp = () => { dragStart.current = null; };

  const applyCrop = async () => {
    if (!cropping) return;
    const el = imgElRef.current;
    if (!el || !sel || sel.w < 5 || sel.h < 5) { setCropping(null); setSel(null); return; }
    const scaleX = el.naturalWidth / el.clientWidth;
    const scaleY = el.naturalHeight / el.clientHeight;
    const natRect: Rect = {
      x: sel.x * scaleX, y: sel.y * scaleY, w: sel.w * scaleX, h: sel.h * scaleY,
    };
    try {
      const cropped = await cropDataUrl(cropping.dataUrl, natRect);
      setItems((p) => p.map((i) => (i.id === cropping.id ? { ...i, dataUrl: cropped } : i)));
      toast.success("تم تحديد المنطقة");
    } catch {
      toast.error("تعذّر قص الصورة");
    } finally {
      setCropping(null);
      setSel(null);
    }
  };

  const translateAll = async () => {
    if (!items.length) return;
    setBusy(true);
    try {
      const results: ImgResult[] = [];
      for (const it of items) {
        const r = (await doImage({ data: { image: it.dataUrl, targetLang: targetLangName } })) as ImgResult;
        results.push(r);
      }
      const combined: ImgResult = {
        detectedLang: results[0]?.detectedLang ?? "",
        sourceText: results.map((r) => r.sourceText).filter(Boolean).join("\n\n"),
        translation: results.map((r) => r.translation).filter(Boolean).join("\n\n"),
        conjugations: results.flatMap((r) => r.conjugations),
      };
      onResult(combined);
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (msg.includes("RATE_LIMIT")) toast.error("تم تجاوز حد الطلبات، حاول بعد قليل.");
      else if (msg.includes("CREDITS")) toast.error("نفد رصيد الذكاء الاصطناعي.");
      else toast.error("تعذّرت الترجمة، حاول مجدداً.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && addFiles(e.target.files)}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => e.target.files && addFiles(e.target.files)}
      />

      {items.length === 0 ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => cameraRef.current?.click()}
            className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border bg-card p-8 transition-colors hover:border-primary"
          >
            <CameraIcon className="size-8 text-primary" />
            <span className="font-medium">التقاط بالكاميرا</span>
            <span className="text-xs text-muted-foreground">صوّر نصاً مباشرة</span>
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border bg-card p-8 transition-colors hover:border-primary"
          >
            <Upload className="size-8 text-primary" />
            <span className="font-medium">اختر صورة/صور</span>
            <span className="text-xs text-muted-foreground">حتى 6 صور</span>
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {items.map((it) => (
              <div key={it.id} className="group relative overflow-hidden rounded-xl border bg-card">
                <img src={it.dataUrl} alt="صورة" className="aspect-square w-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                  <button
                    onClick={() => { setCropping(it); setSel(null); }}
                    className="rounded-md bg-card/90 p-1 text-foreground"
                    title="تحديد منطقة النص"
                  >
                    <Crop className="size-3.5" />
                  </button>
                  <button
                    onClick={() => removeItem(it.id)}
                    className="rounded-md bg-card/90 p-1 text-destructive"
                    title="حذف"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {items.length < 6 && (
              <button
                onClick={() => fileRef.current?.click()}
                className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-border text-muted-foreground hover:border-primary"
              >
                <Upload className="size-5" />
              </button>
            )}
          </div>
          <Button onClick={translateAll} disabled={busy} className="w-full rounded-xl gradient-primary text-primary-foreground shadow-glow">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <><Sparkles className="size-4" /> ترجم الصور ({items.length})</>}
          </Button>
        </>
      )}

      <Dialog open={!!cropping} onOpenChange={(o) => { if (!o) { setCropping(null); setSel(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>تحديد منطقة النص</DialogTitle>
          </DialogHeader>
          {cropping && (
            <div className="select-none">
              <div className="relative inline-block touch-none">
                <img
                  ref={imgElRef}
                  src={cropping.dataUrl}
                  alt="قص"
                  className="max-h-[60vh] w-full rounded-lg object-contain"
                  draggable={false}
                  onPointerDown={onDown}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                />
                {sel && sel.w > 0 && (
                  <div
                    className="pointer-events-none absolute border-2 border-primary bg-primary/20"
                    style={{ left: sel.x, top: sel.y, width: sel.w, height: sel.h }}
                  />
                )}
              </div>
              <p className="mt-2 text-center text-xs text-muted-foreground">اسحب لرسم مستطيل حول النص المطلوب</p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="secondary" className="rounded-xl" onClick={() => { setCropping(null); setSel(null); }}>إلغاء</Button>
            <Button className="rounded-xl gradient-primary text-primary-foreground gap-1.5" onClick={applyCrop}>
              <Check className="size-4" /> تطبيق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
