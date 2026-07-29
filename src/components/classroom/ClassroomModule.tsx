"use client";

import React, { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Film,
  GraduationCap,
  Link2,
  Paperclip,
  Pencil,
  Plus,
  Presentation,
  Sparkles,
} from "lucide-react";
import { useApp } from "@/utils/context/AppContext";
import { StatCard } from "@/components/ui/StatCard";
import CourseCover from "./CourseCover";
import { useClassroom } from "./useClassroom";
import {
  CourseEditorModal,
  LessonEditorModal,
  ResourceEditorModal,
  type CourseDraft,
  type LessonDraft,
  type ResourceDraft,
} from "./ClassroomEditors";
import {
  accentOf,
  courseProgress,
  courseVisibleFor,
  formatDuration,
  resolveVideoEmbed,
  type ClassroomCourse,
  type ClassroomLesson,
  type ClassroomResource,
  type ResourceKind,
} from "./classroomTypes";

const RESOURCE_ICON: Record<ResourceKind, typeof FileText> = {
  pdf: FileText,
  sheet: FileSpreadsheet,
  slides: Presentation,
  video: Film,
  link: Link2,
  other: Paperclip,
};

// ---------------------------------------------------------------------------

export default function ClassroomModule() {
  const { user } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const {
    loading, error, isEditor, isLocal,
    courses, completed, lessonsOf, resourcesOf,
    toggleLesson, saveCourse, deleteCourse,
    saveLesson, deleteLesson, saveResource, deleteResource, moveLesson,
  } = useClassroom();

  const [courseDraft, setCourseDraft] = useState<CourseDraft>(null);
  const [lessonDraft, setLessonDraft] = useState<LessonDraft>(null);
  const [resourceDraft, setResourceDraft] = useState<ResourceDraft>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // Cursos que le tocan a este rol (la Dirección ve además los borradores).
  const visible = useMemo(
    () =>
      courses
        .filter((c) => courseVisibleFor(c, user?.role, isEditor))
        .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title)),
    [courses, user?.role, isEditor]
  );

  const activeSlug = searchParams.get("curso");
  const activeCourse = activeSlug ? visible.find((c) => c.slug === activeSlug) || null : null;

  const openCourse = (slug: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (slug) params.set("curso", slug);
    else params.delete("curso");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  // --- Guardados con manejo de error visible -------------------------------
  const run = async (fn: () => Promise<void>, ok: string) => {
    setSaving(true);
    try {
      await fn();
      setToast(ok);
      setCourseDraft(null);
      setLessonDraft(null);
      setResourceDraft(null);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  // --- Estados de carga / error -------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
          <span className="text-xs font-semibold text-slate-400">Cargando Classroom...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/20 p-6 text-center">
        <Database className="mx-auto h-8 w-8 text-amber-500" />
        <h3 className="mt-3 text-sm font-bold text-amber-900 dark:text-amber-200">
          El Classroom todavía no tiene tablas
        </h3>
        <p className="mt-2 text-xs font-medium leading-relaxed text-amber-800 dark:text-amber-300">
          Falta correr la migración{" "}
          <code className="rounded bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 font-mono text-[10px]">
            supabase/migrations/20260729000000_classroom.sql
          </code>{" "}
          en el proyecto de Supabase. En cuanto exista, este módulo se llena solo.
        </p>
        <p className="mt-3 font-mono text-[10px] text-amber-600 dark:text-amber-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {activeCourse ? (
        <CourseDetail
          course={activeCourse}
          lessons={lessonsOf(activeCourse.id)}
          completed={completed}
          isEditor={isEditor}
          resourcesOf={resourcesOf}
          onBack={() => openCourse(null)}
          onToggleLesson={toggleLesson}
          onEditCourse={() => setCourseDraft(activeCourse)}
          onNewLesson={() => setLessonDraft({ course_id: activeCourse.id, sort_order: (lessonsOf(activeCourse.id).length + 1) * 10 })}
          onEditLesson={(l) => setLessonDraft(l)}
          onMoveLesson={(id, dir) => void moveLesson(activeCourse.id, id, dir)}
          onNewResource={(lessonId) =>
            setResourceDraft(
              lessonId
                ? { lesson_id: lessonId, course_id: null }
                : { course_id: activeCourse.id, lesson_id: null }
            )
          }
          onEditResource={(r) => setResourceDraft(r)}
        />
      ) : (
        <CourseGrid
          courses={visible}
          lessonsOf={lessonsOf}
          completed={completed}
          isEditor={isEditor}
          isLocal={isLocal}
          userName={user?.full_name}
          onOpen={(c) => openCourse(c.slug)}
          onNewCourse={() => setCourseDraft({ sort_order: (visible.length + 1) * 10 })}
          onEditCourse={(c) => setCourseDraft(c)}
        />
      )}

      <CourseEditorModal
        draft={courseDraft}
        saving={saving}
        onClose={() => setCourseDraft(null)}
        onSave={(patch) => void run(() => saveCourse(patch), patch.id ? "Curso actualizado." : "Curso creado.")}
        onDelete={(id) =>
          void run(async () => {
            await deleteCourse(id);
            openCourse(null);
          }, "Curso eliminado.")
        }
      />
      <LessonEditorModal
        draft={lessonDraft}
        saving={saving}
        onClose={() => setLessonDraft(null)}
        onSave={(patch) => void run(() => saveLesson(patch), patch.id ? "Lección actualizada." : "Lección agregada.")}
        onDelete={(id) => void run(() => deleteLesson(id), "Lección eliminada.")}
      />
      <ResourceEditorModal
        draft={resourceDraft}
        saving={saving}
        onClose={() => setResourceDraft(null)}
        onSave={(patch) => void run(() => saveResource(patch), patch.id ? "Material actualizado." : "Material agregado.")}
        onDelete={(id) => void run(() => deleteResource(id), "Material eliminado.")}
      />

      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] animate-slide-in rounded-xl border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-850 px-4 py-3 shadow-xl">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{toast}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rejilla de cursos (la vista tipo Skool)
