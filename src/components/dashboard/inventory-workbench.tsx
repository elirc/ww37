/*
What this file does: Gives the app a realistic operator view for testing holds, releases, stock adjustments, and low-stock visibility.
What calls it: the home page.
What it calls: the API routes using the mock session headers defined by the auth layer.
Junior mistake: hardcoding data in the UI instead of exercising the actual API paths that the docs and tests describe.
*/

'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { type InventoryItem, type InventoryReservation, type LowStockAlert } from '@/domain/inventory';
import { userRoles, type UserRole } from '@/lib/auth/roles';

type SessionState = {
  userId: string;
  displayName: string;
  role: UserRole;
};

type DashboardData = {
  items: InventoryItem[];
  reservations: InventoryReservation[];
  alerts: LowStockAlert[];
};

const defaultSession: SessionState = {
  userId: 'manager-01',
  displayName: 'Store Manager',
  role: 'manager',
};

const emptyData: DashboardData = {
  items: [],
  reservations: [],
  alerts: [],
};

function buildHeaders(session: SessionState): HeadersInit {
  return {
    'content-type': 'application/json',
    'x-user-id': session.userId,
    'x-user-name': session.displayName,
    'x-user-role': session.role,
  };
}

async function fetchJson<T>(path: string, session: SessionState, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...buildHeaders(session),
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json()) as T;

  if (!response.ok) {
    throw new Error((payload as { error?: { message?: string } }).error?.message ?? 'Request failed');
  }

  return payload;
}

