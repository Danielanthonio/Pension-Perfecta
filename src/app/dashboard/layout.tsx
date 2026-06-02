"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useApp } from "@/utils/context/AppContext";
import {
  LayoutDashboard,
  Folder,
  Plus,
  Bell,
  LogOut,
  X,
  Check,
  CheckCircle,
  AlertTriangle,
  Info,
  Clock,
  Heart,
} from "lucide-react";
import { useState, useEffect } from "react";
import UserSettingsModal from "@/components/UserSettingsModal";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    user,
    activeRole,
    switchRole,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    isDemoMode,
    logout,
  } = useApp();

  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Protect client side routes
  useEffect(() => {
    if (mounted) {
      if (!user) {
        router.push("/login");
      } else if (user.role === "director") {
        router.push("/admin");
      }
    }
  }, [user, mounted, router]);

  if (!mounted || !user || user.role === "director") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-slate-400">
            {user?.role === "director" ? "Redireccionando..." : "Cargando Portal..."}
          </span>
        </div>
      </div>
    );
  }

  const isDashboard = pathname === "/dashboard";
  const isClientes = pathname === "/dashboard/clientes";
  const isNuevo = pathname === "/dashboard/nuevo";

  const unreadNotifsCount = notifications.filter((n) => !n.read).length;

  const handleRoleSwitch = () => {
    switchRole("director");
    router.push("/admin");
  };

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col selection:bg-blue-500 selection:text-white">
      {/* Impersonation Floating Bar */}
      {isDemoMode && (
        <div className="w-full bg-slate-900 border-b border-slate-800 text-slate-200 px-6 py-2 flex items-center justify-between text-xs font-semibold relative z-45">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              💡 MODO EVALUACIÓN • Vista Comercial: <span className="text-emerald-400">{user.full_name} (Aliado)</span>
            </span>
          </div>
          <button
            onClick={handleRoleSwitch}
            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors flex items-center gap-1.5 active:scale-95 transform font-bold shadow-sm"
          >
            Switch to Director View ⚙️
          </button>
        </div>
      )}

      {/* Top Header Bar */}
      <header className="h-20 bg-[#0f172a] text-slate-300 flex items-center justify-between px-6 sm:px-10 flex-shrink-0 z-20 shadow-md border-b border-slate-800">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <Heart className="h-6 w-6 text-emerald-400 fill-emerald-400/20" strokeWidth={2.5} />
          <div>
            <span className="text-lg font-black tracking-tight text-white bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
              Pensión Perfecta
            </span>
            <span className="block text-[9px] text-slate-500 font-bold uppercase tracking-wider leading-none mt-0.5">
              Portal Aliados
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-4.5">
          {/* Notification Bell */}
          <button
            onClick={() => setNotifDrawerOpen(true)}
            className="relative p-2.5 bg-slate-800/80 hover:bg-slate-800 text-slate-300 rounded-xl transition-colors border border-slate-700/60 active:scale-95 transform"
          >
            <Bell className="h-4.5 w-4.5" />
            {unreadNotifsCount > 0 && (
              <span className="absolute top-[-2px] right-[-2px] h-4.5 min-w-[18px] px-1 rounded-full bg-emerald-500 text-white font-extrabold text-[9px] flex items-center justify-center animate-bounce border border-slate-900 shadow-sm">
                {unreadNotifsCount}
              </span>
            )}
          </button>

          {/* User Profile Widget */}
          {user && (
            <div 
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-3.5 pl-4 border-l border-slate-800 select-none cursor-pointer hover:opacity-85 transition-opacity duration-150"
            >
              <div className="text-right hidden sm:block">
                <span className="block text-xs font-black text-white leading-none">
                  {user.full_name}
                </span>
                <span className="inline-block text-[8px] font-extrabold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-1 mt-1.5 leading-none uppercase tracking-widest font-sans">
                  Aliado B2B
                </span>
              </div>
              <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 border border-emerald-400/20 flex items-center justify-center text-white text-sm font-black shadow-sm">
                {user.full_name.charAt(0)}
              </div>
            </div>
          )}

          {/* Logout button */}
          <button
            onClick={handleLogout}
            className="p-2.5 bg-slate-800/80 hover:bg-red-500/10 hover:text-red-400 text-slate-400 rounded-xl transition-all border border-slate-700/60 active:scale-95"
            title="Cerrar Sesión"
          >
            <LogOut className="h-4.5 w-4.5" />
          </button>
        </div>
      </header>

      {/* Horizontal Navigation Menu Bar */}
      <div className="bg-white border-b border-slate-200 flex items-center px-6 sm:px-10 shadow-sm flex-shrink-0 z-10">
        <nav className="flex flex-row overflow-x-auto gap-2 py-2.5 w-full no-scrollbar select-none whitespace-nowrap">
          <Link
            href="/dashboard"
            className={`flex items-center px-4 py-2.5 text-xs font-extrabold rounded-xl transition-all tracking-wide uppercase border ${
              isDashboard
                ? "bg-slate-50 border-slate-200/80 text-slate-800 shadow-sm"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50/50"
            }`}
          >
            <LayoutDashboard className="mr-2 h-4 w-4 stroke-[2]" />
            Resumen de Panel
          </Link>

          <Link
            href="/dashboard/clientes"
            className={`flex items-center px-4 py-2.5 text-xs font-extrabold rounded-xl transition-all tracking-wide uppercase border ${
              isClientes
                ? "bg-slate-50 border-slate-200/80 text-slate-800 shadow-sm"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50/50"
            }`}
          >
            <Folder className="mr-2 h-4 w-4 stroke-[2]" />
            Mis Clientes (Listado)
          </Link>

          <Link
            href="/dashboard/nuevo"
            className={`flex items-center px-4 py-2.5 text-xs font-extrabold rounded-xl transition-all tracking-wide uppercase border ${
              isNuevo
                ? "bg-slate-50 border-slate-200/80 text-slate-800 shadow-sm"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50/50"
            }`}
          >
            <Plus className="mr-2 h-4 w-4 stroke-[2]" />
            Subir Prospecto
          </Link>
        </nav>
      </div>

      {/* Dynamic App Route Content */}
      <main className="flex-grow overflow-y-auto p-6 sm:p-10 bg-[#f8fafc]">
        <div className="max-w-[1700px] mx-auto w-full">
          {children}
        </div>
      </main>

      {/* User Settings Modal */}
      <UserSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Notifications Right Drawer */}
      {notifDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            onClick={() => setNotifDrawerOpen(false)}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300"
          />

          {/* Drawer Panel */}
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col z-10 border-l border-slate-200 transform transition-transform duration-300">
            {/* Drawer Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-emerald-600" />
                <h3 className="text-base font-bold text-slate-800">Notificaciones</h3>
                {unreadNotifsCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 text-xs font-bold">
                    {unreadNotifsCount} nuevas
                  </span>
                )}
              </div>
              <button
                onClick={() => setNotifDrawerOpen(false)}
                className="p-1.5 bg-slate-200/50 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            {/* Notification Actions */}
            {unreadNotifsCount > 0 && (
              <div className="px-6 py-3 border-b border-slate-100 flex justify-end">
                <button
                  onClick={markAllNotificationsRead}
                  className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1.5"
                >
                  <Check className="h-3.5 w-3.5" />
                  Marcar todas como leídas
                </button>
              </div>
            )}

            {/* Notifications List */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {notifications.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                    <CheckCircle className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-700">Sin notificaciones</h4>
                    <p className="text-xs text-slate-400 mt-1 max-w-[200px]">
                      Te avisaremos por aquí cuando ocurran eventos importantes en tu pipeline.
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
                          ? "bg-slate-50/50 border-slate-100 hover:bg-slate-50"
                          : "bg-emerald-50/20 border-emerald-100 hover:bg-emerald-50/40"
                      }`}
                    >
                      {/* Unread Glow Pin */}
                      {!notif.read && (
                        <span className="absolute top-4 right-4 h-2.5 w-2.5 rounded-full bg-emerald-500 shadow shadow-emerald-500" />
                      )}

                      {/* Status Icon */}
                      <div className="flex-shrink-0">
                        <div
                          className={`h-9 w-9 rounded-xl flex items-center justify-center ${
                            notif.type === "success"
                              ? "bg-emerald-50 text-emerald-500 border border-emerald-100"
                              : notif.type === "alert"
                                ? "bg-red-50 text-red-500 border border-red-100"
                                : notif.type === "warning"
                                  ? "bg-amber-50 text-amber-500 border border-amber-100"
                                  : "bg-teal-50 text-teal-500 border border-teal-100"
                          }`}
                        >
                          {notif.type === "success" ? (
                            <CheckCircle className="h-4.5 w-4.5" />
                          ) : notif.type === "alert" ? (
                            <AlertTriangle className="h-4.5 w-4.5" />
                          ) : (
                            <Info className="h-4.5 w-4.5" />
                          )}
                        </div>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-bold text-slate-800 leading-tight">
                          {notif.title}
                        </h4>
                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed leading-normal">
                          {notif.message}
                        </p>
                        <span className="text-[9px] text-slate-400 font-semibold mt-2 block flex items-center gap-1.5">
                          <Clock className="h-3 w-3 text-slate-300" />
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
