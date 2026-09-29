/*
What this file does: Handles inventory receiving and shrinkage adjustments for an existing item.
What calls it: the dashboard stock adjustment form.
What it calls: auth middleware, the stock adjustment schema, and the inventory service.
Junior mistake: letting the UI send stock changes directly to the repository without a nonnegative stock check.
*/

import { jsonOk } from '@/lib/http/api';
import { withAuth } from '@/lib/middleware/withAuth';
import { adjustStockSchema } from '@/lib/validation/itemSchemas';
import { inventoryService } from '@/services/inventoryService';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ itemId: string }> }
): Promise<Response> {
  return withAuth(
    request,
    { roles: ['owner', 'manager'], action: 'adjust stock levels' },
    async (session) => {
      const body = adjustStockSchema.parse(await request.json());
      const { itemId } = await params;
      const result = await inventoryService.adjustStock(itemId, body, session);
      return jsonOk(result);
    }
  );
}