export function InventoryWorkbench() {
  const [session, setSession] = useState<SessionState>(defaultSession);
  const [data, setData] = useState<DashboardData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string>('Loading inventory data...');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const [itemForm, setItemForm] = useState({
    sku: '',
    name: '',
    unit: 'piece',
    initialOnHand: '0',
    reorderPoint: '0',
  });

  const [stockForm, setStockForm] = useState({
    itemId: '',
    delta: '0',
    reason: 'Cycle count adjustment',
  });

  const [holdForm, setHoldForm] = useState({
    itemId: '',
    quantity: '1',
    reason: 'Customer request',
  });

  const [releaseForm, setReleaseForm] = useState({
    reservationId: '',
    releaseReason: 'Reservation released',
  });

  const sessionHint = useMemo(() => `${session.displayName} (${session.role})`, [session.displayName, session.role]);

  async function loadData(nextSession: SessionState = session) {
    setLoading(true);
    setErrorMessage('');

    try {
      const [itemsResponse, reservationsResponse, alertsResponse] = await Promise.all([
        fetchJson<{ items: InventoryItem[] }>('/api/items', nextSession),
        fetchJson<{ reservations: InventoryReservation[] }>('/api/reservations', nextSession),
        fetchJson<{ alerts: LowStockAlert[] }>('/api/alerts', nextSession),
      ]);

      setData({
        items: itemsResponse.items,
        reservations: reservationsResponse.reservations,
        alerts: alertsResponse.alerts,
      });
      setStatusMessage(`Loaded data for ${nextSession.displayName}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load dashboard.');
      setData(emptyData);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    // The session object is the only input that should trigger a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.userId, session.displayName, session.role]);

  async function submitJson(path: string, body: unknown, method: 'POST' | 'PATCH' = 'POST') {
    try {
      const response = await fetchJson<{ [key: string]: unknown }>(path, session, {
        method,
        body: JSON.stringify(body),
      });

      await loadData();
      return response;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Request failed.');
      setStatusMessage('Request failed.');
      return null;
    }
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[320px_1fr]">
      <aside className="space-y-6 rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Session</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">Mock auth controls</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            The API reads `x-user-id`, `x-user-name`, and `x-user-role`. This keeps the auth boundary visible
            without installing an identity provider.
          </p>
        </div>

        <label className="grid gap-2 text-sm font-medium text-slate-700">
          User id
          <input
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-brand-500/30 transition focus:ring-4"
            value={session.userId}
            onChange={(event) => setSession({ ...session, userId: event.target.value })}
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Display name
          <input
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-brand-500/30 transition focus:ring-4"
            value={session.displayName}
            onChange={(event) => setSession({ ...session, displayName: event.target.value })}
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Role
          <select
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-brand-500/30 transition focus:ring-4"
            value={session.role}
            onChange={(event) => setSession({ ...session, role: event.target.value as UserRole })}
          >
            {userRoles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-800">Active session</p>
          <p className="mt-1">{sessionHint}</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Try `viewer` to watch the permission checks reject write operations.
          </p>
        </div>

        <p className="text-sm font-medium text-slate-600">{loading ? 'Refreshing...' : statusMessage}</p>
        {errorMessage ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {errorMessage}
          </p>
        ) : null}
      </aside>

      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-3">
          <StatCard label="Items" value={String(data.items.length)} />
          <StatCard label="Active holds" value={String(data.reservations.filter((reservation) => reservation.status === 'active').length)} />
          <StatCard label="Open alerts" value={String(data.alerts.filter((alert) => alert.status === 'open').length)} />
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <form
            className="rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur"
            onSubmit={async (event) => {
              event.preventDefault();
              setStatusMessage('Creating item...');
              const response = await submitJson('/api/items', {
                sku: itemForm.sku,
                name: itemForm.name,
                unit: itemForm.unit,
                initialOnHand: Number(itemForm.initialOnHand),
                reorderPoint: Number(itemForm.reorderPoint),
              });
              if (response) {
                setStatusMessage('Item created.');
                setItemForm({ sku: '', name: '', unit: 'piece', initialOnHand: '0', reorderPoint: '0' });
              }
            }}
          >
            <h3 className="text-lg font-semibold text-ink">Create item</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="SKU" value={itemForm.sku} onChange={(value) => setItemForm({ ...itemForm, sku: value })} />
              <Field label="Name" value={itemForm.name} onChange={(value) => setItemForm({ ...itemForm, name: value })} />
              <Field label="Unit" value={itemForm.unit} onChange={(value) => setItemForm({ ...itemForm, unit: value })} />
              <Field label="Initial stock" value={itemForm.initialOnHand} onChange={(value) => setItemForm({ ...itemForm, initialOnHand: value })} />
              <Field label="Reorder point" value={itemForm.reorderPoint} onChange={(value) => setItemForm({ ...itemForm, reorderPoint: value })} />
            </div>
            <button className="mt-4 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
              Create item
            </button>
          </form>

          <form
            className="rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur"
            onSubmit={async (event) => {
              event.preventDefault();
              setStatusMessage('Recording stock adjustment...');
              const response = await submitJson(`/api/items/${stockForm.itemId}/adjust-stock`, {
                delta: Number(stockForm.delta),
                reason: stockForm.reason,
              });
              if (response) {
                setStatusMessage('Stock adjusted.');
              }
            }}
          >
            <h3 className="text-lg font-semibold text-ink">Adjust stock</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Item id" value={stockForm.itemId} onChange={(value) => setStockForm({ ...stockForm, itemId: value })} />
              <Field label="Delta" value={stockForm.delta} onChange={(value) => setStockForm({ ...stockForm, delta: value })} />
              <Field label="Reason" value={stockForm.reason} onChange={(value) => setStockForm({ ...stockForm, reason: value })} className="sm:col-span-2" />
            </div>
            <button className="mt-4 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700">
              Apply adjustment
            </button>
          </form>

          <form
            className="rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur"
            onSubmit={async (event) => {
              event.preventDefault();
              setStatusMessage('Creating hold...');
              const response = await submitJson('/api/reservations', {
                itemId: holdForm.itemId,
                quantity: Number(holdForm.quantity),
                reason: holdForm.reason,
              });
              if (response) {
                setStatusMessage('Hold created.');
              }
            }}
          >
            <h3 className="text-lg font-semibold text-ink">Create hold</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Item id" value={holdForm.itemId} onChange={(value) => setHoldForm({ ...holdForm, itemId: value })} />
              <Field label="Quantity" value={holdForm.quantity} onChange={(value) => setHoldForm({ ...holdForm, quantity: value })} />
              <Field label="Reason" value={holdForm.reason} onChange={(value) => setHoldForm({ ...holdForm, reason: value })} className="sm:col-span-2" />
            </div>
            <button className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700">
              Reserve stock
            </button>
          </form>

          <form
            className="rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur"
            onSubmit={async (event) => {
              event.preventDefault();
              setStatusMessage('Releasing hold...');
              const response = await submitJson(`/api/reservations/${releaseForm.reservationId}/release`, {
                releaseReason: releaseForm.releaseReason,
              });
              if (response) {
                setStatusMessage('Hold released.');
              }
            }}
          >
            <h3 className="text-lg font-semibold text-ink">Release hold</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Reservation id" value={releaseForm.reservationId} onChange={(value) => setReleaseForm({ ...releaseForm, reservationId: value })} />
              <Field label="Reason" value={releaseForm.releaseReason} onChange={(value) => setReleaseForm({ ...releaseForm, releaseReason: value })} className="sm:col-span-2" />
            </div>
            <button className="mt-4 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700">
              Release reservation
            </button>
          </form>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Panel title="Inventory" description="Available quantity is derived in the domain layer, not stored separately.">
            <DataList
              rows={data.items.map((item) => [
                `${item.name} (${item.sku})`,
                `On hand ${item.onHand} | Reserved ${item.reservedQuantity} | Reorder point ${item.reorderPoint} | Available ${item.onHand - item.reservedQuantity}`,
              ])}
            />
          </Panel>

          <Panel title="Reservations" description="Clerks only see their own holds; managers and owners see the full list.">
            <DataList
              rows={data.reservations.map((reservation) => [
                `${reservation.itemName} x${reservation.quantity}`,
                `${reservation.status} | ${reservation.reason} | Created by ${reservation.createdByUserName}`,
              ])}
            />
          </Panel>

          <Panel title="Low-stock alerts" description="The alert service keeps open alerts aligned with item state.">
            <DataList
              rows={data.alerts.map((alert) => [
                `${alert.itemName} (${alert.itemSku})`,
                `${alert.status} | Available ${alert.availableQuantity} | Threshold ${alert.threshold}`,
              ])}
            />
          </Panel>

          <Panel title="Operational note" description="The backend is deliberately written to be readable in a code review.">
            <p className="text-sm leading-7 text-slate-600">
              The interesting part of this app is not the forms. It is the path from route handler to
              middleware to validation to service to repository, because that is where production bugs usually
              hide.
            </p>
          </Panel>
        </section>
      </div>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white/85 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function Panel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur">
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
      <div className="mt-4">{children}</div>
    </article>
  );
}

function DataList({ rows }: { rows: [string, string][] }) {
  if (!rows.length) {
    return <p className="text-sm text-slate-500">No records yet.</p>;
  }

  return (
    <div className="space-y-3">
      {rows.map(([title, detail]) => (
        <div key={`${title}-${detail}`} className="rounded-2xl bg-slate-50 px-4 py-3">
          <p className="font-medium text-slate-900">{title}</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">{detail}</p>
        </div>
      ))}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={`grid gap-2 text-sm font-medium text-slate-700 ${className ?? ''}`}>
      {label}
      <input
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-brand-500/30 transition focus:ring-4"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
