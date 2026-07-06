"use client";

import React, { useEffect, useState } from "react";
import { useApp } from "@/utils/context/AppContext";
import { X, MessageSquare, Mail, BellRing } from "lucide-react";

export default function ToastSimulator() {
  const { toast, clearToast } = useApp();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (toast) {
      setVisible(true);
      // Play a subtle notification chime
      try {
        const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-84.wav");
        audio.volume = 0.2;
        audio.play().catch(() => {
          // Ignore audio play blocking from browsers
        });
      } catch (e) {
        // Safe catch
      }

      // Auto-hide after 10 seconds
      const timer = setTimeout(() => {
        handleDismiss();
      }, 10000);

      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleDismiss = () => {
    setVisible(false);
    // Wait for slide-out animation to finish
    setTimeout(() => {
      clearToast();
    }, 300);
  };

  if (!toast) return null;

  const isWhatsApp = toast.type === "whatsapp";

  return (
    <div
      className={`fixed top-5 right-5 z-[9999] max-w-sm w-full bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-700/80 overflow-hidden transform transition-all duration-300 ease-out ${
        visible ? "translate-x-0 opacity-100 scale-100" : "translate-x-12 opacity-0 scale-95"
      }`}
    >
      {/* Toast Glow Border Accent */}
      <div className={`h-1.5 w-full ${isWhatsApp ? "bg-emerald-500" : "bg-blue-500"}`} />

      <div className="p-4 flex gap-3">
        {/* Left Side: Avatar/Icon */}
        <div className="flex-shrink-0">
          <div
            className={`h-11 w-11 rounded-full flex items-center justify-center shadow-inner ${
              isWhatsApp
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                : "bg-blue-500/10 text-blue-400 border border-blue-500/30"
            }`}
          >
            {isWhatsApp ? <MessageSquare className="h-5 w-5" /> : <Mail className="h-5 w-5" />}
          </div>
        </div>

        {/* Center: Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <span className={`inline-block h-2 w-2 rounded-full animate-pulse ${isWhatsApp ? "bg-emerald-400" : "bg-blue-400"}`} />
              {isWhatsApp ? "WhatsApp Notificación" : "Correo Notificación"}
            </span>
            <span className="text-[10px] text-slate-500 font-medium">Ahora mismo</span>
          </div>

          <h4 className="text-sm font-bold text-slate-100 mt-1 truncate">
            {isWhatsApp ? `💬 Chat con: ${toast.recipient}` : `✉️ Para: ${toast.recipient}`}
          </h4>

          <p className="text-xs text-slate-300 mt-1.5 leading-relaxed break-words font-medium">
            {toast.message}
          </p>

          <div className="mt-3 flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
              isWhatsApp ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20" : "bg-blue-500/15 text-blue-400 border border-blue-500/20"
            }`}>
              <BellRing className="h-3 w-3" />
              Notificación Automatizada (Demo)
            </span>
          </div>
        </div>

        {/* Right Side: Close Button */}
        <div className="flex-shrink-0">
          <button
            onClick={handleDismiss}
            className="text-slate-500 hover:text-slate-300 hover:bg-slate-800/80 p-1.5 rounded-lg transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
