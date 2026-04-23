import prisma from "~/db.server";

export async function writeSyncLog(input: {
  shopId: string;
  bundleId?: string | null;
  action: string;
  status: "SUCCESS" | "ERROR" | "SKIPPED";
  message?: string;
  payload?: unknown;
}) {
  await prisma.syncLog.create({
    data: {
      shopId: input.shopId,
      bundleId: input.bundleId,
      action: input.action,
      status: input.status,
      message: input.message,
      payload: input.payload ? JSON.stringify(input.payload) : null,
    },
  });
}
