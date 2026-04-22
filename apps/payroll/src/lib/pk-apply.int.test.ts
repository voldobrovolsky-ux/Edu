import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { applyRecommendedPkInternal } from "@/app/actions/person-actions";

/** Сид: Иванова — current PK1, recommended PK2, pending рекомендация на PK3. */
describe("applyRecommendedPkInternal (integration)", () => {
  let personId: string;
  let pk1Id: string;
  let pk2Id: string;
  let pk3Id: string;

  beforeEach(async () => {
    const pk1 = await prisma.pKLevel.findFirstOrThrow({ where: { code: "PK1" } });
    const pk2 = await prisma.pKLevel.findFirstOrThrow({ where: { code: "PK2" } });
    const pk3 = await prisma.pKLevel.findFirstOrThrow({ where: { code: "PK3" } });
    pk1Id = pk1.id;
    pk2Id = pk2.id;
    pk3Id = pk3.id;

    const p = await prisma.person.findFirst({
      where: { email: "ivanova@school.local" },
    });
    expect(p).not.toBeNull();
    personId = p!.id;

    await prisma.orderDraft.deleteMany({ where: { personId } });
    await prisma.rateChangeRecommendation.deleteMany({ where: { personId } });
    await prisma.rateChangeRecommendation.create({
      data: {
        personId,
        proposedPKLevelId: pk3Id,
        analystLabel: "ai_analyst",
        reasonText: "integration: ожидающая рекомендация PK3",
        status: "pending",
      },
    });
    await prisma.person.update({
      where: { id: personId },
      data: {
        currentPKLevelId: pk1Id,
        fixedPKLevelId: pk1Id,
        recommendedPKLevelId: pk2Id,
      },
    });
  });

  it("updates current/fixed PK, creates OrderDraft, writes audit rows", async () => {
    await applyRecommendedPkInternal(personId, "integration test apply");

    const updated = await prisma.person.findUniqueOrThrow({
      where: { id: personId },
      include: { currentPK: true, fixedPK: true },
    });
    expect(updated.currentPK?.code).toBe("PK3");
    expect(updated.fixedPK?.code).toBe("PK3");
    expect(updated.recommendedPKLevelId).toBe(updated.currentPKLevelId);

    const draft = await prisma.orderDraft.findFirst({
      where: { personId, type: "PK_CHANGE" },
      orderBy: { createdAt: "desc" },
    });
    expect(draft).not.toBeNull();
    expect(draft!.bodyText.length).toBeGreaterThan(20);

    const audits = await prisma.auditLog.findMany({
      where: {
        OR: [
          { entityId: personId, action: "APPLY_PK_CHANGE" },
          { entityId: draft!.id, action: "CREATE_ORDER_DRAFT" },
        ],
      },
    });
    const actions = new Set(audits.map((a) => a.action));
    expect(actions.has("APPLY_PK_CHANGE")).toBe(true);
    expect(actions.has("CREATE_ORDER_DRAFT")).toBe(true);
  });
});
