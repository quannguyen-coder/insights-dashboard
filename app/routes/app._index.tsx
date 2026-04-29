import { useEffect, useRef } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigation, useRevalidator } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  AppProvider as PolarisAppProvider,
  Badge,
  Banner,
  BlockStack,
  Box,
  Card,
  DataTable,
  Divider,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  SkeletonBodyText,
  SkeletonDisplayText,
  Text,
} from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { boundary } from "@shopify/shopify-app-react-router/server";
import type { SalesOverview } from "../models/sales.server";
import { getSalesOverview } from "../models/sales.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  try {
    return {
      overview: await getSalesOverview(admin),
      error: null,
    };
  } catch (error) {
    console.error("Failed to load sales overview", error);

    return {
      overview: null,
      error:
        error instanceof Error
          ? error.message
          : "Unable to load sales data from Shopify.",
    };
  }
};

export default function Index() {
  const { overview, error } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const shopify = useAppBridge();
  const hasLoadedOnce = useRef(false);
  const isLoading =
    navigation.state === "loading" || revalidator.state === "loading";

  useEffect(() => {
    if (error) {
      shopify.toast.show(error, { isError: true });
      return;
    }

    if (overview && hasLoadedOnce.current) {
      shopify.toast.show("Sales data updated");
    }

    if (overview) {
      hasLoadedOnce.current = true;
    }
  }, [error, overview, shopify]);

  return (
    <PolarisAppProvider i18n={enTranslations}>
      <Page
        title="Sales Overview"
        subtitle="Orders and revenue from the last 30 days."
        primaryAction={{
          content: "Refresh",
          loading: isLoading,
          onAction: () => revalidator.revalidate(),
        }}
      >
        <Layout>
          <Layout.Section>
            <BlockStack gap="500">
              {error ? <SalesError message={error} /> : null}
              {isLoading && !overview ? <SalesLoading /> : null}
              {overview ? <SalesDashboard overview={overview} /> : null}
            </BlockStack>
          </Layout.Section>
        </Layout>
      </Page>
    </PolarisAppProvider>
  );
}

function SalesDashboard({
  overview,
}: {
  overview: SalesOverview;
}) {
  const topDay = overview.rows.reduce<SalesOverview["rows"][number] | null>(
    (currentTopDay, row) =>
      !currentTopDay || row.revenue > currentTopDay.revenue
        ? row
        : currentTopDay,
    null,
  );
  const rows = overview.rows.map((row) => [
    formatDate(row.date),
    row.orders,
    formatMoney(row.revenue, overview.currencyCode),
    formatMoney(row.aov, overview.currencyCode),
    formatPercent(
      overview.totalRevenue > 0 ? row.revenue / overview.totalRevenue : 0,
    ),
  ]);

  const hasSales = overview.totalOrders > 0;

  return (
    <BlockStack gap="600">
      <Card>
        <Box padding="600">
          <InlineStack align="space-between" blockAlign="start" gap="400">
            <BlockStack gap="200">
              <InlineStack gap="200" blockAlign="center">
                <Badge tone={hasSales ? "success" : "attention"}>
                  {hasSales ? "Live data" : "No recent sales"}
                </Badge>
                <Badge tone="info">{overview.currencyCode}</Badge>
              </InlineStack>
              <Text as="h2" variant="headingLg">
                Last 30 days performance
              </Text>
              <Text as="p" tone="subdued">
                {formatDate(overview.startsAt)} to {formatDate(overview.endsAt)}
              </Text>
            </BlockStack>
            <BlockStack gap="100">
              <Text as="p" tone="subdued" alignment="end">
                Last updated
              </Text>
              <Text as="p" fontWeight="medium" alignment="end">
                {formatDateTime(overview.generatedAt)}
              </Text>
            </BlockStack>
          </InlineStack>
        </Box>
      </Card>

      <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
        <MetricCard
          label="Revenue"
          value={formatMoney(overview.totalRevenue, overview.currencyCode)}
          helpText="Gross order value from non-cancelled orders."
        />
        <MetricCard
          label="Orders"
          value={overview.totalOrders.toLocaleString("en")}
          helpText="Non-cancelled orders processed in the period."
        />
        <MetricCard
          label="Average order value"
          value={formatMoney(overview.aov, overview.currencyCode)}
          helpText="Revenue divided by order count."
        />
        <MetricCard
          label="Peak day"
          value={
            topDay
              ? formatMoney(topDay.revenue, overview.currencyCode)
              : formatMoney(0, overview.currencyCode)
          }
          helpText={topDay ? formatDate(topDay.date) : "No sales recorded yet."}
        />
      </InlineGrid>

      <Card>
        <Box padding="500">
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center" gap="300">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  Daily sales breakdown
                </Text>
                <Text as="p" tone="subdued">
                  Revenue contribution by day, sorted newest first.
                </Text>
              </BlockStack>
              <Badge tone="read-only">
                {`${overview.rows.length} active days`}
              </Badge>
            </InlineStack>
            <Divider />
          </BlockStack>
        </Box>
        <Box paddingInline="500" paddingBlockEnd="500">
          <BlockStack gap="400">
          {hasSales ? (
            <DataTable
              columnContentTypes={[
                "text",
                "numeric",
                "numeric",
                "numeric",
                "numeric",
              ]}
              headings={["Date", "Orders", "Revenue", "AOV", "Share"]}
              rows={rows}
              totals={[
                "Total",
                overview.totalOrders,
                formatMoney(overview.totalRevenue, overview.currencyCode),
                formatMoney(overview.aov, overview.currencyCode),
                "100%",
              ]}
              hasZebraStripingOnData
              increasedTableDensity
            />
          ) : (
            <SalesEmptyState />
          )}
          <Text as="p" tone="subdued" variant="bodySm">
            Cancelled orders are excluded. Revenue is shown in store currency
            from Shopify Admin GraphQL order totals.
          </Text>
          </BlockStack>
        </Box>
      </Card>
    </BlockStack>
  );
}

function SalesEmptyState() {
  return (
    <Banner title="No sales found in the last 30 days" tone="info">
      <p>
        Once this store receives paid orders, the daily sales table will show
        revenue, order count, and average order value here.
      </p>
    </Banner>
  );
}

function MetricCard({
  label,
  value,
  helpText,
}: {
  label: string;
  value: string;
  helpText: string;
}) {
  return (
    <Card>
      <BlockStack gap="300">
        <Text as="p" tone="subdued">
          {label}
        </Text>
        <Text as="p" variant="headingLg" fontWeight="semibold">
          {value}
        </Text>
        <Text as="p" tone="subdued" variant="bodySm">
          {helpText}
        </Text>
      </BlockStack>
    </Card>
  );
}

function SalesLoading() {
  return (
    <Card>
      <BlockStack gap="400">
        <SkeletonDisplayText size="small" />
        <SkeletonBodyText lines={6} />
      </BlockStack>
    </Card>
  );
}

function SalesError({ message }: { message: string }) {
  return (
    <Banner title="Unable to load sales data" tone="critical">
      <p>{message}</p>
    </Banner>
  );
}

function formatMoney(amount: number, currencyCode: string) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: currencyCode,
  }).format(amount);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("en", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
