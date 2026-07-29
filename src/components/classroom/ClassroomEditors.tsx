"use client";

import React, { useEffect, useState } from "react";
import { BookOpen, Film, Paperclip, Trash2, X } from "lucide-react";
import CourseCover from "./CourseCover";
import {
  ACCENT_OPTIONS,
  ACCENTS,
  AUDIENCE_OPTIONS,
  RESOURCE_KIND_OPTIONS,
  resolveVideoEmbed,
  slugify,
  type ClassroomAccent,
  type ClassroomAudience,
  type ClassroomCourse,
  type ClassroomLesson,
  type ClassroomResource,
  type ResourceKind,
} from "./classroomTypes";

// Un `draft` en null significa "modal cerrado" (misma convención que
// AgendaAsesoriaModal). Si el draft trae `id` se está editando; si no, creando.
export type CourseDraft = Partial<ClassroomCourse> | null;
export type LessonDraft = (Partial<ClassroomLesson> & { course_id: string }) | null;
export type ResourceDraft = (Partial<ClassroomResource> & { course_id?: string | null; lesson_id?: string | null }) | null;

const INPUT =
  "w-full bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-750 focus:border-emerald-500 outline-none rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors placeholder:text-slate-400 placeholder:font-medium";
const LABEL =
  "block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5";
const BTN_CANCEL =
  "flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs transition-all active:scale-95 disabled:opacity-50";
const BTN_SAVE =
  "flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs shadow-sm shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-1.5";

function Shell({
  icon: Icon,
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  icon: typeof BookOpen;
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in p-4">
      <div
        className={`bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full ${
          wide ? "max-w-2xl" : "max-w-md"
        } border border-slate-200 dark:border-slate-800 animate-scale-up max-h-[90vh] flex flex-col`}
      >
        <div className="flex items-start gap-3 border-b border-slate-150 dark:border-slate-800 p-6 pb-4">
          <div className="h-11 w-11 shrink-0 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-500 dark:text-emerald-400 flex items-center justify-center border border-emerald-150 dark:border-emerald-800/40">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-slate-800 dark:text-white">{title}</h3>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium mt-0.5">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto scrollbar-thin p-6 space-y-4">{children}</div>
      </div>
    </div>
  );
}

