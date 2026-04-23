import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, Link, useLoaderData, useNavigation, useSearchParams } from "@remix-run/react";
import { Badge, BlockStack, Button, ButtonGroup, Card, IndexTable, InlineStack, Text } from "@shopify/polaris";

import prisma from "~/db.server";
import { deactivateShopifyDiscount, deleteShopifyDiscount } from "~/models/discounts.server";
import { listProductsForBundles } from "~/models/products.server";
import { getOrCreateShop } from "~/models/shop.server";
import { writeSyncLog } from "~/models/sync-log.server";
import { authenticate } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const search = url.searchParams.get("q") || "";
  const after = url.searchParams.get("after");
  const shop = await getOrCreateShop(session.shop);
  await prisma.bundle.updateMany({
    where: { shopId: shop.id, status: "ACTIVE", discountEndsAt: { lt: new Date() } },
    data: { status: "EXPIRED", shopifyDiscountStatus: "EXPIRED" },
  });
  const products = await listProductsForBundles(admin, { search, after, first: 4 });
  const productIds = products.nodes.map((product) => product.id);
  const bundles = await prisma.bundle.findMany({
    where: { shopId: shop.id, productId: { in: productIds }, status: { not: "DELETED" } },
    include: { productSnapshot: true },
  });

  return {
    search,
    products,
    bundles,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop);
  const formData = await request.formData();
  const bundleId = String(formData.get("bundleId") || "");
  const intent = String(formData.get("intent") || "");
  const bundle = await prisma.bundle.findFirst({ where: { id: bundleId, shopId: shop.id } });

  if (!bundle) {
    throw new Response("Bundle introuvable", { status: 404 });
  }

  if (intent === "deactivate" && bundle.shopifyDiscountId) {
    try {
      await deactivateShopifyDiscount(admin, bundle.shopifyDiscountId);
      await prisma.bundle.update({
        where: { id: bundle.id },
        data: { status: "INACTIVE", shopifyDiscountStatus: "DISABLED" },
      });
      await writeSyncLog({
        shopId: shop.id,
        bundleId: bundle.id,
        action: "discount.deactivate",
        status: "SUCCESS",
        payload: { discountId: bundle.shopifyDiscountId },
      });
    } catch (error) {
      await writeSyncLog({
        shopId: shop.id,
        bundleId: bundle.id,
        action: "discount.deactivate",
        status: "ERROR",
        message: error instanceof Error ? error.message : "Erreur inconnue",
      });
      throw error;
    }
  }

  if (intent === "delete") {
    try {
      if (bundle.shopifyDiscountId) {
        await deleteShopifyDiscount(admin, bundle.shopifyDiscountId);
      }
      await writeSyncLog({
        shopId: shop.id,
        bundleId: bundle.id,
        action: "discount.delete",
        status: "SUCCESS",
        payload: { discountId: bundle.shopifyDiscountId },
      });
      await prisma.bundle.delete({ where: { id: bundle.id } });
    } catch (error) {
      await writeSyncLog({
        shopId: shop.id,
        bundleId: bundle.id,
        action: "discount.delete",
        status: "ERROR",
        message: error instanceof Error ? error.message : "Erreur inconnue",
      });
      throw error;
    }
  }

  return redirect("/app/bundles");
};

export default function BundlesIndex() {
  const { products, bundles, search } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const navigation = useNavigation();

  const bundleByProductAndType = new Map(bundles.map((bundle) => [`${bundle.productId}:${bundle.type}`, bundle]));
  const statusTone = (status?: string) => {
    if (status === "ACTIVE") return "success" as const;
    if (status === "EXPIRED") return "warning" as const;
    if (status) return "critical" as const;
    return undefined;
  };

  return (
    <BlockStack gap="400">
      <Card>
        <Form method="get">
          <InlineStack gap="300" blockAlign="end">
            <label>
              Recherche produit
              <input name="q" defaultValue={search} style={{ display: "block", marginTop: 4, minHeight: 32, minWidth: 260 }} />
            </label>
            <Button submit loading={navigation.state === "loading"}>Rechercher</Button>
          </InlineStack>
        </Form>
      </Card>

      <Card padding="0">
        <IndexTable
          resourceName={{ singular: "produit", plural: "produits" }}
          itemCount={products.nodes.length}
          selectable={false}
          headings={[
            { title: "Produit" },
            { title: "Offres" },
            { title: "Stock" },
            { title: "Variants" },
            { title: "Expiration" },
            { title: "Actions" },
          ]}
        >
          {products.nodes.map((product, index) => {
            const volume = bundleByProductAndType.get(`${product.id}:VOLUME`);
            const crossSell = bundleByProductAndType.get(`${product.id}:CROSS_SELL`);
            const configured = [volume, crossSell].filter(Boolean);
            return (
              <IndexTable.Row id={product.id} key={product.id} position={index}>
                <IndexTable.Cell>
                  <BlockStack gap="100">
                    <Text as="span" fontWeight="semibold">{product.title}</Text>
                    <Text as="span" tone="subdued">{product.handle}</Text>
                  </BlockStack>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <InlineStack gap="100">
                    <Badge tone={statusTone(volume?.status)}>{`Volume ${volume ? volume.status.toLowerCase() : "off"}`}</Badge>
                    <Badge tone={statusTone(crossSell?.status)}>{`Cross sell ${crossSell ? crossSell.status.toLowerCase() : "off"}`}</Badge>
                  </InlineStack>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Badge tone={product.totalInventory && product.totalInventory > 0 ? "success" : "critical"}>
                    {product.tracksInventory ? `${product.totalInventory ?? 0} en stock` : "Non suivi"}
                  </Badge>
                </IndexTable.Cell>
                <IndexTable.Cell>{product.variantsCount.count}</IndexTable.Cell>
                <IndexTable.Cell>
                  {configured[0]?.discountEndsAt ? new Date(configured[0].discountEndsAt).toLocaleDateString("fr-FR") : "Aucune"}
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <ButtonGroup>
                    <Button size="slim" url={`/app/bundles/new?productId=${encodeURIComponent(product.id)}`}>Configure bundle</Button>
                    {configured[0] ? <Button size="slim" url={`/app/bundles/${configured[0].id}/style`}>Edit style</Button> : null}
                    {configured[0] ? (
                      <Form method="post">
                        <input type="hidden" name="bundleId" value={configured[0].id} />
                        <button name="intent" value="deactivate" type="submit">Deactivate offer</button>
                        <button name="intent" value="delete" type="submit">Delete offer</button>
                      </Form>
                    ) : null}
                  </ButtonGroup>
                </IndexTable.Cell>
              </IndexTable.Row>
            );
          })}
        </IndexTable>
      </Card>

      <InlineStack align="space-between">
        <Link to={`/app/bundles?${new URLSearchParams({ q: searchParams.get("q") || "" }).toString()}`}>Page actuelle</Link>
        {products.pageInfo.hasNextPage ? (
          <Button url={`/app/bundles?${new URLSearchParams({ q: search, after: products.pageInfo.endCursor || "" }).toString()}`}>
            Page suivante
          </Button>
        ) : null}
      </InlineStack>
    </BlockStack>
  );
}
