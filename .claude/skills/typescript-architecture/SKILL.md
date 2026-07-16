---
name: typescript-architecture
description: >-
  Clean Architecture patterns for Node.js/TypeScript. Use when designing UseCase/Service/Repository layers, domain organization, dependency injection, or making architecture decisions for Node.js backends.
  
  Українською: архітектура Node.js, чиста архітектура, UseCase, сервіс, репозиторій, шари архітектури, ін'єкція залежностей, доменна логіка.


triggers:
  - Clean Architecture
  - UseCase
  - Service layer
  - Repository pattern
  - Node.js architecture
  - TypeScript architecture
  - dependency injection
  - domain layer
---

# TypeScript Clean Architecture

## Layer Stack

```
Route Handler / Controller
  ↓  validates input (js-validator-livr / Zod / class-validator)
  ↓  calls UseCase
UseCase / Handler
  ↓  orchestrates business logic
  ↓  calls Services + Repositories
Service
  ↓  pure domain logic, no I/O
Repository Interface → ORM Implementation (Prisma / TypeORM / Drizzle)
```

Each layer depends only on the layer below. No skipping.

## UseCase Pattern

```typescript
// src/use-cases/create-post/create-post.usecase.ts
export class CreatePostUseCase {
  constructor(
    private readonly postRepository: IPostRepository,
    private readonly slugService: SlugService,
    private readonly eventBus: IEventBus,
  ) {}

  async execute(dto: CreatePostDto): Promise<Post> {
    const slug = this.slugService.generate(dto.title);

    if (await this.postRepository.existsBySlug(slug)) {
      throw new ConflictError('Slug already exists');
    }

    const post = new Post({ ...dto, slug });
    await this.postRepository.save(post);
    await this.eventBus.emit(new PostCreatedEvent(post));
    return post;
  }
}
```

## Service Pattern

```typescript
// src/services/slug.service.ts
export class SlugService {
  generate(title: string): string {
    return title
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }
}
```

Services are pure domain logic — no database or HTTP calls.

## Repository Pattern

```typescript
// Interface (in domain layer)
export interface IPostRepository {
  findById(id: string): Promise<Post | null>;
  save(post: Post): Promise<void>;
  existsBySlug(slug: string): Promise<boolean>;
}

// Implementation (in infrastructure layer)
export class PrismaPostRepository implements IPostRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Post | null> {
    const row = await this.prisma.post.findUnique({ where: { id } });
    return row ? PostMapper.toDomain(row) : null;
  }
}
```

## Thin Controller

```typescript
// src/controllers/post.controller.ts
export async function createPost(req: Request, res: Response) {
  const validData = validateCreatePost(req.body); // throws ValidationError if invalid
  const post = await createPostUseCase.execute(validData);
  return res.status(201).json(PostMapper.toResponse(post));
}
```

## Dependency Injection

Constructor injection (works with NestJS, tsyringe, inversify, or manual wiring):

```typescript
// Manual wiring (no framework)
const postRepository = new PrismaPostRepository(prisma);
const slugService = new SlugService();
const createPostUseCase = new CreatePostUseCase(postRepository, slugService, eventBus);
```

## Directory Structure

```
src/
├── controllers/        # Thin route handlers — validate, call UseCase, respond
├── use-cases/          # One UseCase per user action
│   └── create-post/
│       ├── create-post.usecase.ts
│       └── create-post.dto.ts
├── services/           # Pure domain logic (no I/O)
├── repositories/       # Interfaces + ORM implementations
├── entities/           # Domain entities
├── guards/             # Auth/authorization middleware
├── queues/             # BullMQ workers and processors
└── shared/
    ├── errors/         # Custom error class hierarchy
    └── events/         # Domain events
```

## When to Use Which Pattern

| Need                           | Pattern              |
| ------------------------------ | -------------------- |
| HTTP endpoint + business logic | Controller → UseCase |
| Reusable domain computation    | Service              |
| Data access                    | Repository           |
| Async/background work          | BullMQ Worker        |
| Cross-cutting auth check       | Guard middleware     |
| Domain events / side effects   | Event Bus            |
