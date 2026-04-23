import { BlockStack, Card, Text } from "@shopify/polaris";

export default function Settings() {
  return (
    <BlockStack gap="400">
      <Card>
        <Text as="h2" variant="headingMd">Réglages app</Text>
        <Text as="p" tone="subdued">
          Les réglages globaux accueilleront la langue, les presets par défaut, les options analytics et les futures options exposées dans l'éditeur de thème.
        </Text>
      </Card>
    </BlockStack>
  );
}
