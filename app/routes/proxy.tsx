import { createHmac, timingSafeEqual } from "node:crypto";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (!verifyAppProxySignature(url.searchParams)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const shop = url.searchParams.get("shop") ?? "your store";

  return new Response(renderProxyLiquid(shop), {
    headers: {
      "Content-Type": "application/liquid; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
};

function verifyAppProxySignature(searchParams: URLSearchParams) {
  const signature = searchParams.get("signature");
  const secret = process.env.SHOPIFY_API_SECRET;

  if (!signature || !secret) {
    return false;
  }

  const calculatedSignature = createHmac("sha256", secret)
    .update(buildSignedPayload(searchParams))
    .digest("hex");

  return safeCompare(calculatedSignature, signature);
}

function buildSignedPayload(searchParams: URLSearchParams) {
  const groupedParams = new Map<string, string[]>();

  for (const [key, value] of searchParams.entries()) {
    if (key === "signature") {
      continue;
    }

    groupedParams.set(key, [...(groupedParams.get(key) ?? []), value]);
  }

  return Array.from(groupedParams.entries())
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, values]) => `${key}=${values.sort().join(",")}`)
    .join("");
}

function safeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function renderProxyLiquid(shop: string) {
  const escapedShop = escapeHtml(shop);

  return `
<section class="insights-dashboard-proxy" aria-labelledby="insights-dashboard-title">
  <div class="page-width">
    <h1 id="insights-dashboard-title">{{ shop.name | escape }} insights</h1>
    <p>This storefront content is served by the Insights Dashboard app for ${escapedShop}.</p>
    {% if customer %}
      <p>Signed in as {{ customer.email | escape }}.</p>
    {% else %}
      <p>Sign in to your customer account to view personalized storefront insights.</p>
    {% endif %}
  </div>
</section>
`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
