import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the Turbopack root to this project so a stray lockfile in a parent
  // directory can't be mistaken for the workspace root.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
