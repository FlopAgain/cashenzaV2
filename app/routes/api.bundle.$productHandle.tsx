import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

import prisma from "~/db.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop");
  const productHandle = params.productHandle;

  if (!shopDomain || !productHandle) {
    return json({ bundles: [] }, { status: 400 });
  }

  const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
  if (!shop) return json({ bundles: [] });

  const bundles = await prisma.bundle.findMany({
    where: {
      shopId: shop.id,
      productHandle,
      status: "ACTIVE",
      shopifyDiscountStatus: "ACTIVE",
    },
    include: { items: true, tiers: true, style: true, productSnapshot: true },
    orderBy: { createdAt: "desc" },
  });

  return json({
    bundles: bundles.map((bundle) => ({
      id: bundle.id,
      type: bundle.type,
      productId: bundle.productId,
      productTitle: bundle.productTitle,
      discountValueType: bundle.discountValueType,
      discountValue: bundle.discountValue.toString(),
      endsAt: bundle.discountEndsAt?.toISOString() ?? null,
      timerMode: bundle.timerMode,
      fakeTimerMinutes: bundle.fakeTimerMinutes,
      stylePreset: bundle.stylePreset,
      badgePreset: bundle.badgePreset,
      domEffect: bundle.domEffect,
      designTokens: bundle.style?.designTokens ? JSON.parse(bundle.style.designTokens) : null,
      customCss: bundle.style?.customCss ?? null,
      imageUrl: bundle.productSnapshot?.imageUrl ?? null,
      imageAlt: bundle.productSnapshot?.imageAlt ?? bundle.productTitle,
      tiers: bundle.tiers.map((tier) => ({
        id: tier.id,
        quantity: tier.quantity,
        label: tier.label,
        discountValue: tier.discountValue.toString(),
        vignette: tier.vignette,
        sortOrder: tier.sortOrder,
      })),
      items: bundle.items
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((item) => ({
          id: item.id,
          productId: item.productId,
          productHandle: item.productHandle,
          productTitle: item.productTitle,
          variantId: item.variantId,
          variantTitle: item.variantTitle,
          variantPrice: item.variantPrice?.toString() ?? null,
          imageUrl: item.imageUrl,
          quantity: item.quantity,
          sortOrder: item.sortOrder,
          required: item.required,
        })),
      variants: bundle.productSnapshot?.variants ? JSON.parse(bundle.productSnapshot.variants) : [],
    })),
  });
};
