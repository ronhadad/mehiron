/** @type {import('next').NextConfig} */
const nextConfig = {
  // The server package is plain NodeNext TypeScript: its internal imports carry
  // a `.js` extension that only exists after compilation. Teaching webpack to
  // resolve those back to `.ts` lets the Google layer be imported as source,
  // with no build step between the two workspaces.
  webpack: (config) => {
    config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    return config;
  },
};

export default nextConfig;
