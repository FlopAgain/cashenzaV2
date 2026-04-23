import type { ActionFunctionArgs } from "@remix-run/node";

import prisma from "~/db.server";
import { authenticate } from "~/shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  if (topic === "APP_UNINSTALLED") {
    if (session) {
      await prisma.session.deleteMany({ where: { shop } });
    }
    await prisma.shop.updateMany({
      where: { domain: shop },
      data: { uninstalledAt: new Date() },
    });
  }

  return new Response();
};
