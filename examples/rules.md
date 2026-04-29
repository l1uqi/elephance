# Elephance Project Rules

Use this file as a starting template for projects that use Elephance.

## General Rules

- Elephance does not store rules, memory, or schema automatically.
- Write data only through explicit application calls such as `upsertMemory` and `replaceProjectSchemaForSource`.
- Add `.lancedb` to your application `.gitignore` unless local vector data should be committed.
- Do not store secrets, tokens, passwords, private keys, or sensitive personal data.
- Keep all vectors in the same table on the same embedding model and dimensionality.
- Use a new `dbPath` or table name when changing to an embedding model with a different vector size.

## Memory Rules

- Store stable user preferences with `label: "user_preference"`.
- Store notes with `label: "note"`.
- Store conversation summaries with `label: "summary"`.
- Store durable facts with `label: "fact"`.
- Keep each memory short, specific, and self-contained.
- Prefer one idea per memory row.
- Include a stable `userId` when storing user-specific memory.
- Call `clearUserMemory(userId)` when a user requests memory deletion.

## Schema Rules

- Use one source file per database table or bounded module.
- Use stable source paths, such as `tables/billing_invoice.md`.
- Keep schema chunks focused on fields, relationships, constraints, and business meaning.
- Use `replaceProjectSchemaForSource` when syncing a changed source file.
- Use `deleteProjectSchemaBySource` when a source file is removed.
- Use `queryProjectSchemaByTableNames` when exact table names are known.
- Use `queryProjectSchema` for fuzzy semantic search.
- Use `batchQueryProjectSchema` when several keywords should contribute to one merged context.

## Prompt Context Rules

- Use `minimal: true` for compact LLM prompt context.
- Increase `topK` only when the model needs broader context.
- Increase `maxChunksPerSource` only when a single source has several useful chunks.
- Prefer exact table lookup before semantic search when user intent names concrete tables.
