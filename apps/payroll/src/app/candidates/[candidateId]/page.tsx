import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CandidateDetailView } from "@/components/candidates/CandidateDetailView";
import { BackLink } from "@/components/ui/BackLink";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { computeCandidateSalaryPreview } from "@/lib/payroll/candidate-salary-preview";
import { getCandidateById } from "@/lib/payroll/edumed-candidates";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ candidateId: string }>;
}): Promise<Metadata> {
  const { candidateId } = await params;
  const res = getCandidateById(candidateId);
  if (!res.ok) return { title: "Кандидат" };
  const app = res.candidate.application as { contacts?: { fullName?: string } } | null;
  const name = app?.contacts?.fullName?.trim();
  return { title: name ? `${name} · Анкета` : "Анкета кандидата" };
}

export default async function CandidateDetailPage({
  params,
}: {
  params: Promise<{ candidateId: string }>;
}) {
  const { candidateId } = await params;
  const res = getCandidateById(candidateId);

  if (!res.ok) {
    if (res.error === "NOT_FOUND") notFound();
    return (
      <div className="space-y-6">
        <BackLink href="/candidates">К списку кандидатов</BackLink>
        <InlineNotice variant="danger" title="Нет данных">
          {res.error}
        </InlineNotice>
      </div>
    );
  }

  let salaryPreview = null;
  try {
    if (res.candidate.status === "submitted" && res.candidate.application) {
      salaryPreview = await computeCandidateSalaryPreview({
        application: res.candidate.application,
        analytics: res.candidate.analytics,
      });
    }
  } catch {
    salaryPreview = null;
  }

  return (
    <div className="space-y-6">
      <BackLink href="/candidates">К списку кандидатов</BackLink>
      <CandidateDetailView candidate={res.candidate} salaryPreview={salaryPreview} />
    </div>
  );
}
