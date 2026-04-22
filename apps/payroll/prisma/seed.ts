import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma";

const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
const adapter = new PrismaBetterSqlite3({ url });
const prisma = new PrismaClient({ adapter });

/** Идемпотентно выставляет источник для стандартных кодов (в т.ч. если строки уже были в БД до полного сида). */
const SUBSIDY_PAYMENT_SOURCES: { code: string; paymentSource: string }[] = [
  { code: "REG_FIX_1", paymentSource: "regional_subsidy" },
  { code: "BONUS", paymentSource: "school_budget" },
  { code: "PENALTY", paymentSource: "school_budget" },
  { code: "HOURLY_EXTRA", paymentSource: "school_budget" },
];

async function backfillSubsidyPaymentSources() {
  for (const { code, paymentSource } of SUBSIDY_PAYMENT_SOURCES) {
    const res = await prisma.subsidy.updateMany({
      where: { code },
      data: { paymentSource },
    });
    if (res.count > 0) {
      console.log(`[seed] subsidy ${code} paymentSource -> ${paymentSource} (${res.count} row(s))`);
    }
  }
}

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.orderDraft.deleteMany();
  await prisma.rateChangeApproval.deleteMany();
  await prisma.rateChangeRecommendation.deleteMany();
  await prisma.payrollLine.deleteMany();
  await prisma.payrollRun.deleteMany();
  await prisma.fotPeriodPlan.deleteMany();
  await prisma.payrollPeriod.deleteMany();
  await prisma.adjustment.deleteMany();
  await prisma.subsidy.deleteMany();
  await prisma.substitutionEntry.deleteMany();
  await prisma.hourEntry.deleteMany();
  await prisma.candidateAssessment.deleteMany();
  await prisma.candidateProfile.deleteMany();
  await prisma.employmentContract.deleteMany();
  await prisma.employeeProfile.deleteMany();
  await prisma.prOpHistory.deleteMany();
  await prisma.person.deleteMany();
  await prisma.mrotSetting.deleteMany();
  await prisma.systemSetting.deleteMany();
  await prisma.candidateBranchRule.deleteMany();
  await prisma.pKAddonRule.deleteMany();
  await prisma.pKLevel.deleteMany();
  await prisma.pRAddonRule.deleteMany();
  await prisma.pRLevel.deleteMany();
  await prisma.oPAddonRule.deleteMany();
  await prisma.oPLevel.deleteMany();
  await prisma.categoryOfficial.deleteMany();
  await prisma.categoryInternal.deleteMany();
  await prisma.userRole.deleteMany();

  const roles = await prisma.userRole.createMany({
    data: [
      { code: "director", displayName: "Директор" },
      { code: "vice_principal", displayName: "Заместитель директора" },
      { code: "system_admin", displayName: "Администратор системы" },
    ],
  });
  const directorRole = await prisma.userRole.findFirstOrThrow({ where: { code: "director" } });

  const offCat = await prisma.categoryOfficial.createMany({
    data: [
      { code: "none", name: "Без категории", sortOrder: 0 },
      { code: "first_off", name: "Первая квалификационная категория", sortOrder: 1 },
      { code: "highest_off", name: "Высшая квалификационная категория", sortOrder: 2 },
    ],
  });
  const ocNone = await prisma.categoryOfficial.findFirstOrThrow({ where: { code: "none" } });

  const intCat = await prisma.categoryInternal.createMany({
    data: [
      { code: "no_category", name: "Без внутренней категории", sortOrder: 0 },
      { code: "first_category", name: "Первая (Archimedes)", sortOrder: 1 },
      { code: "highest_category", name: "Высшая (Archimedes)", sortOrder: 2 },
    ],
  });
  const icNo = await prisma.categoryInternal.findFirstOrThrow({ where: { code: "no_category" } });
  const icFirst = await prisma.categoryInternal.findFirstOrThrow({ where: { code: "first_category" } });
  const icHigh = await prisma.categoryInternal.findFirstOrThrow({ where: { code: "highest_category" } });

  const pkData = [
    { code: "PK0", name: "PK0 — старт", sortOrder: 0, addon: 0 },
    { code: "PK1", name: "PK1", sortOrder: 1, addon: 15 },
    { code: "PK2", name: "PK2", sortOrder: 2, addon: 33 },
    { code: "PK3", name: "PK3", sortOrder: 3, addon: 50 },
    { code: "PK4", name: "PK4", sortOrder: 4, addon: 70 },
    { code: "PK5", name: "PK5", sortOrder: 5, addon: 90 },
  ];
  const pkLevels: { id: string; code: string }[] = [];
  for (const p of pkData) {
    const row = await prisma.pKLevel.create({
      data: {
        code: p.code,
        name: p.name,
        sortOrder: p.sortOrder,
        addon: { create: { hourlyAddonRub: p.addon } },
      },
    });
    pkLevels.push({ id: row.id, code: row.code });
  }
  const pkByCode = Object.fromEntries(pkLevels.map((x) => [x.code, x.id])) as Record<string, string>;

  const prData = [
    { code: "PR1", name: "PR1 — базовый", sortOrder: 1, addon: 5 },
    { code: "PR2", name: "PR2", sortOrder: 2, addon: 10 },
    { code: "PR3", name: "PR3", sortOrder: 3, addon: 15 },
    { code: "PR4", name: "PR4", sortOrder: 4, addon: 20 },
    { code: "PR5", name: "PR5 — эксперт", sortOrder: 5, addon: 25 },
  ];
  const prLevels: Record<string, string> = {};
  for (const p of prData) {
    const row = await prisma.pRLevel.create({
      data: {
        code: p.code,
        name: p.name,
        sortOrder: p.sortOrder,
        addon: { create: { hourlyAddonRub: p.addon } },
      },
    });
    prLevels[p.code] = row.id;
  }

  const opData = [
    { code: "OP1", name: "OP1 — мало опыта", sortOrder: 1, addon: 3 },
    { code: "OP2", name: "OP2", sortOrder: 2, addon: 8 },
    { code: "OP3", name: "OP3", sortOrder: 3, addon: 12 },
    { code: "OP4", name: "OP4", sortOrder: 4, addon: 16 },
    { code: "OP5", name: "OP5 — сильный опыт", sortOrder: 5, addon: 22 },
  ];
  const opLevels: Record<string, string> = {};
  for (const p of opData) {
    const row = await prisma.oPLevel.create({
      data: {
        code: p.code,
        name: p.name,
        sortOrder: p.sortOrder,
        addon: { create: { hourlyAddonRub: p.addon } },
      },
    });
    opLevels[p.code] = row.id;
  }

  const branchRules = [
    {
      code: "BR_H_PED_SCHOOL",
      name: "Высшее педагогическое + опыт школы",
      priority: 100,
      matchJson: JSON.stringify({
        education: "higher_pedagogical",
        hasPedagogicalQualification: true,
        schoolExpMin: 0.1,
      }),
      eligibility: "teacher_eligible" as const,
      recommendedInternalCategoryCode: "first_category",
      pkCorridorMinCode: "PK2",
      pkCorridorMaxCode: "PK5",
      commentTemplate: "Классическая ветка с педагогическим высшим и школьным опытом.",
    },
    {
      code: "BR_H_PED_TUTOR",
      name: "Высшее педагогическое + только репетиторство",
      priority: 95,
      matchJson: JSON.stringify({
        education: "higher_pedagogical",
        hasPedagogicalQualification: true,
        tutoringOnly: true,
      }),
      eligibility: "teacher_eligible" as const,
      recommendedInternalCategoryCode: "first_category",
      pkCorridorMinCode: "PK1",
      pkCorridorMaxCode: "PK4",
      commentTemplate: "Педагогическое высшее, опыт вне школы (репетиторство).",
    },
    {
      code: "BR_H_PED_NOEXP",
      name: "Высшее педагогическое без опыта",
      priority: 90,
      matchJson: JSON.stringify({
        education: "higher_pedagogical",
        hasPedagogicalQualification: true,
        schoolExpMax: 0,
        tutoringMin: 0,
      }),
      eligibility: "teacher_eligible" as const,
      recommendedInternalCategoryCode: "no_category",
      pkCorridorMinCode: "PK0",
      pkCorridorMaxCode: "PK2",
      commentTemplate: "Нужна адаптация и наставник.",
    },
    {
      code: "BR_H_NP_RET_SCHOOL",
      name: "Высшее непедагогическое + переподготовка + школа",
      priority: 85,
      matchJson: JSON.stringify({
        education: "higher_non_pedagogical",
        hasRetraining: true,
        schoolExpMin: 0.1,
      }),
      eligibility: "teacher_eligible" as const,
      recommendedInternalCategoryCode: "first_category",
      pkCorridorMinCode: "PK1",
      pkCorridorMaxCode: "PK4",
      commentTemplate: "Переподготовка и школьный опыт компенсируют профиль.",
    },
    {
      code: "BR_H_NP_RET_TUTOR",
      name: "Высшее непедагогическое + переподготовка + репетиторство",
      priority: 84,
      matchJson: JSON.stringify({
        education: "higher_non_pedagogical",
        hasRetraining: true,
        tutoringMin: 0.1,
        schoolExpMax: 0,
      }),
      eligibility: "teacher_eligible" as const,
      recommendedInternalCategoryCode: "no_category",
      pkCorridorMinCode: "PK0",
      pkCorridorMaxCode: "PK3",
      commentTemplate: "Нужна проверка на уроке.",
    },
    {
      code: "BR_H_NP_NO_RET",
      name: "Высшее непедагогическое без переподготовки",
      priority: 50,
      matchJson: JSON.stringify({
        education: "higher_non_pedagogical",
        hasRetraining: false,
      }),
      eligibility: "trainee_only" as const,
      recommendedInternalCategoryCode: "no_category",
      pkCorridorMinCode: "PK0",
      pkCorridorMaxCode: "PK1",
      commentTemplate: "Только стажировка/ассистент до переподготовки.",
    },
    {
      code: "BR_VOC_PED_EXP",
      name: "Средне-специальное педагогическое + опыт",
      priority: 80,
      matchJson: JSON.stringify({
        education: "vocational_pedagogical",
        hasPedagogicalQualification: true,
        schoolExpMin: 0.1,
      }),
      eligibility: "teacher_eligible" as const,
      recommendedInternalCategoryCode: "first_category",
      pkCorridorMinCode: "PK1",
      pkCorridorMaxCode: "PK4",
      commentTemplate: "Профильное СПО и практика.",
    },
    {
      code: "BR_VOC_PED_TUTOR",
      name: "Средне-специальное педагогическое + репетиторство",
      priority: 78,
      matchJson: JSON.stringify({
        education: "vocational_pedagogical",
        hasPedagogicalQualification: true,
        tutoringOnly: true,
      }),
      eligibility: "teacher_eligible" as const,
      recommendedInternalCategoryCode: "no_category",
      pkCorridorMinCode: "PK0",
      pkCorridorMaxCode: "PK3",
      commentTemplate: "СПО + частная практика.",
    },
    {
      code: "BR_VOC_NP_RET",
      name: "СПО непедагогическое + переподготовка",
      priority: 70,
      matchJson: JSON.stringify({
        education: "vocational_non_pedagogical",
        hasRetraining: true,
      }),
      eligibility: "trainee_only" as const,
      recommendedInternalCategoryCode: "no_category",
      pkCorridorMinCode: "PK0",
      pkCorridorMaxCode: "PK2",
      commentTemplate: "Стажёр до подтверждения квалификации.",
    },
    {
      code: "BR_FALLBACK",
      name: "Общее правило по умолчанию",
      priority: 0,
      matchJson: JSON.stringify({}),
      eligibility: "trainee_only" as const,
      recommendedInternalCategoryCode: "no_category",
      pkCorridorMinCode: "PK0",
      pkCorridorMaxCode: "PK2",
      commentTemplate: "Ручная классификация.",
    },
  ];

  for (const br of branchRules) {
    await prisma.candidateBranchRule.create({ data: br });
  }

  await prisma.systemSetting.createMany({
    data: [
      { key: "baseHourRateRub", value: "750" },
      { key: "lessonDurationMinutes", value: "45" },
      { key: "schoolName", value: 'ООО "Школа EDUMED"' },
      { key: "prHourlyPayEnabled", value: "true" },
      { key: "opHourlyPayEnabled", value: "true" },
    ],
  });

  await prisma.mrotSetting.create({
    data: {
      federalMrotMonthly: 19242,
      regionalOverrideMonthly: 22440,
      effectiveDate: new Date("2026-01-01"),
      notes: "Региональное значение для примера (ручной ввод).",
    },
  });

  const subsidies = await prisma.subsidy.createMany({
    data: [
      {
        code: "REG_FIX_1",
        name: "Региональная доплата (фикс)",
        isFixComponent: true,
        countsTowardMrot: true,
        isHourly: false,
        isManual: true,
        paymentSource: "regional_subsidy",
      },
      {
        code: "BONUS",
        name: "Премия",
        isFixComponent: false,
        countsTowardMrot: false,
        isHourly: false,
        isManual: true,
        paymentSource: "school_budget",
      },
      {
        code: "PENALTY",
        name: "Штраф / удержание",
        isFixComponent: false,
        countsTowardMrot: false,
        isHourly: false,
        isManual: true,
        paymentSource: "school_budget",
      },
      {
        code: "HOURLY_EXTRA",
        name: "Почасовая надбавка (ручная)",
        isFixComponent: false,
        countsTowardMrot: true,
        isHourly: true,
        isManual: true,
        paymentSource: "school_budget",
      },
    ],
  });

  await backfillSubsidyPaymentSources();

  /** По умолчанию только справочники (роли, PK/PR/OP, ветки, субсидии, МРОТ…). Без демо-людей, часов и прогона. */
  if (process.env.PAYROLL_SEED_DEMO !== "1") {
    await prisma.auditLog.create({
      data: {
        entityType: "Seed",
        entityId: "bootstrap",
        action: "DATABASE_SEED",
        beforeJson: null,
        afterJson: JSON.stringify({ mode: "catalog_only", demoDataset: false }),
        actorRole: "system_admin",
        outcome: "success",
      },
    });
    console.log(
      "[seed] Готово: только справочники (без демо-персон и операций). Для полного демо-набора: PAYROLL_SEED_DEMO=1 npm run db:seed",
    );
    return;
  }

  const subReg = await prisma.subsidy.findFirstOrThrow({ where: { code: "REG_FIX_1" } });
  const subBonus = await prisma.subsidy.findFirstOrThrow({ where: { code: "BONUS" } });

  type PIn = {
    fullName: string;
    email: string;
    status: string;
    employmentType: string;
    workFormat: string;
    officialCategoryId: string;
    internalCategoryId: string;
    currentPKLevelId: string;
    fixedPKLevelId?: string | null;
    recommendedPKLevelId?: string | null;
    prLevelId: string;
    opLevelId: string;
    branchRuleId?: string | null;
    baseHourRateOverride?: number | null;
    notes: string;
    userRoleId?: string | null;
    employee?: { guaranteedMonthlyFixRub: number };
    candidate?: {
      educationLevel: string;
      hasPedagogicalQualification: boolean;
      hasRetraining: boolean;
      subjectRelevance: string;
      schoolExperienceYears: number;
      tutoringExperienceYears: number;
    };
  };

  const peopleInput: PIn[] = [
    {
      fullName: "Иванова Анна Сергеевна",
      email: "ivanova@school.local",
      status: "candidate",
      employmentType: "no_labor_contract",
      workFormat: "trainee",
      officialCategoryId: ocNone.id,
      internalCategoryId: icNo.id,
      currentPKLevelId: pkByCode.PK1,
      recommendedPKLevelId: pkByCode.PK2,
      prLevelId: prLevels.PR2,
      opLevelId: opLevels.OP2,
      notes: "Кандидат, ожидает демо-урок.",
      candidate: {
        educationLevel: "higher_pedagogical",
        hasPedagogicalQualification: true,
        hasRetraining: false,
        subjectRelevance: "relevant",
        schoolExperienceYears: 2,
        tutoringExperienceYears: 0,
      },
    },
    {
      fullName: "Петров Дмитрий Олегович",
      email: "petrov@school.local",
      status: "candidate",
      employmentType: "no_labor_contract",
      workFormat: "trainee",
      officialCategoryId: ocNone.id,
      internalCategoryId: icNo.id,
      currentPKLevelId: pkByCode.PK0,
      prLevelId: prLevels.PR1,
      opLevelId: opLevels.OP1,
      notes: "Без педагогического — только ассистент.",
      candidate: {
        educationLevel: "higher_non_pedagogical",
        hasPedagogicalQualification: false,
        hasRetraining: false,
        subjectRelevance: "partial",
        schoolExperienceYears: 0,
        tutoringExperienceYears: 1,
      },
    },
    {
      fullName: "Сидорова Елена Викторовна",
      email: "sidorova@school.local",
      status: "trainee",
      employmentType: "no_labor_contract",
      workFormat: "trainee",
      officialCategoryId: ocNone.id,
      internalCategoryId: icFirst.id,
      currentPKLevelId: pkByCode.PK2,
      fixedPKLevelId: pkByCode.PK2,
      prLevelId: prLevels.PR3,
      opLevelId: opLevels.OP3,
      notes: "Стажёр после отбора.",
      candidate: {
        educationLevel: "higher_pedagogical",
        hasPedagogicalQualification: true,
        hasRetraining: false,
        subjectRelevance: "relevant",
        schoolExperienceYears: 0,
        tutoringExperienceYears: 3,
      },
    },
    {
      fullName: "Козлов Михаил Андреевич",
      email: "kozlov@school.local",
      status: "active",
      employmentType: "labor_contract",
      workFormat: "staff",
      officialCategoryId: ocNone.id,
      internalCategoryId: icHigh.id,
      currentPKLevelId: pkByCode.PK4,
      fixedPKLevelId: pkByCode.PK4,
      prLevelId: prLevels.PR5,
      opLevelId: opLevels.OP5,
      userRoleId: directorRole.id,
      notes: "Штатный педагог, трудовой договор.",
      employee: { guaranteedMonthlyFixRub: 35000 },
    },
    {
      fullName: "Морозова Татьяна Игоревна",
      email: "morozova@school.local",
      status: "active",
      employmentType: "labor_contract",
      workFormat: "part_time",
      officialCategoryId: ocNone.id,
      internalCategoryId: icFirst.id,
      currentPKLevelId: pkByCode.PK3,
      fixedPKLevelId: pkByCode.PK3,
      prLevelId: prLevels.PR3,
      opLevelId: opLevels.OP4,
      notes: "Почасовик по договору, низкий оклад — проверка МРОТ.",
      employee: { guaranteedMonthlyFixRub: 12000 },
    },
    {
      fullName: "Волков Степан Павлович",
      email: "volkov@school.local",
      status: "active",
      employmentType: "no_labor_contract",
      workFormat: "part_time",
      officialCategoryId: ocNone.id,
      internalCategoryId: icFirst.id,
      currentPKLevelId: pkByCode.PK3,
      prLevelId: prLevels.PR4,
      opLevelId: opLevels.OP3,
      notes: "ГПХ / без ТД: только гибкая часть.",
    },
    {
      fullName: "Новикова Инна Романовна",
      email: "novikova@school.local",
      status: "active",
      employmentType: "labor_contract",
      workFormat: "staff",
      officialCategoryId: ocNone.id,
      internalCategoryId: icFirst.id,
      currentPKLevelId: pkByCode.PK2,
      fixedPKLevelId: pkByCode.PK2,
      prLevelId: prLevels.PR2,
      opLevelId: opLevels.OP2,
      notes: "Замены и основные часы.",
      employee: { guaranteedMonthlyFixRub: 28000 },
    },
    {
      fullName: "Фёдоров Артём Львович",
      email: "fedorov@school.local",
      status: "archived",
      employmentType: "no_labor_contract",
      workFormat: "part_time",
      officialCategoryId: ocNone.id,
      internalCategoryId: icNo.id,
      currentPKLevelId: pkByCode.PK1,
      prLevelId: prLevels.PR2,
      opLevelId: opLevels.OP2,
      notes: "Архив.",
    },
    {
      fullName: "Лебедева Мария Константиновна",
      email: "lebedeva@school.local",
      status: "candidate",
      employmentType: "no_labor_contract",
      workFormat: "trainee",
      officialCategoryId: ocNone.id,
      internalCategoryId: icNo.id,
      currentPKLevelId: pkByCode.PK1,
      prLevelId: prLevels.PR3,
      opLevelId: opLevels.OP2,
      notes: "Высшее непед + переподготовка.",
      candidate: {
        educationLevel: "higher_non_pedagogical",
        hasPedagogicalQualification: false,
        hasRetraining: true,
        subjectRelevance: "relevant",
        schoolExperienceYears: 1,
        tutoringExperienceYears: 0,
      },
    },
    {
      fullName: "Орлов Павел Сергеевич",
      email: "orlov@school.local",
      status: "trainee",
      employmentType: "no_labor_contract",
      workFormat: "trainee",
      officialCategoryId: ocNone.id,
      internalCategoryId: icNo.id,
      currentPKLevelId: pkByCode.PK2,
      prLevelId: prLevels.PR2,
      opLevelId: opLevels.OP3,
      notes: "СПО педагогическое + школа.",
      candidate: {
        educationLevel: "vocational_pedagogical",
        hasPedagogicalQualification: true,
        hasRetraining: false,
        subjectRelevance: "relevant",
        schoolExperienceYears: 2,
        tutoringExperienceYears: 0,
      },
    },
  ];

  const brRule = await prisma.candidateBranchRule.findFirst({ where: { code: "BR_H_PED_SCHOOL" } });

  const createdPeople: { id: string; fullName: string }[] = [];
  for (const p of peopleInput) {
    const person = await prisma.person.create({
      data: {
        fullName: p.fullName,
        email: p.email,
        status: p.status,
        employmentType: p.employmentType,
        workFormat: p.workFormat,
        officialCategoryId: p.officialCategoryId,
        internalCategoryId: p.internalCategoryId,
        currentPKLevelId: p.currentPKLevelId,
        fixedPKLevelId: p.fixedPKLevelId ?? null,
        recommendedPKLevelId: p.recommendedPKLevelId ?? null,
        prLevelId: p.prLevelId,
        opLevelId: p.opLevelId,
        branchRuleId: p.branchRuleId ?? brRule?.id ?? null,
        baseHourRateOverride: p.baseHourRateOverride ?? null,
        notes: p.notes,
        userRoleId: p.userRoleId ?? null,
        canReceiveHourEntries: p.status === "active",
      },
    });
    createdPeople.push({ id: person.id, fullName: person.fullName });
    await prisma.prOpHistory.create({
      data: {
        personId: person.id,
        prLevelId: p.prLevelId,
        opLevelId: p.opLevelId,
        reason: "Начальное значение (seed)",
      },
    });
    if (p.employee) {
      await prisma.employeeProfile.create({
        data: {
          personId: person.id,
          guaranteedMonthlyFixRub: p.employee.guaranteedMonthlyFixRub,
          hireDate: new Date("2024-09-01"),
          positionTitle: "Педагог",
        },
      });
    }
    if (p.candidate) {
      await prisma.candidateProfile.create({
        data: {
          personId: person.id,
          educationLevel: p.candidate.educationLevel,
          hasPedagogicalQualification: p.candidate.hasPedagogicalQualification,
          hasRetraining: p.candidate.hasRetraining,
          subjectRelevance: p.candidate.subjectRelevance,
          schoolExperienceYears: p.candidate.schoolExperienceYears,
          tutoringExperienceYears: p.candidate.tutoringExperienceYears,
        },
      });
    }
  }

  const kozlov = createdPeople.find((x) => x.fullName.includes("Козлов"));
  const morozova = createdPeople.find((x) => x.fullName.includes("Морозова"));
  const volkov = createdPeople.find((x) => x.fullName.includes("Волков"));
  const novikova = createdPeople.find((x) => x.fullName.includes("Новикова"));

  const hetLesson = await prisma.hourEventType.findUnique({ where: { code: "lesson_held" } });
  const hetSub = await prisma.hourEventType.findUnique({ where: { code: "substitution" } });
  if (kozlov && morozova && volkov && novikova && hetLesson && hetSub) {
    await prisma.hourEntry.createMany({
      data: [
        { personId: kozlov.id, year: 2026, month: 3, lessonHours: 72, hourEventTypeId: hetLesson.id, notes: "Март" },
        { personId: morozova.id, year: 2026, month: 3, lessonHours: 48, hourEventTypeId: hetLesson.id, notes: "Март" },
        { personId: volkov.id, year: 2026, month: 3, lessonHours: 36, hourEventTypeId: hetLesson.id, notes: "Март" },
        { personId: novikova.id, year: 2026, month: 3, lessonHours: 60, hourEventTypeId: hetLesson.id, notes: "Март" },
      ],
    });
    await prisma.substitutionEntry.createMany({
      data: [
        {
          substitutingPersonId: novikova.id,
          replacedPersonId: kozlov.id,
          year: 2026,
          month: 3,
          hours: 4,
          hourEventTypeId: hetSub.id,
          notes: "Замена",
        },
        {
          substitutingPersonId: volkov.id,
          year: 2026,
          month: 3,
          hours: 2,
          hourEventTypeId: hetSub.id,
          notes: "Замена без указания заменённого",
        },
      ],
    });
    await prisma.adjustment.createMany({
      data: [
        {
          personId: morozova.id,
          subsidyTypeId: subReg.id,
          year: 2026,
          month: 3,
          title: "Региональная доплата",
          amount: 3000,
          direction: "plus",
          notes: "Фикс в месяц",
        },
        {
          personId: kozlov.id,
          subsidyTypeId: subBonus.id,
          year: 2026,
          month: 3,
          title: "Премия за открытый урок",
          amount: 5000,
          direction: "plus",
        },
      ],
    });
  }

  const period = await prisma.payrollPeriod.create({
    data: {
      year: 2026,
      month: 3,
      label: "Март 2026",
      startDate: new Date("2026-03-01"),
      endDate: new Date("2026-03-31"),
    },
  });

  const run = await prisma.payrollRun.create({
    data: {
      periodId: period.id,
      status: "draft",
      notes: "Пример прогона — нажмите «Рассчитать» в UI для пересчёта.",
    },
  });

  const ivanova = createdPeople.find((x) => x.fullName.includes("Иванова"));
  if (ivanova) {
    await prisma.rateChangeRecommendation.create({
      data: {
        personId: ivanova.id,
        proposedPKLevelId: pkByCode.PK3,
        analystLabel: "ai_analyst",
        reasonText: "По результатам наблюдений на пробных уроках рекомендуется повысить PK до PK3.",
        status: "pending",
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      entityType: "Seed",
      entityId: "bootstrap",
      action: "DATABASE_SEED",
      beforeJson: null,
      afterJson: JSON.stringify({
        mode: "demo",
        people: createdPeople.length,
        period: period.label,
        payrollRunId: run.id,
      }),
      actorRole: "system_admin",
      outcome: "success",
    },
  });

  console.log("[seed] Демо-набор: People:", createdPeople.length, "Period:", period.label, "Run:", run.id);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
