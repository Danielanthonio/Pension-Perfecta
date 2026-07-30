// Tipos y helpers puros del módulo Classroom.
//
// Vive en src/components/ (no en src/utils/) a propósito: el `content` de
// tailwind.config.ts NO incluye src/utils, así que las clases de la paleta de
// acentos que se definen aquí abajo no se generarían si el archivo estuviera allá.

import type { StatTone } from "@/components/ui/StatCard";

export type ClassroomAudience = "todos" | "aliados" | "equipo";
export type ClassroomAccent = StatTone;
export type ResourceKind = "pdf" | "link" | "sheet" | "slides" | "video" | "other";

export interface ClassroomCourse {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  accent: ClassroomAccent;
  emoji: string | null;
  badge: string | null;
  audience: ClassroomAudience;
  sort_order: number;
  is_published: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ClassroomLesson {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  duration_min: number | null;
  body: string | null;
  sort_order: number;
  is_published: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ClassroomResource {
  id: string;
  course_id: string | null;
  lesson_id: string | null;
  title: string;
  url: string;
  kind: ResourceKind;
  sort_order: number;
  created_at?: string;
}

// ---------------------------------------------------------------------------
// Paleta de acentos
// ---------------------------------------------------------------------------
// `cover` es el degradado de la portada provisional (cuando cover_url es NULL);
// está pensado para imitar la composición de las portadas CGI definitivas:
// título grande a la izquierda, sujeto luminoso a la derecha.

export interface AccentStyle {
  cover: string;
  glow: string;
  chip: string;
  ring: string;
  bar: string;
  solid: string;
  softText: string;
}

export const ACCENTS: Record<ClassroomAccent, AccentStyle> = {
  emerald: {
    cover: "from-emerald-950 via-emerald-800 to-teal-600",
    glow: "bg-emerald-400",
    chip: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
    ring: "ring-emerald-500/30",
    bar: "bg-emerald-600",
    solid: "bg-emerald-600 hover:bg-emerald-700",
    softText: "text-emerald-600 dark:text-emerald-400",
  },
  teal: {
    cover: "from-teal-950 via-teal-800 to-cyan-600",
    glow: "bg-teal-400",
    chip: "bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300",
    ring: "ring-teal-500/30",
    bar: "bg-teal-600",
    solid: "bg-teal-600 hover:bg-teal-700",
    softText: "text-teal-600 dark:text-teal-400",
  },
  blue: {
    cover: "from-slate-950 via-blue-900 to-blue-500",
    glow: "bg-blue-400",
    chip: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
    ring: "ring-blue-500/30",
    bar: "bg-blue-600",
    solid: "bg-blue-600 hover:bg-blue-700",
    softText: "text-blue-600 dark:text-blue-400",
  },
  indigo: {
    cover: "from-indigo-950 via-indigo-800 to-violet-600",
    glow: "bg-indigo-400",
    chip: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300",
    ring: "ring-indigo-500/30",
    bar: "bg-indigo-600",
    solid: "bg-indigo-600 hover:bg-indigo-700",
    softText: "text-indigo-600 dark:text-indigo-400",
  },
  amber: {
    cover: "from-amber-950 via-amber-700 to-orange-500",
    glow: "bg-amber-400",
    chip: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    ring: "ring-amber-500/30",
    bar: "bg-amber-500",
    solid: "bg-amber-500 hover:bg-amber-600",
    softText: "text-amber-600 dark:text-amber-400",
  },
  cyan: {
    cover: "from-cyan-950 via-cyan-800 to-sky-500",
    glow: "bg-cyan-400",
    chip: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300",
    ring: "ring-cyan-500/30",
    bar: "bg-cyan-600",
    solid: "bg-cyan-600 hover:bg-cyan-700",
    softText: "text-cyan-600 dark:text-cyan-400",
  },
  rose: {
    cover: "from-rose-950 via-rose-800 to-pink-600",
    glow: "bg-rose-400",
    chip: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
    ring: "ring-rose-500/30",
    bar: "bg-rose-600",
    solid: "bg-rose-600 hover:bg-rose-700",
    softText: "text-rose-600 dark:text-rose-400",
  },
  slate: {
    cover: "from-slate-950 via-slate-800 to-slate-600",
    glow: "bg-slate-400",
    chip: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    ring: "ring-slate-500/30",
    bar: "bg-slate-500",
    solid: "bg-slate-700 hover:bg-slate-800",
    softText: "text-slate-600 dark:text-slate-300",
  },
};

export const ACCENT_OPTIONS: { value: ClassroomAccent; label: string }[] = [
  { value: "emerald", label: "Esmeralda" },
  { value: "teal", label: "Turquesa" },
  { value: "blue", label: "Azul" },
  { value: "indigo", label: "Índigo" },
  { value: "cyan", label: "Cian" },
  { value: "amber", label: "Ámbar" },
  { value: "rose", label: "Rosa" },
  { value: "slate", label: "Pizarra" },
];

export const accentOf = (a: string | null | undefined): AccentStyle =>
  (a && ACCENTS[a as ClassroomAccent]) || ACCENTS.emerald;

// ---------------------------------------------------------------------------
// Audiencia
// ---------------------------------------------------------------------------

export const AUDIENCE_OPTIONS: { value: ClassroomAudience; label: string; hint: string }[] = [
  { value: "todos", label: "Todos", hint: "Aliados, account managers y dirección" },
  { value: "aliados", label: "Solo aliados", hint: "No aparece para el equipo interno" },
  { value: "equipo", label: "Solo equipo interno", hint: "Dirección y account managers" },
];

/** ¿Le toca este curso al rol que está viendo? La Dirección siempre lo ve todo. */
export function courseVisibleFor(
  course: Pick<ClassroomCourse, "audience" | "is_published">,
  role: string | undefined,
  isEditor: boolean
): boolean {
  if (isEditor) return true;
  if (!course.is_published) return false;
  if (course.audience === "todos") return true;
  if (course.audience === "aliados") return role === "aliado";
  return role === "director" || role === "account_manager";
}

// ---------------------------------------------------------------------------
// Video: resolución del embed
// ---------------------------------------------------------------------------

export type VideoEmbed =
  | { kind: "iframe"; src: string; provider: string }
  | { kind: "file"; src: string; provider: string }
  | { kind: "link"; src: string; provider: string };

const YT_ID = /^[\w-]{11}$/;

/**
 * Convierte la URL que pegó la Dirección en algo reproducible dentro del panel.
 * Soporta YouTube (watch/youtu.be/shorts/live/embed), Vimeo, Loom, Google Drive
 * y archivos de video directos. Si no reconoce el host devuelve un `link` para
 * que la UI ofrezca abrirlo en una pestaña nueva en lugar de romperse.
 */
export function resolveVideoEmbed(raw: string | null | undefined): VideoEmbed | null {
  let url = (raw || "").trim();
  if (!url) return null;

  // En Loom el botón más visible es «Copy embed code», que devuelve un bloque
  // <iframe …> completo, no un link. Si pegaron eso, sacamos el src en vez de
  // fallar: es el error de captura más probable del día a día.
  if (url.includes("<iframe")) {
    const m = url.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (!m) return null;
    url = m[1].trim();
  }

  // Pegar "www.loom.com/share/xxx" sin protocolo es común; new URL() lo rechaza.
  if (!/^[a-z][\w+.-]*:/i.test(url)) url = `https://${url}`;

  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }

  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  const path = u.pathname;

  // --- YouTube ---
  if (host === "youtu.be") {
    const id = path.slice(1).split("/")[0];
    if (YT_ID.test(id)) return { kind: "iframe", src: ytSrc(id, u), provider: "YouTube" };
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    const v = u.searchParams.get("v");
    if (v && YT_ID.test(v)) return { kind: "iframe", src: ytSrc(v, u), provider: "YouTube" };
    const m = path.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/);
    if (m) return { kind: "iframe", src: ytSrc(m[1], u), provider: "YouTube" };
  }

