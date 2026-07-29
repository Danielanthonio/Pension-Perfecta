"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useApp, getProfileCompletion } from "@/utils/context/AppContext";
import {
  FolderKanban,
  Users,
  Bell,
  LogOut,
  X,
  Check,
  CheckCircle,
  AlertTriangle,
  Info,
  Clock,
  ArrowRightLeft,
  UserPlus,
  Heart,
  Menu,
  SlidersHorizontal,
  RotateCcw,
  Calendar,
  CalendarClock,
  Contact,
  Filter,
  FileBarChart,
  LayoutDashboard,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Building2,
  GraduationCap,
} from "lucide-react";
import React, { useState, useEffect, Suspense } from "react";
import UserSettingsModal from "@/components/UserSettingsModal";

function SidebarLinks({ onLinkClick, collapsed }: { onLinkClick: () => void; collapsed?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useApp();
  const currentParamsString = searchParams.toString();
  const qs = currentParamsString ? `?${currentParamsString}` : "";
  const cleanPath = pathname.replace(/\/$/, "");
  const isAM = user?.role === "account_manager";

  const items = [
    { href: `/admin${qs}`, active: cleanPath === "/admin", Icon: LayoutDashboard, label: "Dashboard" },
    { href: `/admin/reportes${qs}`, active: cleanPath === "/admin/reportes", Icon: FileBarChart, label: "Reportes" },
    { href: `/admin/clientes${qs}`, active: cleanPath === "/admin/clientes", Icon: Contact, label: "Gestión Clientes" },
    { href: `/admin/agenda-futura${qs}`, active: cleanPath === "/admin/agenda-futura", Icon: CalendarClock, label: "Agenda Futura" },
    { href: `/admin/aliados${qs}`, active: cleanPath === "/admin/aliados", Icon: Users, label: "Gestión Aliados" },
    { href: `/admin/asignacion${qs}`, active: cleanPath === "/admin/asignacion", Icon: ArrowRightLeft, label: "Asignación Multialiado" },
    { href: `/admin/empresas-multialiado${qs}`, active: cleanPath === "/admin/empresas-multialiado", Icon: Building2, label: "Empresas Multialiado" },
    ...(!isAM
      ? [{ href: `/admin/account-managers${qs}`, active: cleanPath === "/admin/account-managers", Icon: Users, label: "Gestión AMs" }]
      : []),
    { href: `/admin/usuarios${qs}`, active: cleanPath === "/admin/usuarios", Icon: UserPlus, label: "Gestión Usuarios" },
    { href: `/admin/classroom${qs}`, active: cleanPath === "/admin/classroom", Icon: GraduationCap, label: "Classroom" },
  ];

  return (
    <>
      {items.map(({ href, active, Icon, label }) => (
        <Link
          key={href}
          href={href}
          onClick={onLinkClick}
          title={label}
          className={`group flex items-center py-2 text-xs font-extrabold rounded-xl transition-all tracking-wide uppercase ${
            collapsed ? "px-2 md:justify-center md:px-2" : "px-2"
          } ${
            active
              ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md"
              : "text-slate-400 hover:text-white hover:bg-slate-800/50"
          }`}
        >
          <span className={`flex items-center justify-center h-8 w-8 rounded-lg shrink-0 transition-colors ${collapsed ? "md:mr-0 mr-3" : "mr-3"} ${
            active ? "bg-white/15" : "bg-slate-800/70 group-hover:bg-slate-700/70"
          }`}>
            <Icon className="h-4 w-4 stroke-[2.5]" />
          </span>
          <span className={collapsed ? "md:hidden" : ""}>{label}</span>
        </Link>
      ))}
    </>
  );
}

// Botonera del PERÍODO en el sidebar: se elige con botones de mes (rejilla 3×4) +
// "Todo el año" + "Rango…" (abre Desde/Hasta). Los demás filtros (Etapa/Subetapa/
// Modalidad/Tipo de aliado/Aliado) viven arriba, en la página de Gestión de Clientes.
const FILTER_MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const pad2 = (n: number) => String(n).padStart(2, "0");
const monthRange = (year: number, m: number) => {
  const lastDay = new Date(year, m + 1, 0).getDate();
  return { desde: `${year}-${pad2(m + 1)}-01`, hasta: `${year}-${pad2(m + 1)}-${pad2(lastDay)}` };
};

// Estilos compartidos de los botones de período.
const PILL_BASE = "rounded-xl py-2.5 text-xs font-bold transition-all active:scale-[0.97]";
const PILL_ON = "bg-gradient-to-br from-emerald-400 to-teal-500 text-emerald-950 shadow-md shadow-emerald-500/20 font-extrabold";
const PILL_OFF = "bg-slate-900/60 border border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white";

function SidebarFilters({ collapsed }: { collapsed?: boolean }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const desdeParam = searchParams.get("desde") || "";
  const hastaParam = searchParams.get("hasta") || "";

  // El año que muestran los botones de mes. Arranca del año de `desde` (si lo hay)
  // o del año actual; se puede mover con las flechas ‹ › sin tocar la URL.
  const [displayYear, setDisplayYear] = useState<number>(() =>
    /^\d{4}-/.test(desdeParam) ? parseInt(desdeParam.slice(0, 4), 10) : new Date().getFullYear()
  );
  const [showRange, setShowRange] = useState(false);
  const [localStartDate, setLocalStartDate] = useState("");
  const [localEndDate, setLocalEndDate] = useState("");

  // Sincroniza los inputs del panel "Rango…" y el año mostrado desde la URL.
  useEffect(() => {
    setLocalStartDate(desdeParam);
    setLocalEndDate(hastaParam);
    if (/^\d{4}-/.test(desdeParam)) setDisplayYear(parseInt(desdeParam.slice(0, 4), 10));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const cleanPath = pathname.replace(/\/$/, "");
  const isAdminRoot = cleanPath === "/admin";
  const isClientes = cleanPath === "/admin/clientes";
  if (!isAdminRoot && !isClientes) return null;

  const applyParams = (mutate: (p: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    router.push(`${pathname}?${params.toString()}`);
  };

  const selectMonth = (m: number) => {
    const { desde, hasta } = monthRange(displayYear, m);
    applyParams((p) => {
      p.set("desde", desde);
      p.set("hasta", hasta);
    });
    setShowRange(false);
  };

  const selectFullYear = () => {
    applyParams((p) => {
      p.set("desde", `${displayYear}-01-01`);
      p.set("hasta", `${displayYear}-12-31`);
    });
    setShowRange(false);
  };

  const applyRange = () => {
    applyParams((p) => {
      if (localStartDate) p.set("desde", localStartDate);
      else p.delete("desde");
      if (localEndDate) p.set("hasta", localEndDate);
      else p.delete("hasta");
    });
  };

  const clearPeriodo = () => {
    setShowRange(false);
    applyParams((p) => {
      p.delete("desde");
      p.delete("hasta");
    });
  };

  // ¿Qué botón de período está activo? Se deriva de la URL, no del estado local.
  let activeMonth: number | null = null;
  for (let m = 0; m < 12; m++) {
    const r = monthRange(displayYear, m);
    if (r.desde === desdeParam && r.hasta === hastaParam) {
      activeMonth = m;
      break;
    }
  }
  const hasRange = !!desdeParam || !!hastaParam;
  const isFullYear = desdeParam === `${displayYear}-01-01` && hastaParam === `${displayYear}-12-31`;
  const isCustomRange = hasRange && activeMonth === null && !isFullYear;
  const rangeOpen = showRange || isCustomRange;

  return (
    <div className={`pt-8 border-t border-slate-800/55 mt-6 space-y-5 ${collapsed ? "md:hidden" : ""}`}>
      <div className="flex items-center gap-2 px-4">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 shrink-0">PERÍODO</span>
        <div className="h-px bg-slate-850 flex-1"></div>
      </div>

      {/* PERÍODO — botones de mes + año + rango */}
      <div className="px-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black text-slate-300">{displayYear}</span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setDisplayYear((y) => y - 1)}
              className="p-1 rounded-md text-slate-500 hover:text-white hover:bg-slate-800/60 transition-colors"
              title={`${displayYear - 1}`}
              aria-label="Año anterior"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setDisplayYear((y) => y + 1)}
              className="p-1 rounded-md text-slate-500 hover:text-white hover:bg-slate-800/60 transition-colors"
              title={`${displayYear + 1}`}
              aria-label="Año siguiente"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {FILTER_MONTHS.map((label, m) => (
            <button
              key={label}
              onClick={() => selectMonth(m)}
              className={`${PILL_BASE} ${activeMonth === m ? PILL_ON : PILL_OFF}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button onClick={selectFullYear} className={`${PILL_BASE} ${isFullYear ? PILL_ON : PILL_OFF}`}>
            Todo el año
          </button>
          <button
            onClick={() => setShowRange((v) => !v)}
            className={`${PILL_BASE} flex items-center justify-center gap-1.5 ${rangeOpen ? PILL_ON : PILL_OFF}`}
          >
            <Calendar className="h-3.5 w-3.5" />
            Rango…
          </button>
        </div>

        {rangeOpen && (
          <div className="space-y-2.5 rounded-xl bg-slate-900/40 border border-slate-800/70 p-3">
            <div>
              <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Desde</label>
              <input
                type="date"
                value={localStartDate}
                onChange={(e) => setLocalStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950/60 border border-slate-800 rounded-lg text-xs text-slate-200 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all"
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Hasta</label>
              <input
                type="date"
                value={localEndDate}
                onChange={(e) => setLocalEndDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950/60 border border-slate-800 rounded-lg text-xs text-slate-200 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all"
              />
            </div>
            <button
              onClick={applyRange}
              className="w-full px-3 py-2 rounded-lg text-[11px] font-bold text-emerald-950 bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-300 hover:to-teal-400 transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
            >
              <Filter className="h-3 w-3" />
              Aplicar rango
            </button>
          </div>
        )}
      </div>

      {/* Limpiar período */}
      {hasRange && (
        <div className="px-4">
          <button
            onClick={clearPeriodo}
            className="w-full py-2 text-slate-400 hover:text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Limpiar período
          </button>
        </div>
      )}
    </div>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    user,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    isDemoMode,
    isProvisionalSession,
    isLoading,
    logout,
  } = useApp();

  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("pensionflow_theme") || "light";
      setCurrentTheme(savedTheme as any);
      setIsCollapsed(localStorage.getItem("pensionflow_sidebar_collapsed") === "1");
    }
  }, []);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("pensionflow_sidebar_collapsed", next ? "1" : "0");
      }
      return next;
    });
  };

  const toggleTheme = () => {
    const nextTheme = currentTheme === "light" ? "dark" : "light";
    setCurrentTheme(nextTheme);
    localStorage.setItem("pensionflow_theme", nextTheme);
    if (nextTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  // Protect client side routes
  useEffect(() => {
    if (mounted && !isLoading) {
      if (!user) {
        router.push("/login");
      } else if (user.role === "aliado") {
        router.push("/dashboard");
      }
    }
  }, [user, mounted, isLoading, router]);

  if (!mounted || isLoading || !user || user.role === "aliado") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-slate-400">
            {isLoading ? "Cargando Plataforma..." : user?.role === "aliado" ? "Redireccionando..." : "Cargando Consola Director..."}
          </span>
        </div>
      </div>
    );
  }

  const cleanPath = pathname.replace(/\/$/, "");
  const isAdminRoot = cleanPath === "/admin";
  const isAliados = cleanPath === "/admin/aliados";
  const isUsuarios = cleanPath === "/admin/usuarios";
  const isAMs = cleanPath === "/admin/account-managers";
  const isAsignacion = cleanPath === "/admin/asignacion";

  const unreadNotifsCount = notifications.filter((n) => !n.read).length;

  const handleRoleSwitch = () => {
    router.push("/dashboard");
  };

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const isAM = user.role === "account_manager";
  const themeColor = "bg-gradient-to-r from-emerald-600 to-teal-650";
  const selectionColor = "selection:bg-emerald-500";

  // Dynamic header titles based on path
  const getHeaderTitle = () => {
    const cleanPath = pathname.replace(/\/$/, "");
    if (cleanPath === "/admin") {
      return {
        title: isAM ? "Gestión Pipeline" : "Gestión Director",
        subtitle: "Supervisa y audita las etapas operativas de los expedientes comerciales.",
      };
    }
    if (cleanPath === "/admin/clientes") {
      return {
        title: "Gestión de Clientes",
        subtitle: "Visualiza, audita y gestiona el pipeline de expedientes comerciales y prospectos.",
      };
    }
    if (cleanPath === "/admin/agenda-futura") {
      return {
        title: "Agenda Futura",
        subtitle: "Expedientes pospuestos para una nueva evaluación: cuándo toca reevaluar cada uno.",
      };
    }
    if (cleanPath === "/admin/nuevo") {
      return {
        title: "Subir Proyecto",
        subtitle: "Registra un nuevo prospecto y adjunta su documentación para evaluación.",
      };
    }
    if (cleanPath === "/admin/aliados") {
      return {
        title: "Gestión de Aliados",
        subtitle: "Administra los códigos de invitación y audita el rendimiento de tus socios comerciales.",
      };
    }
    if (cleanPath === "/admin/asignacion") {
      return {
        title: "Asignación Multialiado",
        subtitle: "Asigna tus aliados a una empresa multialiado y a sus líderes de grupo.",
      };
    }
    if (cleanPath === "/admin/account-managers") {
      return {
        title: "Gestión Account Managers",
        subtitle: "Crea y administra los perfiles de los coordinadores de cuentas de la plataforma.",
      };
    }
    if (cleanPath === "/admin/usuarios") {
      return {
        title: "Gestión de Usuarios",
        subtitle: "Administra credenciales, perfiles y estados de acceso en la plataforma.",
      };
    }
    if (cleanPath === "/admin/empresas-multialiado") {
      return {
        title: "Empresas Multialiado",
        subtitle: "Administra las empresas que agrupan a tus líderes en la matriz de asignación.",
      };
    }
    if (cleanPath === "/admin/classroom") {
      return {
        title: "Classroom",
        subtitle: "Inducción, conceptos y material de apoyo para todo el equipo.",
      };
    }
    return {
      title: "Consola de Control",
      subtitle: "Portal Operativo de Pensión Perfecta.",
    };
  };

  const headerInfo = getHeaderTitle();

  return (
    <div className={`min-h-screen bg-[#f8fafc] dark:bg-slate-950 flex flex-row ${selectionColor} transition-colors duration-200`}>
      
      {/* Impersonation Floating Bar at the top of content */}
      {isDemoMode && (
        <div className="fixed top-0 left-0 right-0 h-10 bg-slate-900 border-b border-slate-800 text-slate-200 px-6 py-2 flex items-center justify-between text-xs font-semibold z-40 md:pl-[17rem]">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2.5 w-2.5 rounded-full animate-pulse bg-teal-500" />
            <span>
              💡 MODO EVALUACIÓN • Vista {isAM ? "Account Manager" : "Dirección"}: <span className="text-teal-400">{user.full_name} ({isAM ? "Account Manager" : "Director de Operaciones"})</span>
            </span>
          </div>
          <button
            onClick={handleRoleSwitch}
            className="px-3 py-0.5 text-white rounded-lg transition-colors flex items-center gap-1.5 active:scale-95 transform font-bold shadow-sm text-[10px] bg-teal-600 hover:bg-teal-700"
          >
            Switch to Ally View 💼
          </button>
        </div>
      )}

      {/* Mobile Sidebar Backdrop Overlay */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/60 backdrop-blur-sm md:hidden"
        />
      )}

      {/* Left Sidebar Layout */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 ${
          isCollapsed ? "md:w-[76px]" : "md:w-64"
        } bg-[#070b12] text-slate-300 flex flex-col border-r border-slate-800 transition-all duration-300 md:translate-x-0 md:static ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Sidebar Header / Logo */}
        <div className={`h-20 flex items-center border-b border-slate-800/80 gap-2.5 px-6 ${isCollapsed ? "md:justify-center md:px-0" : ""}`}>
          <Heart className="h-6 w-6 text-emerald-400 fill-emerald-400/20 shrink-0" strokeWidth={2.5} />
          <div className={isCollapsed ? "md:hidden" : ""}>
            <span className="text-lg font-black tracking-tight text-white bg-gradient-to-r bg-clip-text text-transparent from-emerald-400 to-teal-300">
              Pensión Perfecta
            </span>
            <span className="block text-[9px] text-slate-500 font-bold uppercase tracking-wider leading-none mt-0.5">
              Consola Operativa
            </span>
          </div>
        </div>

        {/* Sidebar Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto no-scrollbar">
          <Suspense fallback={<div className="h-48 px-4 py-3 text-[10px] text-slate-500">Cargando enlaces...</div>}>
            <SidebarLinks onLinkClick={() => setIsSidebarOpen(false)} collapsed={isCollapsed} />
          </Suspense>

          {/* Sidebar Filters wrapped in Suspense */}
          <Suspense fallback={<div className="px-4 py-3 text-[10px] text-slate-500">Cargando filtros...</div>}>
            <SidebarFilters collapsed={isCollapsed} />
          </Suspense>
        </nav>
      </aside>

      {/* Main Right Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className={`h-20 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 sm:px-10 flex items-center justify-between flex-shrink-0 z-20 transition-all ${isDemoMode ? "mt-10" : ""}`}>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 -ml-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            <button
              onClick={toggleCollapse}
              className="hidden md:inline-flex p-2.5 -ml-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors active:scale-95"
              title={isCollapsed ? "Mostrar menú" : "Ocultar menú"}
              aria-label={isCollapsed ? "Mostrar menú" : "Ocultar menú"}
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="hidden sm:flex items-center gap-3">
              <span className={`h-9 w-1 rounded-full ${isAM ? "bg-gradient-to-b from-blue-400 to-indigo-600" : "bg-gradient-to-b from-emerald-400 to-teal-600"}`} />
              <div>
                <h2 className="text-base font-bold text-slate-800 dark:text-white leading-tight tracking-tight">
                  {headerInfo.title}
                </h2>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-none mt-1 font-medium">
                  {headerInfo.subtitle}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Notification Bell */}
            <button
              onClick={() => setNotifDrawerOpen(true)}
              className="relative p-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300 rounded-xl transition-colors active:scale-95 transform"
            >
              <Bell className="h-4 w-4" />
              {unreadNotifsCount > 0 && (
                <span className="absolute top-[-2px] right-[-2px] h-4 min-w-[18px] px-1 rounded-full text-white font-extrabold text-[9px] flex items-center justify-center animate-bounce border border-white dark:border-slate-900 shadow-sm bg-emerald-500">
                  {unreadNotifsCount}
                </span>
              )}
            </button>

            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300 rounded-xl transition-colors active:scale-95 transform"
              title={currentTheme === "light" ? "Activar modo oscuro" : "Activar modo claro"}
            >
              {currentTheme === "light" ? (
                <Moon className="h-4 w-4" />
              ) : (
                <Sun className="h-4 w-4 text-amber-500" />
              )}
            </button>

            {/* Nudge: completar perfil (recordatorio persistente, no bloqueante) */}
            {user && !getProfileCompletion(user).verified && (
              <button
                onClick={() => setSettingsOpen(true)}
                className="hidden md:flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full border border-amber-300/50 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors active:scale-95"
                title="Completa tu perfil para verificarlo"
              >
                <svg className="h-5 w-5 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15" fill="none" strokeWidth="4" className="stroke-amber-200 dark:stroke-amber-900/60" />
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    strokeWidth="4"
                    strokeLinecap="round"
                    className="stroke-amber-500"
                    strokeDasharray={2 * Math.PI * 15}
                    strokeDashoffset={2 * Math.PI * 15 * (1 - getProfileCompletion(user).percent / 100)}
                  />
                </svg>
                <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300 whitespace-nowrap">
                  Completa tu perfil · {getProfileCompletion(user).percent}%
                </span>
              </button>
            )}

            {/* User Profile Widget */}
            {user && (
              <div
                onClick={() => setSettingsOpen(true)}
                className="flex items-center gap-3.5 pl-4 border-l border-slate-200 dark:border-slate-800 select-none cursor-pointer hover:opacity-85 transition-opacity"
              >
                <div className="text-right hidden sm:block">
                  <span className="block text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                    {isAM ? "Account Manager" : "Director"}
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5 justify-end">
                    <span className="block text-xs font-black text-slate-850 dark:text-white leading-none">
                      {user.full_name}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                  </div>
                </div>
                <div className="h-10 w-10 rounded-full border flex items-center justify-center text-white text-sm font-black shadow-sm bg-emerald-500 border-emerald-400/20 overflow-hidden">
                  {user.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatar_url} alt={user.full_name} className="h-full w-full object-cover" />
                  ) : (
                    user.full_name.charAt(0)
                  )}
                </div>
              </div>
            )}

            {/* Logout button */}
            <button
              onClick={handleLogout}
              className="p-2.5 bg-slate-100 hover:bg-red-50/10 hover:text-red-400 text-slate-500 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-400 rounded-xl transition-all border border-slate-200/40 dark:border-slate-700/40 active:scale-95"
              title="Cerrar Sesión"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Dynamic App Route Content */}
        <main className="flex-grow overflow-y-auto p-6 sm:p-10 bg-[#f8fafc] dark:bg-slate-950 transition-colors duration-200">
          <div className="max-w-[1700px] mx-auto w-full">
            {isProvisionalSession && (
              <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start gap-3 shadow-sm">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-amber-500 uppercase tracking-wider">
                    Modo Emergencia Local Activo (Sesión Provisional)
                  </h4>
                  <p className="text-[11px] text-slate-650 dark:text-slate-400 leading-normal">
                    Tu correo electrónico no está confirmado en Supabase. El sistema ha activado el almacenamiento local en este navegador para prevenir la pérdida de tus prospectos. **Pide al administrador desactivar "Confirm Email" en Supabase Auth** para habilitar la sincronización en la nube.
                  </p>
                </div>
              </div>
            )}
            {children}
          </div>
        </main>
      </div>

      {/* User Settings Modal */}
      <UserSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Notifications Drawer */}
      {notifDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            onClick={() => setNotifDrawerOpen(false)}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300"
          />

          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col z-10 border-l border-slate-200 dark:border-slate-800 transform transition-transform duration-300">
            <div className="p-6 border-b border-slate-150 dark:border-slate-850 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-emerald-500" />
                <h3 className="text-base font-bold text-slate-800 dark:text-white font-black">Notificaciones</h3>
                {unreadNotifsCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-500">
                    {unreadNotifsCount} nuevas
                  </span>
                )}
              </div>
              <button
                onClick={() => setNotifDrawerOpen(false)}
                className="p-1.5 bg-slate-200/50 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {unreadNotifsCount > 0 && (
              <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-850 flex justify-end">
                <button
                  onClick={markAllNotificationsRead}
                  className="text-xs font-bold flex items-center gap-1.5 text-emerald-500 hover:text-emerald-600"
                >
                  <Check className="h-3.5 w-3.5" />
                  Marcar todas como leídas
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {notifications.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                    <CheckCircle className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 font-black font-black">Sin notificaciones</h4>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-[200px] mx-auto">
                      Te avisaremos por aquí cuando ocurran eventos importantes en tu pipeline operativo.
                    </p>
                  </div>
                </div>
              ) : (
                notifications.map((notif) => {
                  return (
                    <div
                      key={notif.id}
                      onClick={() => markNotificationRead(notif.id)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer flex gap-3 relative ${
                        notif.read
                          ? "bg-slate-50/50 dark:bg-slate-900/30 border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
                          : "bg-emerald-50/20 dark:bg-emerald-950/10 border-emerald-100 dark:border-emerald-900/30 hover:bg-emerald-50/40"
                      }`}
                    >
                      {!notif.read && (
                        <span className="absolute top-4 right-4 h-2.5 w-2.5 rounded-full shadow bg-emerald-500 shadow-emerald-500" />
                      )}

                      <div className="flex-shrink-0">
                        <div
                          className={`h-9 w-9 rounded-xl flex items-center justify-center ${
                            notif.type === "success"
                              ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500 border border-emerald-100 dark:border-emerald-900/50"
                              : notif.type === "alert"
                                ? "bg-red-50 dark:bg-red-950/20 text-red-500 border border-red-100 dark:border-red-900/50"
                                : notif.type === "warning"
                                  ? "bg-amber-50 dark:bg-amber-950/20 text-amber-550 border border-amber-100 dark:border-amber-900/50"
                                  : isAM
                                    ? "bg-blue-50 dark:bg-blue-950/20 text-blue-500 border border-blue-100 dark:border-blue-900/50"
                                    : "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500 border border-emerald-100 dark:border-emerald-900/50"
                          }`}
                        >
                          {notif.type === "success" ? (
                            <CheckCircle className="h-4 w-4" />
                          ) : notif.type === "alert" ? (
                            <AlertTriangle className="h-4 w-4" />
                          ) : (
                            <Info className="h-4 w-4" />
                          )}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-tight">
                          {notif.title}
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-normal">
                          {notif.message}
                        </p>
                        <span className="text-[9px] text-slate-400 dark:text-slate-500 font-semibold mt-2 block flex items-center gap-1.5">
                          <Clock className="h-3 w-3 text-slate-350 dark:text-slate-600" />
                          {new Date(notif.created_at).toLocaleString("es-MX", {
                            hour: "2-digit",
                            minute: "2-digit",
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
