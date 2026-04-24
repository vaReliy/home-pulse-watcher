# Migrations & Queue Jobs

## Migration Conventions

- **Naming**: `create_posts_table`, `add_slug_to_posts`, `drop_legacy_field_from_users`
- Never modify existing migration files — always create a new one
- Every migration must be reversible

### Prisma (Primary)

```bash
# Modify prisma/schema.prisma, then:
docker compose exec app npx prisma migrate dev --name add_slug_to_posts
```

Prisma auto-generates the SQL migration file and updates the client.

### TypeORM (Alternative)

```typescript
import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddSlugToPosts1234567890 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn('posts', new TableColumn({
      name: 'slug',
      type: 'varchar',
      isUnique: true,
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('posts', 'slug');
  }
}
```

## Queue Jobs via BullMQ

Use BullMQ (Redis-backed) for async job processing. Define typed job data, a Queue for dispatching, and a Worker for processing.

```typescript
// types
interface ProcessPostAnalyticsData {
  postId: string; // pass IDs, not full objects
}

// worker (processor)
export const postAnalyticsWorker = new Worker<ProcessPostAnalyticsData>(
  'post-analytics',
  async (job) => {
    // must be idempotent
    await postAnalyticsRepository.upsert(
      { postId: job.data.postId },
      { processedAt: new Date() },
    );
  },
  {
    connection: redisConnection,
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 }, // 30s, 60s, 120s
  }
);

// dispatch (from a Service or UseCase — never from a route handler)
const postAnalyticsQueue = new Queue('post-analytics', { connection: redisConnection });
await postAnalyticsQueue.add('process', { postId: post.id });
await postAnalyticsQueue.add('process', { postId: post.id }, { delay: 5 * 60 * 1000 });
```

## Idempotency

Workers must produce the same result when run multiple times. Use upsert operations:

```typescript
await repository.upsert(
  { postId: job.data.postId },
  { processedAt: new Date() },
);
```

## Unique Jobs

Prevent duplicate jobs for the same resource:

```typescript
await queue.add('process', { postId: post.id }, {
  jobId: `post-analytics:${post.id}`, // deduplication key
});
```

## Dispatching Rules

- Dispatch from Services or UseCases only — never from route handlers
- Pass IDs, not full entity objects (avoid serialization issues)
- Never log PII in job data or error messages
