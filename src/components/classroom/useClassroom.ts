"use client";

// Capa de datos del Classroom.
//
// Deliberadamente NO pasa por AppContext: ese archivo ya carga ~4k líneas y todo
// el estado del pipeline. El Classroom es independiente del pipeline comercial,
// así que habla directo con Supabase (mismo patrón que admin/agenda-futura, que
// también crea su propio cliente) y cae a localStorage en modo demo para que la
// previsualización local siga funcionando sin tocar producción.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/utils/context/AppContext";
import { createClient } from "@/utils/supabase/client";
import type {
  ClassroomCourse,
  ClassroomLesson,
  ClassroomResource,
} from "./classroomTypes";

const LS_COURSES = "pensionflow_classroom_courses";
const LS_LESSONS = "pensionflow_classroom_lessons";
const LS_RESOURCES = "pensionflow_classroom_resources";
const LS_PROGRESS = "pensionflow_classroom_progress";

const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `cl_${Math.abs(Date.now() ^ 0x5f3759df).toString(36)}${performance.now().toString(36).replace(".", "")}`;

// ---------------------------------------------------------------------------
// Siembra para modo demo — refleja la de 20260729000000_classroom.sql
// ---------------------------------------------------------------------------

const DEMO_COURSES: Omit<ClassroomCourse, "id">[] = [
  {
    slug: "empieza-aqui",
    title: "Empieza Aquí",
    description:
      "Ya estás dentro. Este es el primer curso que tienes que ver: qué es Pensión Perfecta, cómo se gana y cuál es tu primer paso.",
    cover_url: null, accent: "emerald", emoji: "➡️", badge: null,
    audience: "todos", sort_order: 10, is_published: true,
  },
  {
    slug: "conceptos-de-pension",
    title: "Conceptos de Pensión",
    description:
      "Ley 73 vs Ley 97, Modalidad 40, semanas cotizadas, salario promedio y AFORE. Los cimientos que necesitas para hablar con un cliente.",
    cover_url: null, accent: "blue", emoji: "📘", badge: "CURSO",
    audience: "todos", sort_order: 20, is_published: true,
  },
  {
    slug: "pipeline-del-cliente",
    title: "El Pipeline del Cliente",
    description:
      "Las 6 etapas por las que pasa un expediente, qué significa cada una y quién mueve qué en cada momento.",
    cover_url: null, accent: "indigo", emoji: "🔀", badge: "CURSO",
    audience: "todos", sort_order: 30, is_published: true,
  },
  {
    slug: "sube-tu-primer-cliente",
    title: "Sube tu Primer Cliente",
    description:
      "De cero a expediente cargado: cómo registrar un prospecto, qué datos son obligatorios y cómo evitar duplicados.",
    cover_url: null, accent: "teal", emoji: "🚀", badge: "CURSO",
    audience: "aliados", sort_order: 40, is_published: true,
  },
  {
    slug: "expediente-y-documentos",
    title: "Expediente y Documentos",
    description:
      "Qué documento pide cada tipo de financiamiento, cómo se sube y por qué un expediente incompleto frena la aprobación.",
    cover_url: null, accent: "amber", emoji: "📁", badge: "CURSO",
    audience: "todos", sort_order: 50, is_published: true,
  },
  {
    slug: "tipos-de-financiamiento",
    title: "Tipos de Financiamiento",
    description:
      "Modalidad 40, Ley 10 y crédito de nómina: cuándo aplica cada uno y cómo se decide la modalidad de aprobación.",
    cover_url: null, accent: "cyan", emoji: "💳", badge: "CURSO",
    audience: "todos", sort_order: 60, is_published: true,
  },
  {
    slug: "portal-de-aliados",
    title: "Portal de Aliados",
    description:
      "Tu panel por dentro: dashboard, Mis Clientes, filtros, la línea de tiempo y cómo agendar la asesoría.",
    cover_url: null, accent: "rose", emoji: "🧭", badge: "CURSO",
    audience: "aliados", sort_order: 70, is_published: true,
  },
  {
    slug: "preguntas-frecuentes",
    title: "Preguntas Frecuentes",
    description:
      "El material de apoyo que se sube constantemente para aclarar dudas. Revísalo antes de preguntar.",
    cover_url: null, accent: "slate", emoji: "❓", badge: null,
    audience: "todos", sort_order: 80, is_published: true,
  },
];

