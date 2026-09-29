/*
What this file does: Serves a single item detail and lets managers update metadata like the reorder point.
What calls it: item detail fetches and the dashboard edit flow.
What it calls: auth middleware, the item validation boundary, and the inventory service.
Junior mistake: forgetting to check whether the item exists before applying an update payload.
*/

import { notFoundError } from '@/lib/errors';
import { jsonOk } from '@/lib/http/api';
import { withAuth } from '@/lib/middleware/withAuth';
import { updateItemSchema } from '@/lib/validation/itemSchemas';
import { inventoryService } from '@/services/inventoryService';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ itemId: string }> }
): Promise<Response> {
  return withAuth(request, { action: 'view an item' }, async () => {
    const { itemId } = await params;
    const item = await inventoryService.getItem(itemId);
    if (!item) {
      throw notFoundError('Item not found.');
    }

    return jsonOk({ item });
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ itemId: string }> }
): Promise<Response> {
  return withAuth(
    request,
    { roles: ['owner', 'manager'], action: 'update item metadata' },
    async (session) => {
      const body = updateItemSchema.parse(await request.json());
      const { itemId } = await params;
      const result = await inventoryService.updateItem(itemId, body, session);
      return jsonOk(result);
    }
  );
}
