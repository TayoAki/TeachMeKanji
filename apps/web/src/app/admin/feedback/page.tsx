import { notFound } from "next/navigation";
import { isAdminEmail } from "@appbuilder/core";
import { AdminFeedback } from "@/components/admin-feedback";
import { AppShell } from "@/components/shell/app-shell";
import { getViewer } from "@/lib/server";

export const metadata = { title: "Feedback", robots: { index: false } };

/** Triage for the operator (ADMIN_EMAILS): every bug report and feature request. */
export default async function AdminFeedbackPage() {
  const viewer = await getViewer();
  if (!viewer || !isAdminEmail(viewer.email)) notFound();
  return (
    <AppShell user={{ name: viewer.name, email: viewer.email, image: viewer.image }}>
      <AdminFeedback />
    </AppShell>
  );
}
