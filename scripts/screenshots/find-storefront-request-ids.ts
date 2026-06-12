import "dotenv/config";
import { getPrisma } from "../../src/lib/db.server";

async function main() {
  const p = getPrisma();
  for (const sid of [
    "ferguson_plumbing_hsv",
    "wilson_lumber_hsv",
    "grainger_hsv",
    "home_depot_hsv",
  ]) {
    const r = await p.materialRequestRecipient.findFirst({
      where: { supplierId: sid },
      select: {
        materialRequestId: true,
        materialRequest: { select: { requestText: true, categoryId: true } },
      },
    });
    console.log(sid, "=>", r?.materialRequestId, r?.materialRequest?.requestText?.slice(0, 50));
  }
  await p.$disconnect();
}

main();
