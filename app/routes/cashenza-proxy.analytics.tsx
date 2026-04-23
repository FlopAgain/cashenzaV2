import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

import prisma from "~/db.server";

const ALLOWED_EVENTS = new Set(["bundle_impression", "bundle_add_to_cart", "bundle_buy_now"]);

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const shopDomain = String(formData.get("shop") || "");
  const bundleId = String(formData.get("bundleId") || "");
  const productId = String(formData.get("productId") || "");
  const type = String(formData.get("type") || "");
  const value = Number(formData.get("value") || 0);

  if (!shopDomain || !bundleId || !ALLOWED_EVENTS.has(type)) {
    return json({ ok: false }, { status: 400 });
  }

  const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
  if (!shop) return json({ ok: false }, { status: 404 });

  await prisma.analyticsEvent.create({
    data: {
      shopId: shop.id,
      bundleId,
      productId: productId || null,
      type,
      value: Number.isFinite(value) && value > 0 ? value : null,
      metadata: JSON.stringify({ source: "theme_extension" }),
    },
  });

  return json({ ok: true });
};
