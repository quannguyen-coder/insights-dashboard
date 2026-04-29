import { useEffect } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigation, useRevalidator } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  AppProvider as PolarisAppProvider,
  Banner,
  BlockStack,
  Card,
  DataTable,
  InlineGrid,
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
  const isLoading =
    navigation.state === "loading" || revalidator.state === "loading";

  useEffect(() => {
    if (error) {
      shopify.toast.show(error, { isError: true });
      return;
    }

    if (overview) {
      shopify.toast.show("Sales data updated");
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
  const rows = overview.rows.map((row) => [
    formatDate(row.date),
    row.orders,
    formatMoney(row.revenue, overview.currencyCode),
    formatMoney(row.aov, overview.currencyCode),
  ]);

  return (
    <BlockStack gap="500">
      <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
        <MetricCard
          label="Revenue"
          value={formatMoney(overview.totalRevenue, overview.currencyCode)}
        />
        <MetricCard label="Orders" value={overview.totalOrders.toString()} />
        <MetricCard
          label="Average order value"
          value={formatMoney(overview.aov, overview.currencyCode)}
        />
      </InlineGrid>

      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">
            Daily sales
          </Text>
          <DataTable
            columnContentTypes={["text", "numeric", "numeric", "numeric"]}
            headings={["Date", "Orders", "Revenue", "AOV"]}
            rows={rows}
            totals={[
              "Total",
              overview.totalOrders,
              formatMoney(overview.totalRevenue, overview.currencyCode),
              formatMoney(overview.aov, overview.currencyCode),
            ]}
            hasZebraStripingOnData
            increasedTableDensity
          />
          <Text as="p" tone="subdued" variant="bodySm">
            Updated {formatDateTime(overview.generatedAt)}. Cancelled orders are
            excluded from these totals.
          </Text>
        </BlockStack>
      </Card>
    </BlockStack>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <BlockStack gap="200">
        <Text as="p" tone="subdued">
          {label}
        </Text>
        <Text as="p" variant="headingLg" fontWeight="semibold">
          {value}
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

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
