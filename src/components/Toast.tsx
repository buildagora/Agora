"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  subtitle?: string;
  title?: string; // Optional title for richer notifications
  ctaLabel?: string; // Optional CTA button label
  ctaHref?: string; // Optional CTA link (if provided, renders as Link)
  ctaOnClick?: () => void; // Optional CTA callback (if provided, renders as button)
  duration?: number; // milliseconds, default 5000
}

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-3">
      {toasts.map((toast) => {
        const isSuccess = toast.type === "success";
        const isError = toast.type === "error";
        const isInfo = toast.type === "info";

        // Premium styling with better visual hierarchy
        const containerClasses = `min-w-[320px] max-w-md rounded-lg shadow-lg border backdrop-blur-sm ${
          isSuccess
            ? "bg-white dark:bg-zinc-900 border-green-200 dark:border-green-800/50 shadow-green-100/20 dark:shadow-green-900/10"
            : isError
            ? "bg-white dark:bg-zinc-900 border-red-200 dark:border-red-800/50 shadow-red-100/20 dark:shadow-red-900/10"
            : "bg-white dark:bg-zinc-900 border-blue-200 dark:border-blue-800/50 shadow-blue-100/20 dark:shadow-blue-900/10"
        }`;

        const textColorClasses = isSuccess
          ? "text-green-900 dark:text-green-100"
          : isError
          ? "text-red-900 dark:text-red-100"
          : "text-blue-900 dark:text-blue-100";

        const iconColorClasses = isSuccess
          ? "text-green-600 dark:text-green-400"
          : isError
          ? "text-red-600 dark:text-red-400"
          : "text-blue-600 dark:text-blue-400";

        return (
          <div key={toast.id} className={containerClasses}>
            <div className="p-5">
              <div className="flex items-start gap-3">
                {/* Icon */}
                <div className={`flex-shrink-0 mt-0.5 ${iconColorClasses}`}>
                  {isSuccess ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : isError ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {toast.title && (
                    <h3 className={`font-semibold text-sm mb-1 ${textColorClasses}`}>
                      {toast.title}
                    </h3>
                  )}
                  <p className={`${toast.title ? "text-sm" : "font-medium text-sm"} ${textColorClasses} ${toast.title ? "opacity-90" : ""}`}>
                    {toast.message}
                  </p>
                  {toast.subtitle && (
                    <p className={`text-xs mt-1.5 ${textColorClasses} opacity-75`}>
                      {toast.subtitle}
                    </p>
                  )}
                  
                  {/* CTA */}
                  {(toast.ctaLabel && (toast.ctaHref || toast.ctaOnClick)) && (
                    <div className="mt-3">
                      {toast.ctaHref ? (
                        <Link
                          href={toast.ctaHref}
                          className={`inline-block text-xs font-medium ${textColorClasses} hover:opacity-80 transition-opacity underline`}
                          onClick={() => onRemove(toast.id)}
                        >
                          {toast.ctaLabel}
                        </Link>
                      ) : toast.ctaOnClick ? (
                        <button
                          onClick={() => {
                            toast.ctaOnClick?.();
                            onRemove(toast.id);
                          }}
                          className={`text-xs font-medium ${textColorClasses} hover:opacity-80 transition-opacity underline`}
                        >
                          {toast.ctaLabel}
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>

                {/* Close button */}
                <button
                  onClick={() => onRemove(toast.id)}
                  className={`flex-shrink-0 ${textColorClasses} opacity-50 hover:opacity-100 transition-opacity text-lg leading-none`}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Global toast state management
let toastListeners: Array<(toasts: Toast[]) => void> = [];
let toasts: Toast[] = [];

function notifyListeners() {
  toastListeners.forEach((listener) => listener([...toasts]));
}

export function showToast(toast: Omit<Toast, "id">) {
  const id = crypto.randomUUID();
  const newToast: Toast = {
    ...toast,
    id,
    duration: toast.duration || 5000,
  };

  toasts.push(newToast);
  notifyListeners();

  // Auto-remove after duration
  setTimeout(() => {
    removeToast(id);
  }, newToast.duration);
}

export function removeToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  notifyListeners();
}

// Hook for components to use toasts
export function useToast() {
  const [currentToasts, setCurrentToasts] = useState<Toast[]>(toasts);

  useEffect(() => {
    const listener = (newToasts: Toast[]) => {
      setCurrentToasts(newToasts);
    };

    toastListeners.push(listener);
    setCurrentToasts([...toasts]);

    return () => {
      toastListeners = toastListeners.filter((l) => l !== listener);
    };
  }, []);

  return {
    toasts: currentToasts,
    showToast,
    removeToast,
  };
}

