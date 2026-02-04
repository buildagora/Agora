import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/db",
              message:
                "Do not import Prisma from @/lib/db. Use @/lib/db.server (server-only).",
            },
          ],
          patterns: [
            {
              group: ["@prisma/client"],
              message:
                "Import PrismaClient only inside src/lib/db.server.ts (server-only singleton).",
            },
          ],
        },
      ],
    },
  },
  // Allow @prisma/client import in db.server.ts
  {
    files: ["src/lib/db.server.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
]);

export default eslintConfig;
