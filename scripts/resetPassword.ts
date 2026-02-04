import bcrypt from "bcryptjs";
import { getPrisma } from "@/lib/db.server";

async function main() {
  const prisma = getPrisma();
  const email = "buildagora@gmail.com";
  const newPassword = "Password123!";

  const hash = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { email },
    data: { passwordHash: hash },
  });

  console.log("✅ Password reset complete for", email);
}

main()
  .catch((err) => {
    console.error("❌ Password reset failed:", err);
  })
  .finally(() => {
    process.exit(0);
  });