import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

// Points the plugin at the request config, which is what makes messages available to server
// components without threading them through every prop.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {};

export default withNextIntl(nextConfig);
