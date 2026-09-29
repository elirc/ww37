/*
What this file does: Returns low-stock alerts for operators who are allowed to see them.
What calls it: the dashboard alert panel.
What it calls: auth middleware, alert query validation, and the alert service.
Junior mistake: exposing alert state to anonymous users or leaving the query param unvalidated.
*/

import { jsonOk } from '@/lib/http/api';
import { withAuth } from '@/lib/middleware/withAuth';
import { listAlertsQuerySchema } from '@/lib/validation/alertSchemas';
import { alertService } from '@/services/alertService';

export async function GET(request: Request): Promise<Response> {
  return withAuth(request, { roles: ['owner', 'manager', 'clerk'], action: 'view alerts' }, async () => {
    const url = new URL(request.url);
    const query = listAlertsQuerySchema.parse({
      state: url.searchParams.get('state') ?? undefined,
    });

    const alerts = await alertService.listAlerts(query.state ? { status: query.state } : undefined);
    return jsonOk({ alerts });
  });
}
