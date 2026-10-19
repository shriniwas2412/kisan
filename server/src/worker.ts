// Cloudflare Workers entry. No cron: mandi prices refresh lazily on request.
import { createApp } from "./app.ts";

export default createApp();
