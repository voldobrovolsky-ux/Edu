import { redirect } from "next/navigation";

/** Внутренняя форма анкеты отключена — данные берутся из EDUMED (candidates.json). */
export default function CandidateIntakeRedirectPage() {
  redirect("/candidates");
}
