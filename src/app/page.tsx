/*
What this file does: Renders the landing page shell around the interactive inventory workbench.
What calls it: Next.js routing.
What it calls: the dashboard client component.
Junior mistake: putting API orchestration in the page component instead of keeping the business rules in services.
*/

import { InventoryWorkbench } from '@/components/dashboard/inventory-workbench';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-10 px-6 py-10 text-slate-900 lg:px-10">
      <section className="rounded-3xl border border-white/70 bg-white/80 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand-700">
          Inventory reservation app
        </p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight text-ink md:text-5xl">
          Hold stock, release reservations, and surface low-stock alerts before the shelf goes empty.
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
          This learning build uses header-based mock auth so the backend boundaries stay visible. Try the
          workbench below with a manager or clerk session and watch the request paths light up in the code.
        </p>
      </section>

      <InventoryWorkbench />
    </main>
  );
}
