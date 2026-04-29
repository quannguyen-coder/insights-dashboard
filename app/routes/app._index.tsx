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

type SalesOverviewError = {
  title: string;
  message: string;
  helpUrl?: string;
};

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
      error: getSalesOverviewError(error),
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
      shopify.toast.show(error.title, { isError: true });
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
              {error ? <SalesError error={error} /> : null}
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
  const chartRows = getDailyChartRows(overview);

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
                  Revenue trend
                </Text>
                <Text as="p" tone="subdued">
                  Daily revenue across the last 30 days.
                </Text>
              </BlockStack>
              <Badge tone="info">Visual chart</Badge>
            </InlineStack>
            <Divider />
            {hasSales ? (
              <DailyRevenueChart
                rows={chartRows}
                currencyCode={overview.currencyCode}
              />
            ) : (
              <SalesEmptyState />
            )}
          </BlockStack>
        </Box>
      </Card>

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

function DailyRevenueChart({
  rows,
  currencyCode,
}: {
  rows: SalesOverview["rows"];
  currencyCode: string;
}) {
  const width = 760;
  const height = 260;
  const padding = {
    top: 24,
    right: 24,
    bottom: 52,
    left: 72,
  };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxRevenue = Math.max(...rows.map((row) => row.revenue), 1);
  const barGap = 4;
  const barWidth = Math.max(chartWidth / rows.length - barGap, 4);
  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <BlockStack gap="300">
      <Box
        borderColor="border-secondary"
        borderRadius="300"
        borderWidth="025"
        overflowX="scroll"
        padding="300"
      >
        <svg
          aria-label="Daily revenue bar chart"
          height={height}
          role="img"
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
        >
          <title>Daily revenue for the last 30 days</title>
          <desc>
            Bar chart showing revenue by day for the selected reporting period.
          </desc>
          {gridLines.map((line) => {
            const y = padding.top + chartHeight - chartHeight * line;

            return (
              <g key={line}>
                <line
                  stroke="var(--p-color-border-secondary)"
                  strokeDasharray={line === 0 ? undefined : "4 4"}
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={y}
                  y2={y}
                />
                <text
                  fill="var(--p-color-text-subdued)"
                  fontSize="11"
                  textAnchor="end"
                  x={padding.left - 10}
                  y={y + 4}
                >
                  {formatCompactMoney(maxRevenue * line, currencyCode)}
                </text>
              </g>
            );
          })}
          {rows.map((row, index) => {
            const x = padding.left + index * (barWidth + barGap);
            const barHeight =
              maxRevenue > 0 ? (row.revenue / maxRevenue) * chartHeight : 0;
            const y = padding.top + chartHeight - barHeight;
            const showLabel =
              index === 0 || index === rows.length - 1 || index % 7 === 0;

            return (
              <g key={row.date}>
                <rect
                  fill="var(--p-color-bg-fill-brand)"
                  height={Math.max(barHeight, row.revenue > 0 ? 2 : 0)}
                  rx="3"
                  width={barWidth}
                  x={x}
                  y={row.revenue > 0 ? y : padding.top + chartHeight}
                >
                  <title>
                    {`${formatDate(row.date)}: ${formatMoney(
                      row.revenue,
                      currencyCode,
                    )} from ${row.orders} orders`}
                  </title>
                </rect>
                {showLabel ? (
                  <text
                    fill="var(--p-color-text-subdued)"
                    fontSize="11"
                    textAnchor="middle"
                    x={x + barWidth / 2}
                    y={height - 18}
                  >
                    {formatShortDate(row.date)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </Box>
      <InlineStack gap="400" wrap>
        <Text as="p" tone="subdued" variant="bodySm">
          Peak day:{" "}
          <Text as="span" fontWeight="semibold">
            {formatMoney(maxRevenue, currencyCode)}
          </Text>
        </Text>
        <Text as="p" tone="subdued" variant="bodySm">
          Days shown:{" "}
          <Text as="span" fontWeight="semibold">
            {rows.length.toString()}
          </Text>
        </Text>
      </InlineStack>
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

function SalesError({ error }: { error: SalesOverviewError }) {
  return (
    <Banner title={error.title} tone="critical">
      <p>{error.message}</p>
      {error.helpUrl ? (
        <p>
          <a href={error.helpUrl} target="_blank" rel="noreferrer">
            Review Shopify protected customer data requirements
          </a>
        </p>
      ) : null}
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

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
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

function formatCompactMoney(amount: number, currencyCode: string) {
  return new Intl.NumberFormat("en", {
    compactDisplay: "short",
    currency: currencyCode,
    maximumFractionDigits: 1,
    notation: "compact",
    style: "currency",
  }).format(amount);
}

function getDailyChartRows(overview: SalesOverview) {
  const rowsByDate = new Map(overview.rows.map((row) => [row.date, row]));
  const rows: SalesOverview["rows"] = [];
  const cursor = new Date(overview.startsAt);
  const endsAt = new Date(overview.endsAt);

  cursor.setUTCHours(0, 0, 0, 0);
  endsAt.setUTCHours(0, 0, 0, 0);

  while (cursor <= endsAt) {
    const date = cursor.toISOString().slice(0, 10);
    rows.push(
      rowsByDate.get(date) ?? {
        date,
        revenue: 0,
        orders: 0,
        aov: 0,
      },
    );
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return rows;
}

function getSalesOverviewError(error: unknown): SalesOverviewError {
  const fallbackMessage = "Unable to load sales data from Shopify.";
  const message = error instanceof Error ? error.message : fallbackMessage;

  if (
    message.includes("not approved to access the Order object") ||
    message.includes("protected-customer-data")
  ) {
    return {
      title: "Protected customer data access required",
      message:
        "Shopify is blocking access to orders until this app is approved for protected customer data. The app already requests read_orders, but Shopify also requires protected data access for the Order object before sales analytics can load.",
      helpUrl: "https://shopify.dev/docs/apps/launch/protected-customer-data",
    };
  }

  return {
    title: "Unable to load sales data",
    message,
  };
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
