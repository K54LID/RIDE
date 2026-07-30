# apps/api/src/server.ts — two deletions

Remove the import (it is the last item on the import line block):

```diff
-import multipart from '@fastify/multipart';
```

Remove the registration:

```diff
-await app.register(multipart, { limits: { fileSize: 45 * 1024 * 1024, files: 1 } });
 await app.register(walletRoutes);
```

Nothing else in server.ts changes. The content-type parser now lives
inside mediaRoutes, scoped to that plugin instance, so JSON parsing on
every other route is untouched.
