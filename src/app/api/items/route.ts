/*
What this file does: Handles listing items and creating new item records.
What calls it: the dashboard UI and any API client that wants inventory data.
What it calls: auth middleware, item validation, and the inventory service.
Junior mistake: skipping the role gate on item creation because "the UI only shows it to managers."
*/

import { jsonOk } from '@/lib/http/api';
import { withAuth } from '@/lib/middleware/withAuth';
import { createItemSchema } from '@/lib/validation/itemSchemas';
import { inventoryService } from '@/services/inventoryService';

export async function GET(request: Request): Promise<Response> {
  return withAuth(request, { action: 'view inventory' }, async () => {
    const items = await inventoryService.listItems();
    return jsonOk({ items });
  });
}

export async function POST(request: Request): Promise<Response> {
  return withAuth(
    request,
    { roles: ['owner', 'manager'], action: 'create inventory items' },
    async (session) => {
      const body = createItemSchema.parse(await request.json());
      const result = await inventoryService.createItem(body, session);
      return jsonOk(result, 201);
    }
  );
}
