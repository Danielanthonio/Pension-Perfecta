"use client";

import React from "react";
import { accentOf, type ClassroomCourse } from "./classroomTypes";

/**
 * Portada 16:9 de un curso, al estilo Skool.
 *
 * Si el curso ya tiene `cover_url` se pinta la imagen. Si no, se genera una
 * portada provisional con degradado + halos, deliberadamente compuesta igual que
 * las portadas CGI definitivas (título en bloque a la izquierda, sujeto luminoso
 * a la derecha) para que al sustituir la imagen no se mueva nada del layout.
 *
 * Se usa <img> crudo y no next/image porque next.config.js ya trae
 * `images: { unoptimized: true }` y no hay `remotePatterns` configurado.
 */
export default function CourseCover({
  course,
  className = "",
  compact = false,
}: {
  course: Pick<ClassroomCourse, "title" | "cover_url" | "accent" | "emoji" | "badge">;
  className?: string;
  compact?: boolean;
}) {
  const a = accentOf(course.accent);
  const words = course.title.trim().split(/\s+/);

  return (
    <div className={`relative aspect-video w-full overflow-hidden bg-slate-900 ${className}`}>
      {course.cover_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={course.cover_url}
          alt={course.title}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          loading="lazy"
        />
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${a.cover}`}>
          {/* Halos difusos: dan la sensación de render 3D con luz de estudio. */}
          <span className={`absolute -right-6 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full ${a.glow} opacity-40 blur-2xl`} />
          <span className="absolute -bottom-10 left-1/4 h-28 w-28 rounded-full bg-white opacity-10 blur-2xl" />

          {/* Rejilla tenue de fondo. */}
          <span
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />

          <div className="relative flex h-full items-center justify-between gap-2 px-4 sm:px-5">
            <h4
              className={`max-w-[62%] font-black uppercase leading-[0.92] tracking-tight text-white drop-shadow-lg ${
                compact ? "text-sm sm:text-base" : "text-lg sm:text-2xl"
              }`}
            >
              {words.map((w, i) => (
                <span key={i} className="block">
                  {w}
                </span>
              ))}
            </h4>

            {/* Marcador del sujeto: es donde irá la figura 3D de Raúl. */}
            <div className="relative shrink-0">
              <span className={`absolute inset-0 rounded-full ${a.glow} opacity-50 blur-xl`} />
              <span
                className={`relative flex items-center justify-center rounded-full bg-white/10 ring-1 ring-inset ring-white/25 backdrop-blur-sm ${
                  compact ? "h-12 w-12 text-xl" : "h-16 w-16 text-3xl sm:h-20 sm:w-20 sm:text-4xl"
                }`}
              >
                {course.emoji || "🎓"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Degradado inferior: mantiene legible cualquier imagen que se suba. */}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/45 to-transparent" />

      {/* Cinta diagonal de la esquina. */}
      {course.badge && (
        <span className="pointer-events-none absolute right-0 top-0 h-20 w-20 overflow-hidden">
          <span
            className={`absolute right-[-32px] top-[14px] w-[112px] rotate-45 py-1 text-center text-[9px] font-black uppercase tracking-widest text-white shadow-md ${a.bar}`}
          >
            {course.badge}
          </span>
        </span>
      )}
    </div>
  );
}
