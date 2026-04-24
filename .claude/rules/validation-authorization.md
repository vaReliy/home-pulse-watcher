# Validation & Authorization

## Request Validation

All input must be validated before reaching business logic. Never validate in UseCases or Services.

### js-validator-livr (Primary Choice)

```typescript
import LIVR from 'livr';

const validator = new LIVR.Validator({
  title: ['required', { max_length: 255 }],
  description: ['required', { max_length: 5000 }],
  status: ['required', { one_of: ['draft', 'published'] }],
});

const validData = validator.validate(input);
if (!validData) {
  throw new ValidationError(validator.getErrors());
}
```

### Zod (Alternative)

```typescript
import { z } from 'zod';

const CreatePostSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().min(1).max(5000),
});

const result = CreatePostSchema.safeParse(input);
if (!result.success) {
  throw new ValidationError(result.error.flatten().fieldErrors);
}
```

### class-validator (Alternative — NestJS style)

```typescript
import { IsString, MaxLength, IsNotEmpty } from 'class-validator';

export class CreatePostDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  title!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(5000)
  description!: string;
}
```

## Authorization

Use middleware guards or a CASL-based RBAC service. Never perform auth checks in UseCases.

### Guard Middleware Pattern

```typescript
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user?.roles.includes(role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}
```

### CASL Ability Check (in UseCase)

```typescript
export class UpdatePostUseCase {
  async execute(user: User, postId: string, dto: UpdatePostDto): Promise<Post> {
    const post = await this.postRepository.findById(postId);
    if (!post) throw new NotFoundError('Post');

    const ability = defineAbilityFor(user);
    if (!ability.can('update', post)) {
      throw new ForbiddenError('Cannot update this post');
    }

    // proceed with update
  }
}
```

## Validation Error Flow

Validation middleware catches invalid input → returns HTTP 422 with structured field errors:

```json
{
  "error": "Validation failed",
  "fields": {
    "title": "required",
    "description": "max_length"
  }
}
```

Frontend consumes this error object and maps field errors to form inputs.
