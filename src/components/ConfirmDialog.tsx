"use client";

import React, { useEffect, useRef } from "react";
import Card, { CardContent } from "./ui2/Card";
import Button from "./ui2/Button";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: "danger" | "default";
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  variant = "default",
}: ConfirmDialogProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Focus trap and keyboard handling
  useEffect(() => {
    if (!isOpen) return;

    // Focus the confirm button (or cancel if danger variant)
    const focusButton = variant === "danger" ? confirmButtonRef.current : cancelButtonRef.current;
    if (focusButton) {
      focusButton.focus();
    }

    // Handle Escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };

    // Handle Enter key on confirm button
    const handleEnter = (e: KeyboardEvent) => {
      if (e.key === "Enter" && document.activeElement === confirmButtonRef.current) {
        onConfirm();
      }
    };

    document.addEventListener("keydown", handleEscape);
    document.addEventListener("keydown", handleEnter);

    // Prevent body scroll when modal is open
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("keydown", handleEnter);
      document.body.style.overflow = "";
    };
  }, [isOpen, onCancel, onConfirm, variant]);

  // Trap focus within modal
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab") {
      const focusableElements = [
        cancelButtonRef.current,
        confirmButtonRef.current,
      ].filter(Boolean) as HTMLButtonElement[];

      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        // Close on backdrop click
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
      onKeyDown={handleKeyDown}
    >
      <Card className="w-full max-w-md mx-4">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-black mb-2">
            {title}
          </h3>
          <p className="text-sm text-zinc-600 mb-6">
            {message}
          </p>
          <div className="flex gap-3 justify-end">
            <Button
              ref={cancelButtonRef}
              variant="outline"
              onClick={onCancel}
            >
              {cancelLabel}
            </Button>
            <Button
              ref={confirmButtonRef}
              variant={variant === "danger" ? "primary" : "primary"}
              onClick={onConfirm}
              className={variant === "danger" ? "bg-red-600 hover:bg-red-700" : ""}
            >
              {confirmLabel}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

