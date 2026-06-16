import { createFileRoute } from "@tanstack/react-router";
import { Translator } from "@/components/Translator";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({ meta: [{ title: "الترجمة — ترجملي" }] }),
  component: () => <Translator />,
});
