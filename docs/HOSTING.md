# Publishing the landing page on here.now

The normal app requires a Next.js server and a deployed season. here.now hosts static files.
The marketing export preserves the landing page, local fonts, original 3D scenes and interactions.
Game links show the same unavailable-season screen as the normal app with no deployment.
It does not publish wallet transactions, API routes, deployment files or credentials.

Build the export from the repository root:

```sh
pnpm --filter @stock-miner/app export:landing
```

The build runs in an isolated generated directory, leaving the local preview and normal app build
untouched. Publish only `generated/here-now/site`, whose root contains `index.html`.

Using the installed here-now skill:

```sh
/Users/gregcorby/.agents/skills/here-now/scripts/publish.sh generated/here-now/site --client codex
```

For an update, append `--slug <existing-slug>`. The publisher uses local credentials if configured;
otherwise anonymous hosting lasts 24 hours and the returned claim link can preserve the site.
`.herenow/` contains private publishing state and is ignored by Git. Do not publish or commit it.
