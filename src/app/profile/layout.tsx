"use client";

import AuthGuard from "@/lib/authGuard";

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}

