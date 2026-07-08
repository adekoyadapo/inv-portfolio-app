# Investment Portfolio App

Investment Portfolio App is a local-first admin dashboard for tracking institutions, accounts, monthly values, and AI-assisted statement imports.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example` and set your Elasticsearch, S3-compatible storage, admin, and AI provider credentials.
   If Dokploy uses Nixpacks, keep `NIXPACKS_NODE_VERSION=22` so the build resolves a supported Node package.

3. Start the local stack:

```bash
docker compose up --build
```

4. Open:

- Dashboard: `http://localhost:3001`
- Demo portal: `http://localhost:3001/demo`
- Admin portal: `http://localhost:3001/admin`
- AI import: `http://localhost:3001/admin/ai-import`

## Notes

- `/dashboard` is the landing page.
- `/demo` uses demo data only.
- The app stores portfolio data in Elasticsearch and logos in an S3-compatible object store.
- The AI import workflow supports PDF, image, CSV, and XLSX/XLS exports.
