import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

describe("OrderDraft (integration)", () => {
  it("create() succeeds without passing updatedAt (SQLite DEFAULT + Prisma @default)", async () => {
    const person = await prisma.person.findFirst({ where: { status: "active" } });
    expect(person).not.toBeNull();

    const draft = await prisma.orderDraft.create({
      data: {
        personId: person!.id,
        type: "PK_CHANGE",
        title: "test",
        bodyText: "body",
      },
    });

    expect(draft.updatedAt).toBeInstanceOf(Date);
    expect(draft.status).toBe("draft");

    await prisma.orderDraft.delete({ where: { id: draft.id } });
  });
});
