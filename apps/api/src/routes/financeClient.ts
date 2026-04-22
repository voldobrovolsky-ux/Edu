import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { userStore } from "../store/userStore.js";

export const financeClientRouter = Router();

/** Родительский финансовый кабинет — отдельный контур от внутренней бухгалтерии. */
financeClientRouter.get("/parent/overview", requireAuth, (req: AuthedRequest, res) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });
  const user = userStore.findById(userId);
  if (!user || user.primaryRole !== "parent") return res.status(403).json({ error: "FORBIDDEN" });

  res.json({
    ok: true,
    summary: { totalPaidRub: 0, totalDueRub: 0, currency: "₽" },
    byChild: [{ childLabel: "Ребёнок 1 (демо)", paidRub: 0, dueRub: 0 }],
    byService: [{ serviceName: "Обучение", amountRub: 0 }],
    recentPayments: [] as Array<{ at: string; title: string; amountRub: number }>,
    note:
      "Демонстрационные данные: подключите учёт оплат и договоров, чтобы заполнить раздел реальными суммами.",
  });
});

/** Ученический школьный счёт — отдельный продукт от родительского. */
financeClientRouter.get("/student/overview", requireAuth, (req: AuthedRequest, res) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });
  const user = userStore.findById(userId);
  if (!user || user.primaryRole !== "student") return res.status(403).json({ error: "FORBIDDEN" });

  res.json({
    ok: true,
    schoolAccount: { balanceRub: 0, currency: "₽", accountLabel: "Школьный счёт ученика" },
    recent: [] as Array<{ at: string; title: string; deltaRub: number }>,
    note: "Демонстрационный каркас: здесь будут операции по школьному счёту ученика.",
  });
});
