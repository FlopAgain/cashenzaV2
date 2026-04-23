import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { BlockStack, Card, InlineGrid, Text } from "@shopify/polaris";

import prisma from "~/db.server";
import { getOrCreateShop } from "~/models/shop.server";
import { authenticate } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop);
  const [impressions, addsToCart, buyNow, attributedCartValue, confirmedRevenue] = await Promise.all([
    prisma.analyticsEvent.count({ where: { shopId: shop.id, type: "bundle_impression" } }),
    prisma.analyticsEvent.count({ where: { shopId: shop.id, type: "bundle_add_to_cart" } }),
    prisma.analyticsEvent.count({ where: { shopId: shop.id, type: "bundle_buy_now" } }),
    prisma.analyticsEvent.aggregate({
      where: { shopId: shop.id, type: { in: ["bundle_add_to_cart", "bundle_buy_now"] } },
      _sum: { value: true },
    }),
    prisma.analyticsEvent.aggregate({
      where: { shopId: shop.id, type: "bundle_revenue" },
      _sum: { value: true },
    }),
  ]);

  return {
    impressions,
    addsToCart,
    buyNow,
    attributedCartValue: attributedCartValue._sum.value?.toString() ?? "0",
    confirmedRevenue: confirmedRevenue._sum.value?.toString() ?? "0",
    conversionRate: impressions ? Math.round(((addsToCart + buyNow) / impressions) * 1000) / 10 : 0,
  };
};

export default function Analytics() {
  const data = useLoaderData<typeof loader>();
  return (
    <BlockStack gap="400">
      <InlineGrid columns={{ xs: 1, md: 4 }} gap="400">
        <Card><Text as="p" tone="subdued">Impressions bundle</Text><Text as="p" variant="heading2xl">{data.impressions}</Text></Card>
        <Card><Text as="p" tone="subdued">Ajouts panier</Text><Text as="p" variant="heading2xl">{data.addsToCart}</Text></Card>
        <Card><Text as="p" tone="subdued">Buy now</Text><Text as="p" variant="heading2xl">{data.buyNow}</Text></Card>
        <Card><Text as="p" tone="subdued">Conversion</Text><Text as="p" variant="heading2xl">{data.conversionRate}%</Text></Card>
      </InlineGrid>
      <Card>
        <Text as="p" tone="subdued">Valeur panier attribuee</Text>
        <Text as="p" variant="heading2xl">${data.attributedCartValue}</Text>
      </Card>
      <Card>
        <Text as="p" tone="subdued">Revenu confirme</Text>
        <Text as="p" variant="heading2xl">${data.confirmedRevenue}</Text>
      </Card>
      <Card>
        <Text as="p" tone="subdued">
          La valeur panier vient du storefront. Le revenu confirme vient des commandes payees Shopify contenant une propriete Cashenza.
        </Text>
      </Card>
    </BlockStack>
  );
}
