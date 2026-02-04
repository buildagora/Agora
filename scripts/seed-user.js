require("dotenv").config({ path: ".env.local" });

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const pg = require("pg");
const bcrypt = require("bcryptjs");

function getAdapterPrisma() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL missing. Check .env.local");
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  return new PrismaClient({
    adapter: new PrismaPg(pool),
  });
}

(async () => {
  const prisma = getAdapterPrisma();

  const email = "michaelsmith1673@gmail.com".toLowerCase().trim();
  const password = "Test1234!";

  const existing = await prisma.user.findUnique({ where: { email } });

  // Only set passwordHash on create — DO NOT change password if user already exists
  const passwordHash = existing ? undefined : await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, role: "BUYER" },
  });

  console.log("✅ user ready:", {
    id: user.id,
    email: user.email,
    role: user.role,
    password: existing ? "(unchanged - user already existed)" : password,
  });

  await prisma.$disconnect();
})().catch((err) => {
  console.error("❌ seed failed", err);
  process.exit(1);
});


  const existing = await prisma.user.findUnique({ where: { email } });

  // Only set passwordHash on create — DO NOT change password if user already exists
  const passwordHash = existing ? undefined : await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, role: "BUYER" },
  });

  console.log("✅ user ready:", {
    id: user.id,
    email: user.email,
    role: user.role,
    password: existing ? "(unchanged - user already existed)" : password,
  });

  await prisma.$disconnect();
})().catch((err) => {
  console.error("❌ seed failed", err);
  process.exit(1);
});
