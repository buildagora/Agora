"use client";

import type { ReactNode } from "react";

export default function HomeScrollRow({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 ${className}`}>
      <h2 className="mb-3 text-base font-semibold text-[#1E3A5F] sm:mb-4 sm:text-lg">
        {title}
      </h2>
      <div className="min-w-0 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ul className="flex w-max min-w-full snap-x snap-mandatory gap-3 pb-1 sm:gap-3.5">
          {children}
        </ul>
      </div>
    </section>
  );
}
