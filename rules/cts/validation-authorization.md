# Validation & Authorization

## Request Validation

All input must be validated before reaching business logic. Never validate in UseCases or Services.

### Manual bootstrap/registration step (validator-dependent)

Some validation libraries require a one-time registration call at process startup before any validator instance is constructed — e.g. `js-validator-livr`'s custom-rule registration. Check whichever validator your project uses for this requirement, and if it applies, call it exactly once in every process entrypoint (`main.ts`, CLI bootstrap, queue worker), before the first validator is constructed:

```typescript
// apps/api/src/main.ts (or any other process bootstrap)
import { registerCustomRules } from './validation-setup';

registerCustomRules(); // must be first — before app bootstrap or any service init
```

Omitting this call typically **passes build and tsc but throws (or silently no-ops) at runtime** on the first validation — a library-registration footgun, not a compile-time-checkable mistake.

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

**HTTP status contract:** authentication guards throw 401 (`UnauthorizedException` — "you are not signed in, re-authenticating may help"); authorization guards throw 403 (`ForbiddenException` — "you are signed in but not allowed here, re-authenticating will not help"). Mixing the two is a common semantic bug: an authorization denial that returns 401 sends the client on a futile re-auth loop, and some HTTP clients clear stored credentials on 401, logging the user out when they should just see a "not authorized" state.

### Multi-step / status-gated authorization (two-guard pattern)

Any flow with a post-authentication status gate (pending approval, email verification, onboarding) needs the session and the status check as two separate guards, not one combined check. A single guard that does `if (!user || user.status !== ACTIVE) throw UnauthorizedException()` forces an unwanted choice: either unapproved users get no session at all (they can't even see their own "pending" status), or a session grants full data access regardless of status (a hole).

The fix — split into two guards, applied in order:

1. **SessionGuard** (authentication only) — verifies the token, loads the user from the DB, populates `req.user`, **no status check**. Apply to any endpoint every authenticated user may reach (e.g. `GET /auth/me` / a "my status" endpoint).
2. **StatusGuard** (authorization) — checks `req.user.status === ACTIVE` (or your app's equivalent), throws 403 if not. Apply to every endpoint serving real data.

```typescript
// StatusGuard — authorization, enforces active status
@Injectable()
export class StatusGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: SessionUser }>();
    if (!req.user || req.user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException();
    }
    return true;
  }
}
```

```typescript
@Controller('data')
export class DataController {
  @Get()
  @UseGuards(SessionGuard, StatusGuard) // SessionGuard first, then StatusGuard
  public list(@CurrentUser() user: SessionUser) {
    /* ... */
  }
}
```

Re-loading the user from the DB on every request (rather than trusting a stale token claim) enables instant revocation: flipping `status` in the DB blocks the next request without a server-side token store. Declare your app's token-issuance policy explicitly (issued for all authenticated users regardless of status, vs. ACTIVE-only) — it determines whether pending/rejected users can even reach the SessionGuard-only endpoints.

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
