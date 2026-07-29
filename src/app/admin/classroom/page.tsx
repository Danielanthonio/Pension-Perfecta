"use client";

import { Suspense } from "react";
import ClassroomModule from "@/components/classroom/ClassroomModule";

// ClassroomModule lee `?curso=` con useSearchParams, así que necesita Suspense.
export default function ClassroomPage() {
  return (
    <Suspense fallback={null}>
      <ClassroomModule />
    </Suspense>
  );
}
