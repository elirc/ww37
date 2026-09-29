/*
What this file does: Lists reservations with permission-aware scoping and creates new stock holds.
What calls it: the dashboard reservation panels.
What it calls: auth middleware, reservation validation, and the reservation service.
Junior mistake: returning all reservations to every authenticated user and assuming the UI will hide the extras.
*/

import { jsonOk } from '@/lib/http/api';
import { withAuth } from '@/lib/middleware/withAuth';
import { createHoldSchema } from '@/lib/validation/reservationSchemas';
import { reservationService } from '@/services/reservationService';

export async function GET(request: Request): Promise<Response> {
  return withAuth(request, { action: 'view reservations' }, async (session) => {
    const reservations = await reservationService.listReservations(session);
    return jsonOk({ reservations });
  });
}

export async function POST(request: Request): Promise<Response> {
  return withAuth(
    request,
    { roles: ['owner', 'manager', 'clerk'], action: 'create a stock hold' },
    async (session) => {
      const body = createHoldSchema.parse(await request.json());
      const result = await reservationService.createHold(body, session);
      return jsonOk(result, 201);
    }
  );
}
