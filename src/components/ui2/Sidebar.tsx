import React from "react";
import Link from "next/link";

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export default function Sidebar({ className = "", children, ...props }: SidebarProps) {
  return (
    <aside
      className={`w-64 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 h-full flex flex-col ${className}`}
      {...props}
    >
      {children}
    </aside>
  );
}

interface SidebarHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function SidebarHeader({ className = "", children, ...props }: SidebarHeaderProps) {
  return (
    <div className={`px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 ${className}`} {...props}>
      {children}
    </div>
  );
}

interface SidebarContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function SidebarContent({ className = "", children, ...props }: SidebarContentProps) {
  return (
    <div className={`flex-1 overflow-y-auto ${className}`} {...props}>
      {children}
    </div>
  );
}

interface SidebarItemProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children: React.ReactNode;
  active?: boolean;
}

export function SidebarItem({
  href,
  children,
  active = false,
  className = "",
  ...props
}: SidebarItemProps) {
  return (
    <Link
      href={href}
      className={`block px-4 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100 border-r-2 border-zinc-600 dark:border-zinc-400"
          : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
      } ${className}`}
      {...props}
    >
      {children}
    </Link>
  );
}

