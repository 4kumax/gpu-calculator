import { catalogHandlers } from "@/server/catalog-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = catalogHandlers.login;
export const DELETE = catalogHandlers.logout;
