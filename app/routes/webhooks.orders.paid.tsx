import type { ActionFunctionArgs } from "@remix-run/node";

import prisma from "~/db.server";
import { getOrCreateShop } from "~/models/shop.server";
import { authenticate } from "~/shopify.server";

type ShopifyOrderPayload = {
  id?: number | string;
  admin_graphql_api_id?: string;
  name?: string;
  currency?: string;
  line_items?: Array<{
    id?: number | string;
    product_id?: number | string;
    quantity?: number;
    price?: string;
    pre_tax_price?: string;
    total_discount?: string;
    properties?: Array<{ name?: string; value?: string }>;
  }>;
};

type ShopifyOrderLineItem = NonNullable<ShopifyOrderPayload["line_items"]>[number];

function cashenzaBundleId(lineItem: ShopifyOrderLineItem) {
  return lineItem.properties?.find((property: { name?: string; value?: string }) => property.name === "_cashenza_bundle_id")?.value || null;
}

function lineRevenue(lineItem: ShopifyOrderLineItem) {
  const quantity = Number(lineItem.quantity || 1);
  const preTaxPrice = Number(lineItem.pre_tax_price);
  if (Number.isFinite(preTaxPrice) && preTaxPrice > 0) return preTaxPrice;
  const unitPrice = Number(lineItem.price || 0);
  const discount = Number(lineItem.total_discount || 0);
  return Math.max(0, unitPrice * quantity - (Number.isFinite(discount) ? discount : 0));
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  if (topic !== "ORDERS_PAID") {
    return new Response();
  }

  const order = payload as ShopifyOrderPayload;
  const shopRecord = await getOrCreateShop(shop);
  const orderId = order.admin_graphql_api_id || String(order.id || "");
  if (!orderId) return new Response();

  const revenueByBundle = new Map<string, { value: number; productIds: Set<string> }>();
  for (const lineItem of order.line_items || []) {
    const bundleId = cashenzaBundleId(lineItem);
    if (!bundleId) continue;
    const current = revenueByBundle.get(bundleId) ?? { value: 0, productIds: new Set<string>() };
    current.value += lineRevenue(lineItem);
    if (lineItem.product_id) current.productIds.add(String(lineItem.product_id));
    revenueByBundle.set(bundleId, current);
  }

  for (const [bundleId, attribution] of revenueByBundle.entries()) {
    const result = await prisma.orderAttribution.upsert({
      where: {
        shopId_orderId_bundleId: {
          shopId: shopRecord.id,
          orderId,
          bundleId,
        },
      },
      update: {
        value: attribution.value,
        orderName: order.name ?? null,
        currency: order.currency ?? null,
        productIds: JSON.stringify([...attribution.productIds]),
      },
      create: {
        shopId: shopRecord.id,
        orderId,
        orderName: order.name ?? null,
        bundleId,
        value: attribution.value,
        currency: order.currency ?? null,
        productIds: JSON.stringify([...attribution.productIds]),
      },
    });

    await prisma.analyticsEvent.upsert({
      where: { id: `order_${result.id}` },
      update: { value: attribution.value },
      create: {
        id: `order_${result.id}`,
        shopId: shopRecord.id,
        bundleId,
        productId: [...attribution.productIds][0] ?? null,
        type: "bundle_revenue",
        value: attribution.value,
        metadata: JSON.stringify({
          source: "orders_paid_webhook",
          orderId,
          orderName: order.name,
          currency: order.currency,
          productIds: [...attribution.productIds],
        }),
      },
    });
  }

  return new Response();
};
