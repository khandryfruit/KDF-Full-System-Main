import type { Request } from "express";
import { db, erpAuditLogsTable } from "@workspace/db";

export async function writeErpAudit(opts: {
  req?: Request;
  module: string;
  action: string;
  resourceType?: string;
  resourceId?: number;
  branchId?: number;
  oldData?: unknown;
  newData?: unknown;
}): Promise<void> {
  const u = (opts.req as Request & { user?: { adminUserId?: number; email?: string } })?.user;
  try {
    await db.insert(erpAuditLogsTable).values({
      module: opts.module,
      action: opts.action,
      resourceType: opts.resourceType,
      resourceId: opts.resourceId,
      branchId: opts.branchId,
      userId: u?.adminUserId,
      userEmail: u?.email,
      oldData: opts.oldData ?? null,
      newData: opts.newData ?? null,
      ipAddress: (opts.req?.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? opts.req?.ip ?? null,
    });
  } catch {
    /* non-fatal */
  }
}
