import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { Badge, BlockStack, Button, Card, InlineGrid, InlineStack, Text } from "@shopify/polaris";

import prisma from "~/db.server";
import { createShopifyBundleDiscount, normalizeDiscountValueType } from "~/models/discounts.server";
import { BADGE_PRESETS, DESIGN_PRESETS, DOM_EFFECTS } from "~/models/presets";
import { getProductForBundle, listProductsForBundles } from "~/models/products.server";
import { getOrCreateShop } from "~/models/shop.server";
import { writeSyncLog } from "~/models/sync-log.server";
import { authenticate } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  const products = productId ? null : await listProductsForBundles(admin, { first: 4 });
  const product = productId ? await getProductForBundle(admin, productId) : null;
  const crossSellProducts = productId ? await listProductsForBundles(admin, { first: 8 }) : null;
  return {
    product,
    products,
    crossSellProducts,
    designPresets: DESIGN_PRESETS,
    badgePresets: BADGE_PRESETS,
    domEffects: DOM_EFFECTS,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop);
  const formData = await request.formData();
  const productId = String(formData.get("productId") || "");
  const type = String(formData.get("type") || "VOLUME") === "CROSS_SELL" ? "CROSS_SELL" : "VOLUME";
  const product = await getProductForBundle(admin, productId);
  const selectedCrossSellIds = formData.getAll("crossSellProductIds").map(String).filter((id) => id && id !== productId).slice(0, 4);

  if (!product) {
    throw new Response("Produit introuvable", { status: 404 });
  }

  if (type === "CROSS_SELL" && selectedCrossSellIds.length === 0) {
    throw new Response("Choisis au moins un produit additionnel pour un cross sell bundle.", { status: 400 });
  }

  const existingBundle = await prisma.bundle.findFirst({
    where: {
      shopId: shop.id,
      productId: product.id,
      type,
      status: { not: "DELETED" },
    },
  });

  if (existingBundle) {
    throw new Response("Ce produit a déjà un bundle actif ou inactif pour ce mode. Modifie ou supprime l'offre existante avant d'en créer une nouvelle.", { status: 409 });
  }

  const now = new Date();
  const startsAt = new Date(String(formData.get("startsAt") || now.toISOString()));
  const endsAtRaw = String(formData.get("endsAt") || "");
  const endsAt = endsAtRaw ? new Date(endsAtRaw) : null;
  const discountValueType = normalizeDiscountValueType(formData.get("discountValueType"));
  const discountValue = Number(formData.get("discountValue") || 10);
  const stylePreset = String(formData.get("stylePreset") || "atelier");
  const badgePreset = String(formData.get("badgePreset") || "none");
  const domEffect = String(formData.get("domEffect") || "FADE_UP") as "NONE" | "FADE_UP" | "SCALE_IN" | "SLIDE_LEFT";
  const firstVariant = product.variants.nodes[0];
  const crossSellProducts = type === "CROSS_SELL"
    ? (await Promise.all(selectedCrossSellIds.map((id) => getProductForBundle(admin, id)))).filter(Boolean)
    : [];
  const bundleItems = [
    {
      productId: product.id,
      productHandle: product.handle,
      productTitle: product.title,
      variantId: firstVariant?.id ?? null,
      variantTitle: firstVariant?.title ?? null,
      variantPrice: firstVariant?.price ?? null,
      imageUrl: product.featuredMedia?.preview?.image?.url ?? null,
      quantity: 1,
      sortOrder: 0,
      required: true,
    },
    ...crossSellProducts.map((item, index) => {
      const variant = item!.variants.nodes[0];
      return {
        productId: item!.id,
        productHandle: item!.handle,
        productTitle: item!.title,
        variantId: variant?.id ?? null,
        variantTitle: variant?.title ?? null,
        variantPrice: variant?.price ?? null,
        imageUrl: item!.featuredMedia?.preview?.image?.url ?? null,
        quantity: 1,
        sortOrder: index + 1,
        required: true,
      };
    }),
  ];

  const bundle = await prisma.bundle.create({
    data: {
      shopId: shop.id,
      productId: product.id,
      productHandle: product.handle,
      productTitle: product.title,
      type,
      status: "DRAFT",
      discountValueType,
      discountValue,
      discountStartsAt: startsAt,
      discountEndsAt: endsAt,
      totalUsageLimit: Number(formData.get("totalUsageLimit") || 0) || null,
      oncePerCustomer: formData.get("oncePerCustomer") === "on",
      timerMode: endsAt ? "REAL_END_DATE" : "FAKE_EVERGREEN",
      fakeTimerMinutes: endsAt ? null : 20,
      stylePreset,
      badgePreset,
      domEffect,
      productSnapshot: {
        create: {
          status: product.status,
          imageUrl: product.featuredMedia?.preview?.image?.url ?? null,
          imageAlt: product.featuredMedia?.preview?.image?.altText ?? product.title,
          totalInventory: product.totalInventory,
          tracksInventory: product.tracksInventory,
          variantsCount: product.variantsCount.count,
          variants: JSON.stringify(product.variants.nodes),
        },
      },
      style: {
        create: {
          designTokens: JSON.stringify(DESIGN_PRESETS.find((preset) => preset.id === stylePreset)?.tokens ?? DESIGN_PRESETS[0].tokens),
        },
      },
      tiers: type === "VOLUME"
        ? {
            create: [
              { quantity: 2, label: "Pack x2", discountValue, vignette: `Save ${discountValue}%`, sortOrder: 0 },
              { quantity: 3, label: "Pack x3", discountValue: discountValue + 5, vignette: `Save ${discountValue + 5}%`, sortOrder: 1 },
            ],
          }
        : undefined,
      items: {
        create: bundleItems,
      },
    },
  });

  try {
    const discount = await createShopifyBundleDiscount(admin, {
      ...bundle,
      customerIds: null,
      customerSegmentIds: null,
    });
    await prisma.bundle.update({
      where: { id: bundle.id },
      data: {
        status: "ACTIVE",
        shopifyDiscountId: discount.discountId,
        shopifyDiscountStatus: discount.status === "ACTIVE" ? "ACTIVE" : "DRAFT",
        shopifyDiscountTitle: discount.title,
      },
    });
    await writeSyncLog({
      shopId: shop.id,
      bundleId: bundle.id,
      action: "discount.create",
      status: "SUCCESS",
      payload: { discountId: discount.discountId, status: discount.status },
    });
  } catch (error) {
    await writeSyncLog({
      shopId: shop.id,
      bundleId: bundle.id,
      action: "discount.create",
      status: "ERROR",
      message: error instanceof Error ? error.message : "Erreur inconnue",
    });
    await prisma.bundle.delete({ where: { id: bundle.id } });
    throw error;
  }

  return redirect("/app/bundles");
};