  // --- Vimeo ---
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const m = path.match(/(\d{6,})/);
    if (m) return { kind: "iframe", src: `https://player.vimeo.com/video/${m[1]}`, provider: "Vimeo" };
  }

  // --- Loom ---
  if (host === "loom.com" || host.endsWith(".loom.com")) {
    // /share/<id> y /embed/<id>. Se excluye `folder`: /share/folder/<id> es una
    // carpeta del workspace, no un video, y embeberla da un reproductor vacío.
    const m = path.match(/^\/(?:share|embed)\/([\w-]+)/);
    if (m && m[1] !== "folder") {
      // Loom admite ?t=<segundos> para arrancar en un punto concreto.
      const t = u.searchParams.get("t") || "";
      const qs = /^\d+$/.test(t) ? `?t=${t}` : "";
      return { kind: "iframe", src: `https://www.loom.com/embed/${m[1]}${qs}`, provider: "Loom" };
    }
  }

  // --- Google Drive ---
  if (host === "drive.google.com") {
    const m = path.match(/\/file\/d\/([\w-]+)/);
    if (m) return { kind: "iframe", src: `https://drive.google.com/file/d/${m[1]}/preview`, provider: "Drive" };
  }

  // --- Archivo de video directo ---
  if (/\.(mp4|webm|ogg|ogv|mov|m4v)(\?|$)/i.test(path + u.search)) {
    return { kind: "file", src: url, provider: "Video" };
  }

  return { kind: "link", src: url, provider: host };
}

function ytSrc(id: string, u: URL): string {
  // Respeta un `t`/`start` en segundos si venía en la URL original.
  const t = u.searchParams.get("t") || u.searchParams.get("start") || "";
  const secs = /^(\d+)s?$/.test(t) ? t.replace(/s$/, "") : "";
  const qs = new URLSearchParams({ rel: "0", modestbranding: "1" });
  if (secs) qs.set("start", secs);
  return `https://www.youtube.com/embed/${id}?${qs.toString()}`;
}

// ---------------------------------------------------------------------------
// Progreso
// ---------------------------------------------------------------------------

export interface CourseProgress {
  done: number;
  total: number;
  pct: number;
}

export function courseProgress(lessons: ClassroomLesson[], completed: Set<string>): CourseProgress {
  const total = lessons.length;
  if (total === 0) return { done: 0, total: 0, pct: 0 };
  const done = lessons.reduce((n, l) => (completed.has(l.id) ? n + 1 : n), 0);
  return { done, total, pct: Math.round((done / total) * 100) };
}

export function formatDuration(min: number | null | undefined): string {
  if (!min || min <= 0) return "";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Slug legible y estable a partir del título, para cursos creados desde la UI. */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "curso";
}

export const RESOURCE_KIND_OPTIONS: { value: ResourceKind; label: string }[] = [
  { value: "pdf", label: "PDF" },
  { value: "sheet", label: "Hoja de cálculo" },
  { value: "slides", label: "Presentación" },
  { value: "video", label: "Video" },
  { value: "link", label: "Link" },
  { value: "other", label: "Otro" },
];
