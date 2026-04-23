import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { BlockStack, Card, InlineGrid, Text } from "@shopify/polaris";

import prisma from "~/db.server";
import { getOrCreateShop } from "~/models/shop.server";
import { authenticate } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop);
  const [impressions, addsToCart, revenueEvents] = await Promise.all([
    prisma.analyticsEvent.count({ where: { shopId: shop.id, type: "bundle_impression" } }),
    prisma.analyticsEvent.count({ where: { shopId: shop.id, type: "bundle_add_to_cart" } }),
    prisma.analyticsEvent.aggregate({ where: { shopId: shop.id, type: "bundle_revenue" }, _sum: { value: true } }),
  ]);
  return {
    impressions,
    addsToCart,
    revenue: revenueEvents._sum.value?.toString() ?? "0",
    conversionRate: impressions ? Math.round((addsToCart / impressions) * 1000) / 10 : 0,
  };
};

export default function Analytics() {
  const data = useLoaderData<typeof loader>();
  return (
    <BlockStack gap="400">
      <InlineGrid columns={{ xs: 1, md: 4 }} gap="400">
        <Card><Text as="p" tone="subdued">Impressions bundle</Text><Text as="p" variant="heading2xl">{data.impressions}</Text></Card>
        <Card><Text as="p" tone="subdued">Ajouts panier</Text><Text as="p" variant="heading2xl">{data.addsToCart}</Text></Card>
        <Card><Text as="p" tone="subdued">Conversion</Text><Text as="p" variant="heading2xl">{data.conversionRate}%</Text></Card>
        <Card><Text as="p" tone="subdued">Revenu attribué</Text><Text as="p" variant="heading2xl">${data.revenue}</Text></Card>
      </InlineGrid>
      <Card>
        <Text as="p" tone="subdued">
          La prochaine étape analytics sera de relier précisément impressions, clics, add-to-cart et commandes via webhooks orders.
        </Text>
      </Card>
    </BlockStack>
  );
}
