/*
What this file does: Releases an active hold and returns the reserved units back to sellable inventory.
What calls it: the dashboard release form.
What it calls: auth middleware, the release schema, and the reservation service.
Junior mistake: forgetting that release is a state transition, not just another update, and allowing it twice.
*/

import { jsonOk } from '@/lib/http/api';
import { withAuth } from '@/lib/middleware/withAuth';
import { releaseReservationSchema } from '@/lib/validation/reservationSchemas';
import { reservationService } from '@/services/reservationService';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ reservationId: string }> }
): Promise<Response> {
  return withAuth(
    request,
    { roles: ['owner', 'manager', 'clerk'], action: 'release a reservation' },
    async (session) => {
      const body = releaseReservationSchema.parse(await request.json());
      const { reservationId } = await params;
      const result = await reservationService.releaseHold(reservationId, body, session);
      return jsonOk(result);
    }
  );
}
