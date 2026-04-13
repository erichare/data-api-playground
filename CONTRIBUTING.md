# Contributing to Data API Playground

Thank you for considering a contribution! This guide covers the process for reporting issues, suggesting improvements, and submitting pull requests.

## Getting Started

1. **Fork** the repository and clone your fork locally.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy the example environment file and configure credentials:
   ```bash
   cp .env.example .env.local
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

See the [README](README.md) for full setup details including Astra DB and AI backend configuration.

## Development Workflow

### Branch Naming

Use a descriptive branch name with a conventional prefix:

```
feat/add-collection-search
fix/chat-streaming-timeout
docs/update-api-reference
refactor/split-chat-service
```

### Running Tests

```bash
# Unit + integration tests
npm run test

# Unit tests with coverage report
npm run test:coverage

# End-to-end browser tests (requires a built app)
npm run build && npm run test:e2e
```

All pull requests must pass the CI checks before merging. The project enforces:

- **85% statement coverage** (global)
- **70% branch coverage** (global)
- **80% function coverage** (global)

Critical modules have higher per-file thresholds defined in `vitest.config.ts`.

### Linting

```bash
npm run lint
```

ESLint is configured via `eslint.config.mjs` with the Next.js recommended rules.

## Submitting a Pull Request

1. Create a feature branch from `main`.
2. Make your changes with clear, focused commits.
3. Write or update tests for any changed behavior.
4. Ensure `npm run lint`, `npm run test`, and `npm run build` all pass locally.
5. Push your branch and open a pull request against `main`.
6. Fill in the PR template with a summary and test plan.

### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <description>

<optional body>
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`

Examples:

```
feat: add hybrid search mode toggle
fix: prevent duplicate document ingestion on retry
docs: add JSDoc to AI service module
```

### PR Checklist

Before requesting review, verify:

- [ ] New/changed code has tests
- [ ] All tests pass (`npm run test`)
- [ ] No lint errors (`npm run lint`)
- [ ] Build succeeds (`npm run build`)
- [ ] No hardcoded secrets or credentials
- [ ] Commit messages follow the conventional format

## Project Structure

```
src/
  app/           # Next.js App Router pages and API routes
  components/    # React components organized by feature
  lib/           # Business logic, services, and utilities
    ai/          # AI provider abstraction (HuggingFace, Ollama)
    chat/        # RAG chat pipeline (analyze, embed, search, respond)
    collections/ # Astra DB collection CRUD
    ingest/      # Document and CSV ingestion with streaming
    validation/  # Zod schemas and request body parsing
    server/      # Logging, request limits
    hooks/       # Top-level React state management hooks
    playground/  # Client-side API wrapper functions
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for a detailed architectural overview.

## Code Style

- **Immutability**: Always create new objects, never mutate in place.
- **Small functions**: Keep functions under 50 lines where possible.
- **Small files**: Aim for 200-400 lines, 800 max.
- **Error handling**: Handle errors explicitly at every level.
- **Input validation**: All API routes validate input with Zod schemas.
- **TypeScript**: Use strict types; avoid `any`.

## Adding an API Route

Every API route follows the same pattern:

```typescript
import { requireApiAuth } from "@/lib/auth";
import { createRequestLogContext, logError, sanitizeErrorForClient, jsonError } from "@/lib/server/log";
import { parseJsonBody, isErrorResponse } from "@/lib/validation/parse";
import { yourSchema } from "@/lib/validation/schemas";

export async function POST(req: Request) {
  const authError = requireApiAuth(req);
  if (authError) return authError;

  const ctx = createRequestLogContext(req, "/api/your-route");
  const body = await parseJsonBody(req, yourSchema);
  if (isErrorResponse(body)) return body;

  try {
    // Business logic here
    return Response.json({ data: result });
  } catch (err) {
    logError(ctx, "your-route.failed", err);
    return jsonError(ctx, 500, sanitizeErrorForClient(err, "Operation failed"));
  }
}
```

## Reporting Issues

- Use [GitHub Issues](../../issues) for bug reports and feature requests.
- Include steps to reproduce, expected behavior, and actual behavior.
- For security vulnerabilities, see [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
