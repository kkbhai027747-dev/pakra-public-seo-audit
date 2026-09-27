# Repository boundaries

This repository owns the read-only public SEO audit tool. Start with README.md, src/audit.mjs and tests/audit.test.mjs.

- Safe local regression command: node --test tests/audit.test.mjs. Tests inject all fetch responses and require no network access or package installation.
- Preserve same-origin checks, private-path rejection, redirect rejection, bounded sampling and opt-in PageSpeed behavior.
- Importing the module must remain free of network and file-output side effects.
- Run a real audit only for public targets included in the user's authorized scope. No authenticated crawling, customer/order/payment data, Shopify Admin API writes or credential collection belongs in this tool.
- Keep config/local.json, output/, logs and credentials out of Git. Never store or print tokens, cookies or client secrets in source, logs or ordinary .env files.
- SOURCE-MANIFEST.json records historical provenance; its old paths are not runtime dependencies.
