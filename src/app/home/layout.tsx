"use client";

import AuthGuard from "@/lib/authGuard";

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}

