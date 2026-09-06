import { catalogHandlers } from "@/server/catalog-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ revision: string }> },
) {
  return catalogHandlers.snapshot(request, (await context.params).revision);
}
