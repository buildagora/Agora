"use client";

import Link from "next/link";
import Header from "@/components/Header";

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-black">
      <Header />

      <main className="flex flex-1 px-6 py-16 max-w-4xl mx-auto w-full">
        <div className="w-full">
          <h1 className="text-3xl font-semibold text-black dark:text-zinc-50 mb-8">About Agora</h1>

          <div className="mb-8">
            <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed mb-4">
              Agora connects buyers and sellers in the construction materials marketplace through
              an efficient reverse-auction system. Buyers post requests for quotes, and sellers
              compete to provide the best pricing and service.
            </p>
            <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed mb-4">
              Our platform streamlines the procurement process, making it easier to find quality
              materials at competitive prices. Whether you&apos;re a buyer looking to source
              materials or a seller seeking new opportunities, Agora provides the tools you need
              to succeed.
            </p>
            <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">
              Join Agora today and experience a more efficient way to buy and sell construction
              materials.
            </p>
          </div>

          <Link
            href="/"
            className="inline-flex items-center px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-black dark:text-zinc-50 font-medium"
          >
            Back to Home
          </Link>
        </div>
      </main>
    </div>
  );
}

