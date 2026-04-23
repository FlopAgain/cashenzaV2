import type { LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { Badge, BlockStack, Button, Card, InlineGrid, InlineStack, Text } from "@shopify/polaris";

import prisma from "~/db.server";
import { getOrCreateShop } from "~/models/shop.server";
import { authenticate } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop);
  const [activeBundles, inactiveBundles, events] = await Promise.all([
    prisma.bundle.count({ where: { shopId: shop.id, status: "ACTIVE" } }),
    prisma.bundle.count({ where: { shopId: shop.id, status: { in: ["DRAFT", "INACTIVE", "EXPIRED"] } } }),
    prisma.analyticsEvent.count({ where: { shopId: shop.id } }),
  ]);
  const activationUrl = `https://${session.shop}/admin/themes/current/editor?context=apps&template=product&activateAppId=${process.env.SHOPIFY_API_KEY}/cashenza-bundle-embed`;
  return { activeBundles, inactiveBundles, events, activationUrl };
};

export default function Dashboard() {
  const data = useLoaderData<typeof loader>();

  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="300">
          <InlineStack align="space-between">
            <Text as="h2" variant="headingLg">Point d'entrée unique</Text>
            <Badge tone="success">Admin first</Badge>
          </InlineStack>
          <Text as="p" tone="subdued">
            Cashenza crée les bundles depuis l'admin, puis synchronise un bundle avec une seule réduction Shopify.
            L'extension storefront ne s'affiche que sur les pages produit éligibles.
          </Text>
          <InlineStack gap="300">
            <Button variant="primary" url="/app/bundles/new">Sélectionner un produit</Button>
            <Button url="/app/bundles">Voir les offres</Button>
            <Button url={data.activationUrl} target="_blank">Activer l'affichage produit</Button>
          </InlineStack>
        </BlockStack>
      </Card>

      <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
        <Card>
          <Text as="p" tone="subdued">Bundles actifs</Text>
          <Text as="p" variant="heading2xl">{data.activeBundles}</Text>
        </Card>
        <Card>
          <Text as="p" tone="subdued">Brouillons / inactifs</Text>
          <Text as="p" variant="heading2xl">{data.inactiveBundles}</Text>
        </Card>
        <Card>
          <Text as="p" tone="subdued">Événements analytics</Text>
          <Text as="p" variant="heading2xl">{data.events}</Text>
        </Card>
      </InlineGrid>

      <Card>
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">Priorités de robustesse</Text>
          <Text as="p">Aucun doublon HTML actif: le script storefront ignore les montages répétés.</Text>
          <Text as="p">Aucun écart réduction/base: les créations actives passent par transaction locale + mutation Shopify.</Text>
          <Text as="p">Aucun placement hors produit: le block Liquid sort immédiatement si aucun produit n'est présent.</Text>
          <Link to="/app/diagnostics">Les diagnostics détaillés arriveront dans l'onglet dédié.</Link>
        </BlockStack>
      </Card>
    </BlockStack>
  );
}