// ---------------------------------------------------------------------------

function CourseGrid({
  courses,
  lessonsOf,
  completed,
  isEditor,
  isLocal,
  userName,
  onOpen,
  onNewCourse,
  onEditCourse,
}: {
  courses: ClassroomCourse[];
  lessonsOf: (id: string) => ClassroomLesson[];
  completed: Set<string>;
  isEditor: boolean;
  isLocal: boolean;
  userName?: string;
  onOpen: (c: ClassroomCourse) => void;
  onNewCourse: () => void;
  onEditCourse: (c: ClassroomCourse) => void;
}) {
  const totals = useMemo(() => {
    let lessons = 0;
    let done = 0;
    let finishedCourses = 0;
    for (const c of courses) {
      const ls = lessonsOf(c.id);
      const p = courseProgress(ls, completed);
      lessons += p.total;
      done += p.done;
      if (p.total > 0 && p.done === p.total) finishedCourses += 1;
    }
    return {
      lessons,
      done,
      finishedCourses,
      pct: lessons ? Math.round((done / lessons) * 100) : 0,
    };
  }, [courses, lessonsOf, completed]);

  const firstName = (userName || "").trim().split(/\s+/)[0];

  return (
    <div className="space-y-6">
      {/* Franja de bienvenida */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
        <span className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-emerald-400 opacity-10 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/20">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-white">
                {firstName ? `Bienvenido, ${firstName}` : "Bienvenido al Classroom"}
              </h2>
              <p className="mt-0.5 max-w-xl text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400">
                Aquí vive toda la inducción: los conceptos, la lógica del sistema y cómo empezar desde
                cero. Arranca por <span className="font-bold text-emerald-600 dark:text-emerald-400">Empieza Aquí</span> y
                sigue el orden.
              </p>
            </div>
          </div>

          {isEditor && (
            <button
              onClick={onNewCourse}
              className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-500/20 transition-all hover:bg-emerald-700 active:scale-95"
            >
              <Plus className="h-4 w-4" />
              Nuevo curso
            </button>
          )}
        </div>
      </div>

      {isLocal && (
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
          <Sparkles className="h-3.5 w-3.5" />
          Modo evaluación · el avance y los cambios se guardan solo en este navegador
        </p>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Cursos" value={courses.length} icon={BookOpen} tone="slate" />
        <StatCard label="Lecciones vistas" value={`${totals.done}/${totals.lessons}`} icon={Film} tone="teal" />
        <StatCard label="Cursos completados" value={totals.finishedCourses} icon={CheckCircle2} tone="emerald" />
        <StatCard label="Tu avance" value={`${totals.pct}%`} icon={GraduationCap} tone="blue" />
      </div>

      {/* Rejilla */}
      {courses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 py-16 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="mt-3 text-sm font-bold text-slate-500 dark:text-slate-400">Todavía no hay cursos</p>
          <p className="mt-1 text-xs font-medium text-slate-400 dark:text-slate-500">
            {isEditor ? "Crea el primero con «Nuevo curso»." : "La Dirección está preparando el material."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((c) => (
            <CourseCard
              key={c.id}
              course={c}
              progress={courseProgress(lessonsOf(c.id), completed)}
              isEditor={isEditor}
              onOpen={() => onOpen(c)}
              onEdit={() => onEditCourse(c)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CourseCard({
  course,
  progress,
  isEditor,
  onOpen,
  onEdit,
}: {
  course: ClassroomCourse;
  progress: { done: number; total: number; pct: number };
  isEditor: boolean;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const a = accentOf(course.accent);
  const done = progress.total > 0 && progress.done === progress.total;

  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
    >
      <CourseCover course={course} />

      {isEditor && (
        <div className="absolute left-2 top-2 flex items-center gap-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            title="Editar curso"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900/70 text-white backdrop-blur-sm transition-colors hover:bg-slate-900"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {!course.is_published && (
            <span className="flex items-center gap-1 rounded-lg bg-amber-500 px-2 py-1.5 text-[9px] font-black uppercase tracking-wider text-white">
              <EyeOff className="h-3 w-3" />
              Borrador
            </span>
          )}
          {course.audience !== "todos" && (
            <span className="rounded-lg bg-slate-900/70 px-2 py-1.5 text-[9px] font-black uppercase tracking-wider text-white backdrop-blur-sm">
              {course.audience === "aliados" ? "Aliados" : "Equipo"}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-1 flex-col p-4">
        <h3 className="flex items-start gap-1.5 text-sm font-bold leading-snug text-slate-800 dark:text-white">
          {course.emoji && <span className="shrink-0 text-base leading-none">{course.emoji}</span>}
          <span className="min-w-0">{course.title}</span>
        </h3>

        {course.description && (
          <p className="mt-1.5 line-clamp-2 text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400">
            {course.description}
          </p>
        )}

        <div className="mt-auto pt-4">
          {/* Barra de avance con el % dentro, como en Skool. En 0% no se pinta
              relleno de color: una barrita coloreada leería como "ya avancé algo". */}
          <div className="relative h-6 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            {progress.pct > 0 ? (
              <div
                className={`flex h-full items-center justify-start rounded-full ${a.bar} transition-all duration-500`}
                style={{ width: `${Math.max(progress.pct, 13)}%` }}
              >
                <span className="pl-2 pr-1 text-[10px] font-black tabular-nums text-white">{progress.pct}%</span>
              </div>
            ) : (
              <span className="flex h-full items-center pl-2.5 text-[10px] font-black tabular-nums text-slate-500 dark:text-slate-400">
                0%
              </span>
            )}
            {done && (
              <Check className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white" />
            )}
          </div>
          {progress.total > 0 && (
            <p className="mt-1.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
              {progress.done} de {progress.total} {progress.total === 1 ? "lección" : "lecciones"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detalle del curso
// ---------------------------------------------------------------------------

function CourseDetail({
  course,
  lessons,
  completed,
  isEditor,
  resourcesOf,
  onBack,
  onToggleLesson,
  onEditCourse,
  onNewLesson,
  onEditLesson,
  onMoveLesson,
  onNewResource,
  onEditResource,
}: {
  course: ClassroomCourse;
  lessons: ClassroomLesson[];
  completed: Set<string>;
  isEditor: boolean;
  resourcesOf: (courseId: string, lessonId?: string | null) => ClassroomResource[];
  onBack: () => void;
  onToggleLesson: (id: string, done: boolean) => Promise<void>;
  onEditCourse: () => void;
  onNewLesson: () => void;
  onEditLesson: (l: ClassroomLesson) => void;
  onMoveLesson: (id: string, dir: -1 | 1) => void;
  onNewResource: (lessonId: string | null) => void;
  onEditResource: (r: ClassroomResource) => void;
}) {
  const a = accentOf(course.accent);
  const progress = courseProgress(lessons, completed);

  // Arranca en la primera lección sin terminar (o en la primera si ya acabó todo).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    const firstPending = lessons.find((l) => !completed.has(l.id));
    setSelectedId((prev) =>
      prev && lessons.some((l) => l.id === prev) ? prev : (firstPending || lessons[0])?.id ?? null
    );
    // Solo al cambiar de curso o cambiar la lista de lecciones.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course.id, lessons.length]);

  const selected = lessons.find((l) => l.id === selectedId) || null;
  const index = selected ? lessons.findIndex((l) => l.id === selected.id) : -1;
  const next = index >= 0 && index < lessons.length - 1 ? lessons[index + 1] : null;
  const isDone = selected ? completed.has(selected.id) : false;
  const embed = resolveVideoEmbed(selected?.video_url);
  const lessonResources = selected ? resourcesOf(course.id, selected.id) : [];
  const courseResources = resourcesOf(course.id, null);

  return (
    <div className="space-y-5">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Todos los cursos
      </button>

      {/* Encabezado del curso */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="w-full shrink-0 overflow-hidden rounded-xl sm:w-56">
            <CourseCover course={course} compact />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h2 className="flex items-start gap-2 text-lg font-bold leading-tight text-slate-800 dark:text-white">
                {course.emoji && <span className="shrink-0">{course.emoji}</span>}
                <span className="min-w-0">{course.title}</span>
              </h2>
              {isEditor && (
                <button
                  onClick={onEditCourse}
                  title="Editar curso"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-750 text-slate-400 transition-colors hover:text-emerald-600 dark:hover:text-emerald-400"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {course.description && (
              <p className="mt-1.5 text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400">
                {course.description}
              </p>
            )}
            <div className="mt-3 flex items-center gap-3">
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className={`h-full rounded-full ${a.bar} transition-all duration-500`}
                  style={{ width: `${progress.pct}%` }}
                />
              </div>
              <span className="shrink-0 text-[11px] font-black tabular-nums text-slate-600 dark:text-slate-300">
                {progress.pct}% · {progress.done}/{progress.total}
              </span>
            </div>
          </div>
        </div>
      </div>

      {lessons.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 py-16 text-center">
          <Film className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="mt-3 text-sm font-bold text-slate-500 dark:text-slate-400">
            Este curso todavía no tiene lecciones
          </p>
          {isEditor ? (
            <button
              onClick={onNewLesson}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-emerald-700"
            >
              <Plus className="h-4 w-4" />
              Agregar la primera lección
            </button>
          ) : (
            <p className="mt-1 text-xs font-medium text-slate-400 dark:text-slate-500">
              Vuelve pronto: el material se sube constantemente.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Reproductor + notas */}
          <div className="space-y-5 lg:col-span-2">
            <div className="overflow-hidden rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <div className="relative aspect-video w-full bg-slate-900">
                {embed?.kind === "iframe" ? (
                  <iframe
                    key={embed.src}
                    src={embed.src}
                    title={selected?.title || "Lección"}
                    className="absolute inset-0 h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                    allowFullScreen
                  />
                ) : embed?.kind === "file" ? (
                  <video key={embed.src} src={embed.src} controls className="absolute inset-0 h-full w-full" />
                ) : (
                  <div className={`absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br ${a.cover}`}>
                    <Film className="h-9 w-9 text-white/60" />
                    <p className="px-6 text-center text-xs font-bold text-white/80">
                      {embed?.kind === "link"
                        ? "Este video vive fuera de la plataforma."
                        : "Esta lección todavía no tiene video."}
                    </p>
                    {embed?.kind === "link" && (
                      <a
                        href={embed.src}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-2 text-[11px] font-bold text-white ring-1 ring-inset ring-white/25 backdrop-blur-sm transition-colors hover:bg-white/25"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Abrirlo en otra pestaña
                      </a>
                    )}
                  </div>
                )}
              </div>

              {selected && (
                <div className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Lección {index + 1} de {lessons.length}
                        {selected.duration_min ? ` · ${formatDuration(selected.duration_min)}` : ""}
                      </span>
                      <h3 className="mt-0.5 text-base font-bold leading-tight text-slate-800 dark:text-white">
                        {selected.title}
                      </h3>
                      {selected.description && (
                        <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400">
                          {selected.description}
                        </p>
                      )}
                    </div>
                    {isEditor && (
                      <button
                        onClick={() => onEditLesson(selected)}
                        title="Editar lección"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-750 text-slate-400 transition-colors hover:text-emerald-600 dark:hover:text-emerald-400"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {selected.body && (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4">
                      <p className="whitespace-pre-line text-xs font-medium leading-relaxed text-slate-600 dark:text-slate-300">
                        {selected.body}
                      </p>
                    </div>
                  )}

                  <ResourceList
                    title="Material de esta lección"
                    resources={lessonResources}
                    isEditor={isEditor}
                    onAdd={() => onNewResource(selected.id)}
                    onEdit={onEditResource}
                  />

                  <div className="flex flex-col gap-2 border-t border-slate-150 dark:border-slate-800 pt-4 sm:flex-row sm:items-center">
                    <button
                      onClick={() => void onToggleLesson(selected.id, !isDone)}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-all active:scale-95 ${
                        isDone
                          ? "border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300"
                          : "bg-emerald-600 text-white shadow-sm shadow-emerald-500/20 hover:bg-emerald-700"
                      }`}
                    >
                      {isDone ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                      {isDone ? "Completada" : "Marcar como completada"}
                    </button>
                    {next && (
                      <button
                        onClick={() => setSelectedId(next.id)}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-850 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        Siguiente lección
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <ResourceList
              title="Material general del curso"
              resources={courseResources}
              isEditor={isEditor}
              onAdd={() => onNewResource(null)}
              onEdit={onEditResource}
              card
            />
          </div>

          {/* Índice de lecciones */}
          <aside className="rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm lg:sticky lg:top-4 lg:h-fit">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Contenido
              </h4>
              {isEditor && (
                <button
                  onClick={onNewLesson}
                  title="Agregar lección"
                  className="flex items-center gap-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 transition-colors hover:bg-emerald-100 dark:hover:bg-emerald-950/60"
                >
                  <Plus className="h-3 w-3" />
                  Lección
                </button>
              )}
            </div>

            <ol className="space-y-1.5">
              {lessons.map((l, i) => {
                const done = completed.has(l.id);
                const active = l.id === selectedId;
                return (
                  <li key={l.id} className="flex items-center gap-1">
                    <button
                      onClick={() => setSelectedId(l.id)}
                      className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
                        active
                          ? "bg-emerald-50 dark:bg-emerald-950/30 ring-1 ring-inset ring-emerald-200 dark:ring-emerald-800/50"
                          : "hover:bg-slate-50 dark:hover:bg-slate-850"
                      }`}
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${
                          done
                            ? "bg-emerald-500 text-white"
                            : active
                              ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500"
                        }`}
                      >
                        {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block truncate text-xs font-bold ${
                            active ? "text-emerald-700 dark:text-emerald-300" : "text-slate-700 dark:text-slate-200"
                          }`}
                        >
                          {l.title}
                        </span>
                        <span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                          {l.duration_min ? formatDuration(l.duration_min) : "Sin duración"}
                          {isEditor && !l.is_published && (
                            <span className="inline-flex items-center gap-0.5 text-amber-500">
                              <EyeOff className="h-2.5 w-2.5" />
                              borrador
                            </span>
                          )}
                          {l.video_url && <Eye className="h-2.5 w-2.5" />}
                        </span>
                      </span>
                    </button>

                    {isEditor && (
                      <span className="flex shrink-0 flex-col">
                        <button
                          onClick={() => onMoveLesson(l.id, -1)}
                          disabled={i === 0}
                          title="Subir"
                          className="text-slate-300 transition-colors hover:text-emerald-600 disabled:opacity-25 dark:text-slate-600 dark:hover:text-emerald-400"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => onMoveLesson(l.id, 1)}
                          disabled={i === lessons.length - 1}
                          title="Bajar"
                          className="text-slate-300 transition-colors hover:text-emerald-600 disabled:opacity-25 dark:text-slate-600 dark:hover:text-emerald-400"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </aside>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ResourceList({
  title,
  resources,
  isEditor,
  onAdd,
  onEdit,
  card = false,
}: {
  title: string;
  resources: ClassroomResource[];
  isEditor: boolean;
  onAdd: () => void;
  onEdit: (r: ClassroomResource) => void;
  card?: boolean;
}) {
  if (resources.length === 0 && !isEditor) return null;

  const inner = (
    <>
      <div className="mb-2.5 flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
          <Paperclip className="h-3 w-3" />
          {title}
        </h4>
        {isEditor && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-600 dark:text-slate-300 transition-colors hover:bg-slate-200 dark:hover:bg-slate-750"
          >
            <Plus className="h-3 w-3" />
            Material
          </button>
        )}
      </div>

      {resources.length === 0 ? (
        <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
          Sin material todavía.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {resources.map((r) => {
            const Icon = RESOURCE_ICON[r.kind] || Paperclip;
            return (
              <li key={r.id} className="flex items-center gap-1">
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 transition-colors hover:border-emerald-300 dark:hover:border-emerald-800/60"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-700 dark:text-slate-200">
                    {r.title}
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-300 transition-colors group-hover:text-emerald-600 dark:text-slate-600 dark:group-hover:text-emerald-400" />
                </a>
                {isEditor && (
                  <button
                    onClick={() => onEdit(r)}
                    title="Editar material"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-300 transition-colors hover:text-emerald-600 dark:text-slate-600 dark:hover:text-emerald-400"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

  return card ? (
    <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">{inner}</div>
  ) : (
    <div>{inner}</div>
  );
}
