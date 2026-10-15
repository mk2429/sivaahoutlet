
import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAdminToken } from "@/lib/admin-auth";
import AdminDashboard from "./AdminDashboard";

async function ProtectedAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("sivaah_admin_access")?.value;

  if (!verifyAdminToken(token)) {
    redirect("/admin-access");
  }

  return <AdminDashboard />;
}

export default function AdminPage() {
  return (
    <Suspense fallback={<main className="app-shell">Loading admin...</main>}>
      <ProtectedAdmin />
    </Suspense>
  );
}
