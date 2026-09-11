"use client";
import Link from "next/link";
import { Info } from "@/lib/ui/icons";

export function DBAOnlyNotice() {
  return (
    <div
      role="note"
      className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-900"
    >
      <Info size={20} className="mt-0.5 shrink-0 text-blue-600" aria-hidden />
      <div className="space-y-1">
        <p className="text-sm font-semibold">
          Gerenciamento de Platform Admins é restrito ao DBA
        </p>
        <p className="text-sm leading-relaxed text-blue-800">
          Conforme Spec 01 §3.4 T-04: adição, remoção ou alteração de{" "}
          <code className="rounded bg-blue-100 px-1 font-mono text-xs">
            platform_admins
          </code>{" "}
          é feita exclusivamente via SQL pelo DBA, com nota explicativa em{" "}
          <code className="rounded bg-blue-100 px-1 font-mono text-xs">
            api_audit_log
          </code>
          . Esta página é informativa e read-only — nenhum botão de modificação
          está disponível por design.
        </p>
        <p className="pt-1">
          <Link
            href="/runbook/platform-admin-management.md"
            className="text-xs font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
          >
            Ver runbook →
          </Link>
        </p>
      </div>
    </div>
  );
}
