import { payrollIframeSrc } from "../lib/payrollIframeSrc";

/**
 * Payroll module host: Next.js под `/payroll` (Vite proxy → apps/payroll :3002).
 * При `base=/EDUMED/` iframe должен грузить `/EDUMED/payroll`, иначе 404 на корневом `/payroll`.
 */
export function PayrollHostPage() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden -mx-4 w-[calc(100%+2rem)] max-w-none sm:-mx-6 sm:w-[calc(100%+3rem)]">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <iframe
          title="Модуль бухгалтерии"
          className="h-[min(100%,calc(100vh-11rem))] min-h-[32rem] w-full min-w-0 flex-1 border-0"
          src={payrollIframeSrc()}
        />
      </div>
    </div>
  );
}