function DangerRow({ label, onDelete }: { label: string; onDelete: () => void }) {
  const [armed, setArmed] = useState(false);
  return (
    <div className="pt-2 border-t border-slate-150 dark:border-slate-800">
      {armed ? (
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 flex-1">{label}</span>
          <button
            onClick={() => setArmed(false)}
            className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
          >
            No
          </button>
          <button
            onClick={onDelete}
            className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-rose-600 hover:bg-rose-700 text-white transition-colors"
          >
            Sí, eliminar
          </button>
        </div>
      ) : (
        <button
          onClick={() => setArmed(true)}
          className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Eliminar
        </button>
      )}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  onLabel,
  offLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  onLabel: string;
  offLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-bold transition-colors ${
        checked
          ? "border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300"
          : "border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-850 text-slate-500 dark:text-slate-400"
      }`}
    >
      <span
        className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
          checked ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"
        }`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${checked ? "left-3.5" : "left-0.5"}`}
        />
      </span>
      {checked ? onLabel : offLabel}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Curso
// ---------------------------------------------------------------------------

export function CourseEditorModal({
  draft,
  saving = false,
  onClose,
  onSave,
  onDelete,
}: {
  draft: CourseDraft;
  saving?: boolean;
  onClose: () => void;
  onSave: (patch: Partial<ClassroomCourse> & { id?: string }) => void;
  onDelete?: (id: string) => void;
}) {
  const [f, setF] = useState<Partial<ClassroomCourse>>({});

  useEffect(() => {
    if (!draft) return;
    setF({
      accent: "emerald",
      audience: "todos",
      is_published: true,
      sort_order: 0,
      ...draft,
    });
  }, [draft]);

  if (!draft) return null;

  const editing = Boolean(f.id);
  const title = (f.title || "").trim();

  const submit = () => {
    if (!title) return;
    onSave({
      ...f,
      title,
      slug: f.slug || slugify(title),
      description: (f.description || "").trim() || null,
      cover_url: (f.cover_url || "").trim() || null,
      emoji: (f.emoji || "").trim() || null,
      badge: (f.badge || "").trim() || null,
      sort_order: Number(f.sort_order) || 0,
    });
  };

  return (
    <Shell
      icon={BookOpen}
      title={editing ? "Editar curso" : "Nuevo curso"}
      subtitle="Así se verá la tarjeta en el Classroom de todos."
      onClose={onClose}
      wide
    >
      {/* Vista previa en vivo */}
      <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 max-w-sm mx-auto">
        <CourseCover
          course={{
            title: title || "Título del curso",
            cover_url: (f.cover_url || "").trim() || null,
            accent: (f.accent as ClassroomAccent) || "emerald",
            emoji: f.emoji || null,
            badge: (f.badge || "").trim() || null,
          }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
        <div>
          <label className={LABEL}>Título</label>
          <input
            className={INPUT}
            value={f.title || ""}
            onChange={(e) => setF({ ...f, title: e.target.value })}
            placeholder="Ej. Conceptos de Pensión"
            autoFocus
          />
        </div>
        <div className="sm:w-24">
          <label className={LABEL}>Emoji</label>
          <input
            className={`${INPUT} text-center text-base`}
            value={f.emoji || ""}
            onChange={(e) => setF({ ...f, emoji: e.target.value })}
            placeholder="📘"
            maxLength={4}
          />
        </div>
      </div>

      <div>
        <label className={LABEL}>Descripción</label>
        <textarea
          className={`${INPUT} min-h-[72px] resize-y leading-relaxed`}
          value={f.description || ""}
          onChange={(e) => setF({ ...f, description: e.target.value })}
          placeholder="Dos líneas que expliquen qué se lleva la persona al terminar el curso."
        />
      </div>

      <div>
        <label className={LABEL}>URL de la portada</label>
        <input
          className={INPUT}
          value={f.cover_url || ""}
          onChange={(e) => setF({ ...f, cover_url: e.target.value })}
          placeholder="https://… (déjalo vacío para usar la portada de degradado)"
        />
        <p className="mt-1.5 text-[10px] font-medium text-slate-400 dark:text-slate-500">
          Mientras esté vacío se pinta la portada provisional con el degradado y el emoji.
        </p>
      </div>

      <div>
        <label className={LABEL}>Color del degradado</label>
        <div className="flex flex-wrap gap-2">
          {ACCENT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              title={opt.label}
              onClick={() => setF({ ...f, accent: opt.value })}
              className={`h-9 w-9 rounded-xl bg-gradient-to-br ${ACCENTS[opt.value].cover} transition-all ${
                f.accent === opt.value
                  ? "ring-2 ring-offset-2 ring-emerald-500 dark:ring-offset-slate-900 scale-105"
                  : "opacity-70 hover:opacity-100"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>Cinta de la esquina</label>
          <input
            className={INPUT}
            value={f.badge || ""}
            onChange={(e) => setF({ ...f, badge: e.target.value })}
            placeholder="CURSO / NUEVO (vacío = sin cinta)"
            maxLength={12}
          />
        </div>
        <div>
          <label className={LABEL}>Orden</label>
          <input
            type="number"
            className={INPUT}
            value={f.sort_order ?? 0}
            onChange={(e) => setF({ ...f, sort_order: Number(e.target.value) })}
          />
        </div>
      </div>

      <div>
        <label className={LABEL}>Quién lo ve</label>
        <div className="flex flex-wrap gap-2">
          {AUDIENCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              title={opt.hint}
              onClick={() => setF({ ...f, audience: opt.value as ClassroomAudience })}
              className={`rounded-xl border px-3 py-2 text-[11px] font-bold transition-colors ${
                f.audience === opt.value
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300"
                  : "border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-850 text-slate-500 dark:text-slate-400 hover:border-slate-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <Toggle
        checked={Boolean(f.is_published)}
        onChange={(v) => setF({ ...f, is_published: v })}
        onLabel="Publicado — visible para su audiencia"
        offLabel="Borrador — solo lo ves tú"
      />

      <div className="flex items-center gap-3 pt-1">
        <button onClick={onClose} disabled={saving} className={BTN_CANCEL}>
          Cancelar
        </button>
        <button onClick={submit} disabled={!title || saving} className={BTN_SAVE}>
          <BookOpen className="h-3.5 w-3.5" />
          {saving ? "Guardando..." : editing ? "Guardar cambios" : "Crear curso"}
        </button>
      </div>

      {editing && onDelete && f.id && (
        <DangerRow
          label="Se borran también sus lecciones y material."
          onDelete={() => onDelete(f.id as string)}
        />
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Lección
// ---------------------------------------------------------------------------

export function LessonEditorModal({
  draft,
  saving = false,
  onClose,
  onSave,
  onDelete,
}: {
  draft: LessonDraft;
  saving?: boolean;
  onClose: () => void;
  onSave: (patch: Partial<ClassroomLesson> & { id?: string; course_id: string }) => void;
  onDelete?: (id: string) => void;
}) {
  const [f, setF] = useState<Partial<ClassroomLesson> & { course_id?: string }>({});

  useEffect(() => {
    if (!draft) return;
    setF({ is_published: true, sort_order: 0, ...draft });
  }, [draft]);

  if (!draft) return null;

  const editing = Boolean(f.id);
  const title = (f.title || "").trim();
  const embed = resolveVideoEmbed(f.video_url);

  const submit = () => {
    if (!title || !f.course_id) return;
    onSave({
      ...f,
      course_id: f.course_id,
      title,
      description: (f.description || "").trim() || null,
      video_url: (f.video_url || "").trim() || null,
      body: (f.body || "").trim() || null,
      duration_min: f.duration_min ? Number(f.duration_min) : null,
      sort_order: Number(f.sort_order) || 0,
    });
  };

  return (
    <Shell
      icon={Film}
      title={editing ? "Editar lección" : "Nueva lección"}
      subtitle="Un video, sus notas y el material que lo acompaña."
      onClose={onClose}
      wide
    >
      <div>
        <label className={LABEL}>Título</label>
        <input
          className={INPUT}
          value={f.title || ""}
          onChange={(e) => setF({ ...f, title: e.target.value })}
          placeholder="Ej. Ley 73 vs Ley 97"
          autoFocus
        />
      </div>

      <div>
        <label className={LABEL}>Descripción corta</label>
        <input
          className={INPUT}
          value={f.description || ""}
          onChange={(e) => setF({ ...f, description: e.target.value })}
          placeholder="Una línea de qué resuelve esta lección."
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
        <div>
          <label className={LABEL}>URL del video</label>
          <input
            className={INPUT}
            value={f.video_url || ""}
            onChange={(e) => setF({ ...f, video_url: e.target.value })}
            placeholder="YouTube, Vimeo, Loom, Drive o .mp4"
          />
        </div>
        <div className="sm:w-28">
          <label className={LABEL}>Duración</label>
          <input
            type="number"
            min={0}
            className={INPUT}
            value={f.duration_min ?? ""}
            onChange={(e) => setF({ ...f, duration_min: e.target.value ? Number(e.target.value) : null })}
            placeholder="min"
          />
        </div>
      </div>

      {f.video_url?.trim() && (
        <p
          className={`text-[10px] font-bold ${
            embed?.kind === "iframe" || embed?.kind === "file"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-amber-600 dark:text-amber-400"
          }`}
        >
          {embed?.kind === "iframe" || embed?.kind === "file"
            ? `✓ ${embed.provider} detectado — se reproduce dentro del panel.`
            : "No reconocí el host: se mostrará como un botón para abrirlo en otra pestaña."}
        </p>
      )}

      <div>
        <label className={LABEL}>Notas de la lección</label>
        <textarea
          className={`${INPUT} min-h-[140px] resize-y leading-relaxed`}
          value={f.body || ""}
          onChange={(e) => setF({ ...f, body: e.target.value })}
          placeholder={"Los puntos clave en texto, para quien no quiera ver el video otra vez.\n\nSe respetan los saltos de línea."}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
        <div>
          <label className={LABEL}>Orden</label>
          <input
            type="number"
            className={INPUT}
            value={f.sort_order ?? 0}
            onChange={(e) => setF({ ...f, sort_order: Number(e.target.value) })}
          />
        </div>
        <Toggle
          checked={Boolean(f.is_published)}
          onChange={(v) => setF({ ...f, is_published: v })}
          onLabel="Publicada"
          offLabel="Borrador"
        />
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button onClick={onClose} disabled={saving} className={BTN_CANCEL}>
          Cancelar
        </button>
        <button onClick={submit} disabled={!title || saving} className={BTN_SAVE}>
          <Film className="h-3.5 w-3.5" />
          {saving ? "Guardando..." : editing ? "Guardar cambios" : "Agregar lección"}
        </button>
      </div>

      {editing && onDelete && f.id && (
        <DangerRow label="La lección y su material se borran." onDelete={() => onDelete(f.id as string)} />
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Material de apoyo
// ---------------------------------------------------------------------------

export function ResourceEditorModal({
  draft,
  saving = false,
  onClose,
  onSave,
  onDelete,
}: {
  draft: ResourceDraft;
  saving?: boolean;
  onClose: () => void;
  onSave: (patch: Partial<ClassroomResource> & { id?: string }) => void;
  onDelete?: (id: string) => void;
}) {
  const [f, setF] = useState<Partial<ClassroomResource>>({});

  useEffect(() => {
    if (!draft) return;
    setF({ kind: "link", sort_order: 0, ...draft });
  }, [draft]);

  if (!draft) return null;

  const editing = Boolean(f.id);
  const title = (f.title || "").trim();
  const url = (f.url || "").trim();

  return (
    <Shell
      icon={Paperclip}
      title={editing ? "Editar material" : "Agregar material de apoyo"}
      subtitle={draft.lesson_id ? "Queda colgado de esta lección." : "Queda en el material general del curso."}
      onClose={onClose}
    >
      <div>
        <label className={LABEL}>Nombre</label>
        <input
          className={INPUT}
          value={f.title || ""}
          onChange={(e) => setF({ ...f, title: e.target.value })}
          placeholder="Ej. Tabla de semanas cotizadas 2026"
          autoFocus
        />
      </div>

      <div>
        <label className={LABEL}>URL</label>
        <input
          className={INPUT}
          value={f.url || ""}
          onChange={(e) => setF({ ...f, url: e.target.value })}
          placeholder="https://…"
        />
      </div>

      <div>
        <label className={LABEL}>Tipo</label>
        <div className="flex flex-wrap gap-2">
          {RESOURCE_KIND_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setF({ ...f, kind: opt.value as ResourceKind })}
              className={`rounded-xl border px-3 py-1.5 text-[11px] font-bold transition-colors ${
                f.kind === opt.value
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300"
                  : "border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-850 text-slate-500 dark:text-slate-400 hover:border-slate-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button onClick={onClose} disabled={saving} className={BTN_CANCEL}>
          Cancelar
        </button>
        <button
          onClick={() => title && url && onSave({ ...f, title, url, sort_order: Number(f.sort_order) || 0 })}
          disabled={!title || !url || saving}
          className={BTN_SAVE}
        >
          <Paperclip className="h-3.5 w-3.5" />
          {saving ? "Guardando..." : editing ? "Guardar" : "Agregar"}
        </button>
      </div>

      {editing && onDelete && f.id && (
        <DangerRow label="Se quita del curso." onDelete={() => onDelete(f.id as string)} />
      )}
    </Shell>
  );
}
