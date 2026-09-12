# RPG Map Tracker

An interactive-map progress tracker for open-world RPGs — track quest completion, points of interest, and overall progress across game worlds (Dark Souls 3, Elden Ring, The Witcher 3) instead of relying on a spreadsheet or checklist.

Originally built as a final-year Computer Science dissertation project (University of Salford), redeployed here to Microsoft Azure as a portfolio piece demonstrating static site hosting, CDN distribution, and CI/CD.

## Features

- Interactive Leaflet map per game, with clickable nodes for quests, items, and points of interest
- Supabase-backed authentication and per-user progress persistence
- Quest dependency logic — prerequisite quests must be completed before dependents unlock, with auto-ticking of related items
- Completion-time estimation and a recommendation heuristic for suggesting what to do next
- Sidebar filtering by category, and a dashboard summarising overall progress

## Tech stack

React 19, TypeScript, Vite, Tailwind CSS, Leaflet / react-leaflet, react-router-dom, Supabase (Postgres + Auth)

## Live demo

_TBD — link goes here once deployed to Azure_

## Architecture

_TBD — diagram goes here once the Azure Storage Account + CDN + GitHub Actions pipeline is built_

## Deployment

Static build (`npm run build`) hosted on Azure Blob Storage static website hosting, served through Azure CDN, with GitHub Actions rebuilding and redeploying automatically on every push to `main`.

## Screenshots

_TBD — added once the app is live and reachable_

## Cost notes

_TBD — added once the Azure resources are provisioned_

## Local development

\`\`\`bash
npm install
npm run dev
\`\`\`

Requires a \`.env\` file with \`VITE_SUPABASE_URL\` and \`VITE_SUPABASE_ANON_KEY\` (not committed — see \`.gitignore\`).
