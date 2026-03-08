# MoneyFlow Pro

Personal finance web app for tracking income, expenses, investments, and savings goals.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Deploy on Vercel

This repo includes `vercel.json` configured for a Vite SPA:
- build command: `npm run build`
- output directory: `dist`
- SPA rewrite to `index.html`

To deploy:
1. Import this repository in Vercel.
2. Keep framework preset as Vite.
3. Deploy.

## Notes

- App data is stored in browser `localStorage`.
- Dashboard supports automatic post-25th monthly balance sweep into savings goals.
