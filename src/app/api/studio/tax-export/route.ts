import { isStudioRequest } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { listPaidOrders } from "@/lib/orders/admin";
import { taxCsv } from "@/lib/orders/tax-csv";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  if (!(await isStudioRequest())) return new Response("Unauthorized", { status: 401 });
  const month = new URL(req.url).searchParams.get("month") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return new Response("Choose a month, like 2026-11.", { status: 400 });
  }
  const csv = taxCsv(await listPaidOrders(getDb()), month);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tax-${month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