export default function NewBundle() {
  const { product, products, crossSellProducts, designPresets, badgePresets, domEffects } = useLoaderData<typeof loader>();

  if (!product) {
    return (
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Choisir le produit du premier bundle</Text>
            {products?.nodes.map((item) => (
              <InlineStack key={item.id} align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="span" fontWeight="semibold">{item.title}</Text>
                  <Text as="span" tone="subdued">{item.variantsCount.count} variant(s)</Text>
                </BlockStack>
                <Button url={`/app/bundles/new?productId=${encodeURIComponent(item.id)}`}>Paramétrer</Button>
              </InlineStack>
            ))}
          </BlockStack>
        </Card>
      </BlockStack>
    );
  }

  return (
    <Form method="post">
      <input type="hidden" name="productId" value={product.id} />
      <BlockStack gap="400">
        <Card>
          <InlineStack align="space-between">
            <BlockStack gap="100">
              <Text as="h2" variant="headingLg">{product.title}</Text>
              <Text as="p" tone="subdued">{product.handle}</Text>
            </BlockStack>
              <Badge tone={product.totalInventory && product.totalInventory > 0 ? "success" : "critical"}>
              {`${product.variantsCount.count} variant(s), stock ${product.totalInventory ?? "non suivi"}`}
            </Badge>
          </InlineStack>
        </Card>

        <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">Bundle et réduction Shopify</Text>
              <label>Mode<select name="type"><option value="VOLUME">Volume bundle</option><option value="CROSS_SELL">Cross sell bundle</option></select></label>
              <label>
                Valeur de réduction
                <select name="discountValueType">
                  <option value="PERCENTAGE">Pourcentage</option>
                  <option value="FIXED_AMOUNT">Montant fixe</option>
                  <option value="FINAL_AMOUNT">Montant final</option>
                </select>
              </label>
              <label>Valeur<input name="discountValue" defaultValue="10" type="number" /></label>
              <label>Limite totale d'utilisations<input name="totalUsageLimit" type="number" /></label>
              <label>
                <input type="checkbox" name="oncePerCustomer" /> Limiter à une utilisation par client
              </label>
              <BlockStack gap="150">
                <Text as="p" fontWeight="semibold">Produits additionnels cross sell</Text>
                <Text as="p" tone="subdued">Utilisé seulement si le mode Cross sell bundle est sélectionné.</Text>
                {crossSellProducts?.nodes.filter((item) => item.id !== product.id).map((item) => (
                  <label key={item.id}>
                    <input type="checkbox" name="crossSellProductIds" value={item.id} /> {item.title}
                  </label>
                ))}
              </BlockStack>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">Dates et rendu</Text>
              <label>Date de début<input name="startsAt" type="datetime-local" /></label>
              <label>Date de fin optionnelle<input name="endsAt" type="datetime-local" /></label>
              <label>Design preset<select name="stylePreset">{designPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></label>
              <label>Badge preset<select name="badgePreset">{badgePresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></label>
              <label>Effet DOM<select name="domEffect">{domEffects.map((effect) => <option key={effect.id} value={effect.id}>{effect.name}</option>)}</select></label>
            </BlockStack>
          </Card>
        </InlineGrid>

        <InlineStack align="end">
          <Button submit variant="primary">Créer le bundle et la réduction</Button>
        </InlineStack>
      </BlockStack>
    </Form>
  );
}
