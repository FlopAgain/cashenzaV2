import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { BlockStack, Button, Card, Text } from "@shopify/polaris";

import prisma from "~/db.server";
import { BADGE_PRESETS, DESIGN_PRESETS, DOM_EFFECTS } from "~/models/presets";
import { getOrCreateShop } from "~/models/shop.server";
import { authenticate } from "~/shopify.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop);
  const bundle = await prisma.bundle.findFirst({
    where: { id: params.bundleId, shopId: shop.id, status: { not: "DELETED" } },
    include: { style: true },
  });
  if (!bundle) throw new Response("Bundle introuvable", { status: 404 });
  return { bundle, designPresets: DESIGN_PRESETS, badgePresets: BADGE_PRESETS, domEffects: DOM_EFFECTS };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop);
  const formData = await request.formData();
  const stylePreset = String(formData.get("stylePreset") || "atelier");
  const badgePreset = String(formData.get("badgePreset") || "none");
  const domEffect = String(formData.get("domEffect") || "FADE_UP") as "NONE" | "FADE_UP" | "SCALE_IN" | "SLIDE_LEFT";
  const customCss = String(formData.get("customCss") || "");
  const bundle = await prisma.bundle.findFirst({ where: { id: params.bundleId, shopId: shop.id } });
  if (!bundle) throw new Response("Bundle introuvable", { status: 404 });

  await prisma.bundle.update({
    where: { id: bundle.id },
    data: {
      stylePreset,
      badgePreset,
      domEffect,
      style: {
        upsert: {
          create: {
            designTokens: JSON.stringify(DESIGN_PRESETS.find((preset) => preset.id === stylePreset)?.tokens ?? DESIGN_PRESETS[0].tokens),
            customCss,
          },
          update: {
            designTokens: JSON.stringify(DESIGN_PRESETS.find((preset) => preset.id === stylePreset)?.tokens ?? DESIGN_PRESETS[0].tokens),
            customCss,
          },
        },
      },
    },
  });

  return redirect("/app/bundles");
};

export default function EditStyle() {
  const { bundle, designPresets, badgePresets, domEffects } = useLoaderData<typeof loader>();
  return (
    <Form method="post">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingLg">Style de {bundle.productTitle}</Text>
            <label>Design preset<select name="stylePreset" defaultValue={bundle.stylePreset}>{designPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></label>
            <label>Badge preset<select name="badgePreset" defaultValue={bundle.badgePreset}>{badgePresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></label>
            <label>Effet de chargement<select name="domEffect" defaultValue={bundle.domEffect}>{domEffects.map((effect) => <option key={effect.id} value={effect.id}>{effect.name}</option>)}</select></label>
            <label>CSS personnalisé<textarea name="customCss" rows={6} defaultValue={bundle.style?.customCss ?? ""} /></label>
            <Button submit variant="primary">Enregistrer le style</Button>
          </BlockStack>
        </Card>
      </BlockStack>
    </Form>
  );
}