// Un par de lecciones de ejemplo solo en demo, para que el grid no salga en 0%
// y se pueda ver el reproductor sin cargar nada.
const DEMO_LESSONS: { courseSlug: string; lesson: Omit<ClassroomLesson, "id" | "course_id"> }[] = [
  {
    courseSlug: "empieza-aqui",
    lesson: {
      title: "Bienvenido a Pensión Perfecta",
      description: "Qué hacemos, a quién ayudamos y cómo encaja tu trabajo en el proceso.",
      video_url: null, duration_min: 8,
      body: "Puntos clave:\n\n1. Ayudamos a que un trabajador se pensione con el mejor monto posible.\n2. Tú detectas al candidato y cargas su expediente.\n3. Dirección evalúa y define la modalidad de aprobación.\n4. Cuando se firma, tú cobras.",
      sort_order: 10, is_published: true,
    },
  },
  {
    courseSlug: "empieza-aqui",
    lesson: {
      title: "Tu primer paso hoy",
      description: "Completa tu perfil, entiende el tablero y prepara tu primer prospecto.",
      video_url: null, duration_min: 6,
      body: "Antes de cerrar sesión hoy:\n\n· Completa tu perfil al 100% (foto incluida).\n· Recorre el dashboard y ubica «Mis Clientes».\n· Anota tres personas de tu círculo cercano que estén por pensionarse.",
      sort_order: 20, is_published: true,
    },
  },
  {
    courseSlug: "conceptos-de-pension",
    lesson: {
      title: "Ley 73 vs Ley 97",
      description: "La pregunta que define todo lo demás: ¿bajo qué ley se va a pensionar?",
      video_url: null, duration_min: 12,
      body: "Regla práctica: si cotizó por primera vez al IMSS ANTES del 1 de julio de 1997, es Ley 73. Si fue después, es Ley 97.\n\nLey 73 se pensiona con salario promedio de las últimas 250 semanas — ahí es donde Modalidad 40 cambia la vida del cliente.",
      sort_order: 10, is_published: true,
    },
  },
];

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLS(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* cuota llena: el modo demo puede seguir en memoria */
  }
}

function seedDemo(): { courses: ClassroomCourse[]; lessons: ClassroomLesson[] } {
  const courses: ClassroomCourse[] = DEMO_COURSES.map((c) => ({ ...c, id: newId() }));
  const lessons: ClassroomLesson[] = [];
  for (const { courseSlug, lesson } of DEMO_LESSONS) {
    const course = courses.find((c) => c.slug === courseSlug);
    if (course) lessons.push({ ...lesson, id: newId(), course_id: course.id });
  }
  writeLS(LS_COURSES, courses);
  writeLS(LS_LESSONS, lessons);
  writeLS(LS_RESOURCES, []);
  return { courses, lessons };
}

// ---------------------------------------------------------------------------

