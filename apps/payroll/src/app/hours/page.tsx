import { redirect } from "next/navigation";

/** Раздел «Часы и замены» снят: учёт замен — через ассистента в мессенджере EDUMED. */
export default function HoursRedirectPage() {
  redirect("/");
}
