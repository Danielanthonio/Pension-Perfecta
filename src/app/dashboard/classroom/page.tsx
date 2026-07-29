"use client";

import { Suspense } from "react";
import ClassroomModule from "@/components/classroom/ClassroomModule";

// Mismo módulo que /admin/classroom: el rol define si se puede editar.
export default function ClassroomPage() {
  return (
    <Suspense fallback={null}>
      <ClassroomModule />
    </Suspense>
  );
}
