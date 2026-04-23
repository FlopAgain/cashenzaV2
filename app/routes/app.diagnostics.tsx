import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Badge, BlockStack, Card, InlineGrid, Text } from "@shopify/polaris";

import prisma from "~/db.server";
import { getOrCreateShop } from "~/models/shop.server";
import { authenticate } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop);
  const [missingDiscounts, erroredDiscounts, expiredLocally, failedSyncs, duplicateProducts] = await Promise.all([
    prisma.bundle.count({ where: { shopId: shop.id, status: "ACTIVE", shopifyDiscountId: null } }),
    prisma.bundle.count({ where: { shopId: shop.id, shopifyDiscountStatus: "ERROR" } }),
    prisma.bundle.count({ where: { shopId: shop.id, status: "ACTIVE", discountEndsAt: { lt: new Date() } } }),
    prisma.syncLog.count({ where: { shopId: shop.id, status: "ERROR" } }),
    prisma.bundle.groupBy({
      by: ["productId", "type"],
      where: { shopId: shop.id, status: { not: "DELETED" } },
      _count: { id: true },
      having: { id: { _count: { gt: 1 } } },
    }),
  ]);

  return {
    missingDiscounts,
    erroredDiscounts,
    expiredLocally,
    failedSyncs,
    duplicateProductSlots: duplicateProducts.length,
  };
};

export default function Diagnostics() {
  const data = useLoaderData<typeof loader>();
  return (
    <BlockStack gap="400">
      <InlineGrid columns={{ xs: 1, md: 4 }} gap="400">
        <Card><Text as="p" tone="subdued">Actifs sans réduction</Text><Text as="p" variant="heading2xl">{data.missingDiscounts}</Text></Card>
        <Card><Text as="p" tone="subdued">Réductions en erreur</Text><Text as="p" variant="heading2xl">{data.erroredDiscounts}</Text></Card>
        <Card><Text as="p" tone="subdued">Offres expirées à fermer</Text><Text as="p" variant="heading2xl">{data.expiredLocally}</Text></Card>
        <Card><Text as="p" tone="subdued">Syncs échouées</Text><Text as="p" variant="heading2xl">{data.failedSyncs}</Text></Card>
      </InlineGrid>
      <Card>
        <BlockStack gap="200">
          <Badge tone={data.missingDiscounts || data.erroredDiscounts || data.duplicateProductSlots ? "critical" : "success"}>
            {data.missingDiscounts || data.erroredDiscounts || data.duplicateProductSlots ? "Action requise" : "Base cohérente"}
          </Badge>
          <Text as="p" tone="subdued">
            Ces diagnostics contrôlent les divergences locales les plus dangereuses. La prochaine étape sera un audit live Admin GraphQL pour comparer chaque réduction Shopify à son bundle.
          </Text>
        </BlockStack>
      </Card>
    </BlockStack>
  );
}
