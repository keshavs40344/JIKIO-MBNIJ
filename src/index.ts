import { createApp } from "./server/app.js";
import { FoundationRepository } from "./database/repository.js";

const PORT = process.env.PORT || 3000;
const repo = new FoundationRepository();
repo.seedDemoUsers();
const app = createApp({ repo });

app.listen(PORT, () => {
  console.log(`================================================================`);
  console.log(`  VESPERA ATELIER — FASHION MARKETPLACE ENGINE ACTIVE`);
  console.log(`  Storefront & Portals: http://localhost:${PORT}`);
  console.log(`  API Base URL:         http://localhost:${PORT}/api/v1`);
  console.log(`  Health Check:         http://localhost:${PORT}/api/v1/health`);
  console.log(`================================================================`);
});