export interface UseClassroom {
  loading: boolean;
  error: string | null;
  isEditor: boolean;
  isLocal: boolean;
  courses: ClassroomCourse[];
  lessons: ClassroomLesson[];
  resources: ClassroomResource[];
  completed: Set<string>;
  lessonsOf: (courseId: string) => ClassroomLesson[];
  resourcesOf: (courseId: string, lessonId?: string | null) => ClassroomResource[];
  toggleLesson: (lessonId: string, done: boolean) => Promise<void>;
  saveCourse: (patch: Partial<ClassroomCourse> & { id?: string }) => Promise<void>;
  deleteCourse: (id: string) => Promise<void>;
  saveLesson: (patch: Partial<ClassroomLesson> & { id?: string; course_id: string }) => Promise<void>;
  deleteLesson: (id: string) => Promise<void>;
  saveResource: (patch: Partial<ClassroomResource> & { id?: string }) => Promise<void>;
  deleteResource: (id: string) => Promise<void>;
  moveLesson: (courseId: string, lessonId: string, dir: -1 | 1) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useClassroom(): UseClassroom {
  const { user, isDemoMode, isProvisionalSession } = useApp();

  const supabase = useMemo(() => {
    try {
      return createClient();
    } catch {
      return null;
    }
  }, []);

  // En modo demo/provisional se trabaja contra localStorage, igual que el resto
  // de la app, para no escribir nunca en producción desde una previsualización.
  const isLocal = isDemoMode || isProvisionalSession || !supabase;
  const isEditor = user?.role === "director";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [courses, setCourses] = useState<ClassroomCourse[]>([]);
  const [lessons, setLessons] = useState<ClassroomLesson[]>([]);
  const [resources, setResources] = useState<ClassroomResource[]>([]);
  const [completed, setCompleted] = useState<Set<string>>(new Set());

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (isLocal) {
      let c = readLS<ClassroomCourse[]>(LS_COURSES, []);
      let l = readLS<ClassroomLesson[]>(LS_LESSONS, []);
      if (c.length === 0) {
        const seeded = seedDemo();
        c = seeded.courses;
        l = seeded.lessons;
      }
      if (!mounted.current) return;
      setCourses(c);
      setLessons(l);
      setResources(readLS<ClassroomResource[]>(LS_RESOURCES, []));
      setCompleted(new Set(readLS<string[]>(LS_PROGRESS, [])));
      setLoading(false);
      return;
    }

    try {
      const [cRes, lRes, rRes, pRes] = await Promise.all([
        supabase!.from("classroom_courses").select("*").order("sort_order", { ascending: true }),
        supabase!.from("classroom_lessons").select("*").order("sort_order", { ascending: true }),
        supabase!.from("classroom_resources").select("*").order("sort_order", { ascending: true }),
        user?.id
          ? supabase!.from("classroom_progress").select("lesson_id").eq("user_id", user.id)
          : Promise.resolve({ data: [], error: null } as { data: { lesson_id: string }[]; error: null }),
      ]);

      if (!mounted.current) return;

      const firstErr = cRes.error || lRes.error || rRes.error;
      if (firstErr) {
        // Lo más probable: la migración 20260729000000_classroom.sql aún no corre.
        setError(firstErr.message);
        setCourses([]);
        setLessons([]);
        setResources([]);
        setLoading(false);
        return;
      }

      setCourses((cRes.data || []) as ClassroomCourse[]);
      setLessons((lRes.data || []) as ClassroomLesson[]);
      setResources((rRes.data || []) as ClassroomResource[]);
      setCompleted(new Set(((pRes.data || []) as { lesson_id: string }[]).map((r) => r.lesson_id)));
      setLoading(false);
    } catch (e) {
      if (!mounted.current) return;
      setError(e instanceof Error ? e.message : "No se pudo cargar el Classroom.");
      setLoading(false);
    }
  }, [isLocal, supabase, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // --- Avance ---------------------------------------------------------------
  const toggleLesson = useCallback(
    async (lessonId: string, done: boolean) => {
      // El cálculo va fuera del updater: escribir en localStorage dentro de él
      // lo convierte en impuro y StrictMode lo ejecutaría dos veces.
      const next = new Set(completed);
      if (done) next.add(lessonId);
      else next.delete(lessonId);
      setCompleted(next);
      if (isLocal) writeLS(LS_PROGRESS, Array.from(next));

      if (isLocal || !user?.id) return;
      if (done) {
        // upsert y no insert: si la fila ya existía, marcar de nuevo no debe fallar.
        await supabase!
          .from("classroom_progress")
          .upsert({ user_id: user.id, lesson_id: lessonId }, { onConflict: "user_id,lesson_id" });
      } else {
        await supabase!
          .from("classroom_progress")
          .delete()
          .eq("user_id", user.id)
          .eq("lesson_id", lessonId);
      }
    },
    [completed, isLocal, supabase, user?.id]
  );

  // --- Cursos ---------------------------------------------------------------
  const saveCourse = useCallback(
    async (patch: Partial<ClassroomCourse> & { id?: string }) => {
      if (isLocal) {
        setCourses((prev) => {
          const next = patch.id
            ? prev.map((c) => (c.id === patch.id ? { ...c, ...patch } : c))
            : [...prev, { ...(patch as ClassroomCourse), id: newId() }];
          writeLS(LS_COURSES, next);
          return next;
        });
        return;
      }
      const { id, ...fields } = patch;
      const { error: err } = id
        ? await supabase!.from("classroom_courses").update(fields).eq("id", id)
        : await supabase!.from("classroom_courses").insert(fields);
      if (err) throw new Error(err.message);
      await load();
    },
    [isLocal, supabase, load]
  );

  const deleteCourse = useCallback(
    async (id: string) => {
      if (isLocal) {
        setCourses((prev) => {
          const next = prev.filter((c) => c.id !== id);
          writeLS(LS_COURSES, next);
          return next;
        });
        setLessons((prev) => {
          const next = prev.filter((l) => l.course_id !== id);
          writeLS(LS_LESSONS, next);
          return next;
        });
        return;
      }
      const { error: err } = await supabase!.from("classroom_courses").delete().eq("id", id);
      if (err) throw new Error(err.message);
      await load();
    },
    [isLocal, supabase, load]
  );

  // --- Lecciones ------------------------------------------------------------
  const saveLesson = useCallback(
    async (patch: Partial<ClassroomLesson> & { id?: string; course_id: string }) => {
      if (isLocal) {
        setLessons((prev) => {
          const next = patch.id
            ? prev.map((l) => (l.id === patch.id ? { ...l, ...patch } : l))
            : [...prev, { ...(patch as ClassroomLesson), id: newId() }];
          writeLS(LS_LESSONS, next);
          return next;
        });
        return;
      }
      const { id, ...fields } = patch;
      const { error: err } = id
        ? await supabase!.from("classroom_lessons").update(fields).eq("id", id)
        : await supabase!.from("classroom_lessons").insert(fields);
      if (err) throw new Error(err.message);
      await load();
    },
    [isLocal, supabase, load]
  );

  const deleteLesson = useCallback(
    async (id: string) => {
      if (isLocal) {
        setLessons((prev) => {
          const next = prev.filter((l) => l.id !== id);
          writeLS(LS_LESSONS, next);
          return next;
        });
        return;
      }
      const { error: err } = await supabase!.from("classroom_lessons").delete().eq("id", id);
      if (err) throw new Error(err.message);
      await load();
    },
    [isLocal, supabase, load]
  );

  // --- Material de apoyo ----------------------------------------------------
  const saveResource = useCallback(
    async (patch: Partial<ClassroomResource> & { id?: string }) => {
      if (isLocal) {
        setResources((prev) => {
          const next = patch.id
            ? prev.map((r) => (r.id === patch.id ? { ...r, ...patch } : r))
            : [...prev, { ...(patch as ClassroomResource), id: newId() }];
          writeLS(LS_RESOURCES, next);
          return next;
        });
        return;
      }
      const { id, ...fields } = patch;
      const { error: err } = id
        ? await supabase!.from("classroom_resources").update(fields).eq("id", id)
        : await supabase!.from("classroom_resources").insert(fields);
      if (err) throw new Error(err.message);
      await load();
    },
    [isLocal, supabase, load]
  );

  const deleteResource = useCallback(
    async (id: string) => {
      if (isLocal) {
        setResources((prev) => {
          const next = prev.filter((r) => r.id !== id);
          writeLS(LS_RESOURCES, next);
          return next;
        });
        return;
      }
      const { error: err } = await supabase!.from("classroom_resources").delete().eq("id", id);
      if (err) throw new Error(err.message);
      await load();
    },
    [isLocal, supabase, load]
  );

  // --- Reordenar lecciones (intercambia sort_order con la vecina) -----------
  const moveLesson = useCallback(
    async (courseId: string, lessonId: string, dir: -1 | 1) => {
      const ordered = lessons
        .filter((l) => l.course_id === courseId)
        .sort((a, b) => a.sort_order - b.sort_order);
      const i = ordered.findIndex((l) => l.id === lessonId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ordered.length) return;

      const a = ordered[i];
      const b = ordered[j];
      // Si empataron en sort_order, un swap no movería nada: renumera primero.
      const aOrder = a.sort_order === b.sort_order ? (i + 1) * 10 : a.sort_order;
      const bOrder = a.sort_order === b.sort_order ? (j + 1) * 10 : b.sort_order;

      if (isLocal) {
        setLessons((prev) => {
          const next = prev.map((l) =>
            l.id === a.id ? { ...l, sort_order: bOrder } : l.id === b.id ? { ...l, sort_order: aOrder } : l
          );
          writeLS(LS_LESSONS, next);
          return next;
        });
        return;
      }
      await Promise.all([
        supabase!.from("classroom_lessons").update({ sort_order: bOrder }).eq("id", a.id),
        supabase!.from("classroom_lessons").update({ sort_order: aOrder }).eq("id", b.id),
      ]);
      await load();
    },
    [lessons, isLocal, supabase, load]
  );

  const lessonsOf = useCallback(
    (courseId: string) =>
      lessons
        .filter((l) => l.course_id === courseId && (l.is_published || isEditor))
        .sort((a, b) => a.sort_order - b.sort_order),
    [lessons, isEditor]
  );

  const resourcesOf = useCallback(
    (courseId: string, lessonId?: string | null) =>
      resources
        .filter((r) => (lessonId ? r.lesson_id === lessonId : r.course_id === courseId && !r.lesson_id))
        .sort((a, b) => a.sort_order - b.sort_order),
    [resources]
  );

  return {
    loading, error, isEditor, isLocal,
    courses, lessons, resources, completed,
    lessonsOf, resourcesOf,
    toggleLesson,
    saveCourse, deleteCourse,
    saveLesson, deleteLesson,
    saveResource, deleteResource,
    moveLesson,
    refresh: load,
  };
}
