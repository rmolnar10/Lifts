/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The meal switcher is a static page in public/; serve it at /meals.
  async rewrites() {
    return [{ source: "/meals", destination: "/meals.html" }];
  },
};

export default nextConfig;
