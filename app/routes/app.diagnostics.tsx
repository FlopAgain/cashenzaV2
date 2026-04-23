import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Badge, BlockStack, Card, InlineGrid, Text } from "@shopify/polaris";

import prisma from "~/db.server";
import { getOrCreateShop } from "~/models/shop.server";
import { authenticate } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop);
  const [missingDiscounts, erroredDiscounts, expiredLocally, failedSyncs, duplicateProducts, activeBundles] = await Promise.all([
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
    prisma.bundle.findMany({
      where: { shopId: shop.id, status: "ACTIVE", shopifyDiscountId: { not: null } },
      select: { id: true, shopifyDiscountId: true, shopifyDiscountStatus: true },
      take: 50,
    }),
  ]);

  const discountIds = activeBundles.map((bundle) => bundle.shopifyDiscountId).filter(Boolean) as string[];
  let liveDiscountMismatches = 0;
  let liveAuditError: string | null = null;

  if (discountIds.length) {
    try {
      const response = await admin.graphql(
        `#graphql
          query CashenzaDiscountAudit($ids: [ID!]!) {
            nodes(ids: $ids) {
              id
              ... on DiscountAutomaticNode {
                automaticDiscount {
                  ... on DiscountAutomaticApp {
                    status
                  }
                }
              }
            }
          }
        `,
        { variables: { ids: discountIds } },
      );
      const payload = (await response.json()) as any;
      if (payload.errors) throw new Error(payload.errors.map((error: { message: string }) => error.message).join(", "));
      const liveStatusById = new Map<string, string | null>(
        (payload.data?.nodes ?? []).map((node: any) => [node?.id, node?.automaticDiscount?.status ?? null]),
      );
      liveDiscountMismatches = activeBundles.filter((bundle) => {
        const liveStatus = liveStatusById.get(bundle.shopifyDiscountId!);
        return !liveStatus || liveStatus !== bundle.shopifyDiscountStatus;
      }).length;
    } catch (error) {
      liveAuditError = error instanceof Error ? error.message : "Erreur inconnue";
    }
  }

  return {
    missingDiscounts,
    erroredDiscounts,
    expiredLocally,
    failedSyncs,
    duplicateProductSlots: duplicateProducts.length,
    liveDiscountMismatches,
    liveAuditError,
  };
};

export default function Diagnostics() {
  const data = useLoaderData<typeof loader>();
  const hasIssue = Boolean(
    data.missingDiscounts ||
    data.erroredDiscounts ||
    data.duplicateProductSlots ||
    data.liveDiscountMismatches ||
    data.liveAuditError,
  );

  return (
    <BlockStack gap="400">
      <InlineGrid columns={{ xs: 1, md: 4 }} gap="400">
        <Card><Text as="p" tone="subdued">Actifs sans reduction</Text><Text as="p" variant="heading2xl">{data.missingDiscounts}</Text></Card>
        <Card><Text as="p" tone="subdued">Reductions en erreur</Text><Text as="p" variant="heading2xl">{data.erroredDiscounts}</Text></Card>
        <Card><Text as="p" tone="subdued">Offres expirees a fermer</Text><Text as="p" variant="heading2xl">{data.expiredLocally}</Text></Card>
        <Card><Text as="p" tone="subdued">Syncs echouees</Text><Text as="p" variant="heading2xl">{data.failedSyncs}</Text></Card>
      </InlineGrid>
      <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
        <Card><Text as="p" tone="subdued">Divergences Shopify live</Text><Text as="p" variant="heading2xl">{data.liveDiscountMismatches}</Text></Card>
        <Card><Text as="p" tone="subdued">Doublons produit/type</Text><Text as="p" variant="heading2xl">{data.duplicateProductSlots}</Text></Card>
      </InlineGrid>
      <Card>
        <BlockStack gap="200">
          <Badge tone={hasIssue ? "critical" : "success"}>{hasIssue ? "Action requise" : "Base coherente"}</Badge>
          <Text as="p" tone="subdued">
            Ces diagnostics combinent les incoherences locales et un audit Admin GraphQL live des reductions Shopify actives.
          </Text>
          {data.liveAuditError ? <Text as="p" tone="critical">Audit Shopify indisponible: {data.liveAuditError}</Text> : null}
        </BlockStack>
      </Card>
    </BlockStack>
  );
}
