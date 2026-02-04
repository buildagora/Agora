import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const clientEntry = require.resolve("@prisma/client");

    let dotPrismaClient: string | null = null;
    try {
      dotPrismaClient = require.resolve(".prisma/client");
    } catch {
      dotPrismaClient = null;
    }

    const envEngineType = process.env.PRISMA_CLIENT_ENGINE_TYPE ?? null;
    const envPrismaEngineType = process.env.PRISMA_ENGINE_TYPE ?? null;

    // Test prisma import
    let prismaImportOk = false;
    let prismaImportErrorMessage: string | null = null;
    try {
      const { prisma } = await import("@/lib/db.server");
      // Just verify it's imported (don't make DB calls)
      void prisma;
      prismaImportOk = true;
    } catch (e: any) {
      prismaImportOk = false;
      prismaImportErrorMessage = e?.message ?? String(e);
    }

    return NextResponse.json(
      {
        ok: true,
        stage: "prisma-engine-diagnostic",
        node: process.version,
        clientEntry,
        dotPrismaClient,
        envEngineType,
        envPrismaEngineType,
        prismaImportOk,
        prismaImportErrorMessage,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        stage: "prisma-engine-diagnostic-error",
        node: process.version,
        message: e?.message ?? String(e),
        stack: e?.stack ?? null,
      },
      { status: 500 }
    );
  }
}
