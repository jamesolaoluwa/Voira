# LLM Prompt Caching Infrastructure

## 1. Overview

LLM refinement operations in Voira are token-intensive. Each refinement request sends a system prompt (containing instructions, context, and voice profile guidance) plus user input (transcript, questions, goals) to OpenAI's API. The system prompt can be hundreds of tokens, and while user input varies per request, the system prompt components are largely static.

### The Problem

- **Token costs**: Every API call includes the full system prompt, even when it hasn't changed
- **Latency**: Building prompts from scratch on every request adds processing overhead
- **Scalability**: As traffic grows, redundant token usage compounds costs

### The Solution: Block-Level Caching

Voira caches at the **prompt block** level rather than entire prompts. This allows:

- **Cost predictability**: Cached blocks are reused across requests, reducing token costs
- **Personalization**: User-specific blocks (voice profiles) are cached separately from shared blocks
- **Scalability**: Shared blocks (base prompt, session context) benefit all users
- **Observability**: Cache metrics provide visibility into reuse rates and Redis health

### Why Not Cache Entire Prompts?

Caching entire prompts would require invalidating the entire cache when any component changes. Block-level caching provides:

- **Granular invalidation**: Only the changed block needs cache refresh
- **Better reuse**: Shared blocks (base prompt, session context) are reused across all users
- **Version control**: Each block can be versioned independently

---

## 2. Prompt Architecture

Prompts are assembled from distinct, modular blocks:

1. **BASE_SYSTEM_PROMPT** - Core refinement instructions (shared across all session types)
2. **SESSION_CONTEXT_PROMPT** - Session-specific context (free, application, interview, practice, refine)
3. **VOICE_PROFILE_BLOCK** - User-specific voice guidance (optional, cached per user per version)
4. **User input** - Transcript, question, goal, reference text (never cached)

### Cacheable Blocks

- **BASE_SYSTEM_PROMPT**: `sys_base:v1` - Shared, versioned
- **SESSION_CONTEXT_PROMPT**: `sys_ctx:{session_type}:{variant}:v1` - Variant-aware (default, with_context, with_research)
- **VOICE_PROFILE_BLOCK**: `sys_voice:{user_id}:v{voice_profile.version}` - User-specific, versioned

### Non-Cacheable Components

- User input (transcript, question, goal, reference text)
- Dynamic context (company names, user-provided context strings)
- Feature-specific instructions (included in user message, not system prompt)

### Prompt Assembly Order

The system prompt is assembled as follows:

1. Base system prompt (cached: `sys_base:v1`)
2. Session context prompt (cached: `sys_ctx:{session_type}:{variant}:v1`)
3. Voice profile block (if available, cached: `sys_voice:{user_id}:v{version}`)
4. Blocks are joined with `\n\n` separator
5. User input is sent in a separate user message (not cached)

This separation ensures:
- **Personalization**: Voice profiles are isolated and cached per user
- **Safety**: User input is never cached, preventing data leakage
- **Determinism**: Versioned cache keys ensure correctness across deployments

---

## 3. Cache Layers

Voira implements a two-layer caching strategy with automatic fallback:

### In-Memory Cache

- **Scope**: Per-process dictionary (`_PROMPT_BLOCK_CACHE`)
- **Performance**: Fast, zero network latency
- **Usage**: Primary cache in DEV, fallback in production
- **Limits**: Soft maximum size of 128 entries
- **Eviction**: Entire cache cleared deterministically when size limit exceeded (prevents partial-eviction bugs)
- **Persistence**: Lost on process restart

### Redis Cache

- **Scope**: Shared across all processes/instances
- **Performance**: Network latency, but persistent
- **Usage**: Opt-in via `ENABLE_REDIS_PROMPT_CACHE` feature flag (default: disabled)
- **TTL**: 1 hour (for memory safety and automatic cleanup, not correctness)
- **Persistence**: Survives process restarts
- **Configuration**: Uses `REDIS_URL` environment variable (default: `redis://localhost:6379/0`)

### Cache Priority

The system attempts caches in this order:

```
Redis (if enabled) → In-memory → Build fresh
```

**Behavior:**
1. If `ENABLE_REDIS_PROMPT_CACHE=true` and Redis client is available, try Redis first
2. If Redis miss or unavailable, fall back to in-memory cache
3. If in-memory miss, build the block fresh and store in both caches (if enabled)
4. Redis errors trigger fallback to in-memory (tracked via `redis_bypass` metric)

This ensures:
- **Availability**: System works even if Redis is down
- **Performance**: In-memory cache provides fast fallback
- **Correctness**: Cache misses build fresh blocks (no stale data risk)

---

## 4. Cache Keys & Invalidation

Cache keys are deterministic and versioned to ensure correctness without relying on TTL expiry.

### Cache Key Formats

- **`sys_base:v1`**: Base system prompt
  - Shared across all requests
  - Version (`v1`) must be incremented if base prompt changes

- **`sys_ctx:{session_type}:{variant}:v1`**: Session context prompt
  - `session_type`: `free`, `application`, `interview`, `practice`, `refine`
  - `variant`: `default`, `with_context`, `with_research` (for interview sessions)
  - Version (`v1`) must be incremented if session context changes

- **`sys_voice:{user_id}:v{voice_profile.version}`**: Voice profile block
  - `user_id`: User identifier
  - `voice_profile.version`: Version from voice profile record (must be updated when profile changes)
  - User-specific, so each user has separate cache entries

### Version-Based Invalidation

**Correctness relies on versioned cache keys, not TTL expiry.**

When a prompt block changes:
1. Increment the version in the cache key (e.g., `v1` → `v2`)
2. Old cached entries remain but are never used (keys don't match)
3. New entries are built and cached with the new key
4. Old entries expire naturally via TTL (memory safety only)

This ensures:
- **Deterministic behavior**: Same version always produces same prompt
- **Zero stale data risk**: Version mismatch prevents using outdated blocks
- **Safe rollbacks**: Old versions remain cacheable if needed

### Session Variants

Interview sessions support three variants to ensure correct cache key isolation:

- **`default`**: No user context or company research
- **`with_context`**: User-provided company/role context
- **`with_research`**: Company name provided (triggers LLM research)

Variants are determined by `get_session_context_variant()`:
- Non-interview sessions: Always `default`
- Interview sessions: `with_context` if `user_context` provided, else `with_research` if `company_name` provided, else `default`

This prevents incorrect cache reuse (e.g., using a cached prompt from a research variant when user context is provided).

---

## 5. Redis Configuration

Redis caching is controlled via environment variables and feature flags.

### Environment Variables

- **`ENABLE_REDIS_PROMPT_CACHE`**: Set to `"true"` to enable Redis caching (default: disabled)
- **`REDIS_URL`**: Redis connection URL (default: `redis://localhost:6379/0`)

### Configuration Constants

- **`REDIS_PROMPT_CACHE_TTL_SECONDS`**: 3600 seconds (1 hour)

### TTL Intent

**TTL exists for memory safety and automatic cleanup. Prompt correctness relies on versioned cache keys, not TTL expiry.**

The 1-hour TTL:
- Prevents unbounded Redis memory growth
- Provides automatic cleanup of stale entries
- Does NOT control cache correctness (versioned keys do)

If a prompt block changes, the version in the cache key must be incremented. TTL expiry is a safety mechanism, not an invalidation strategy.

### String Encoding

**`decode_responses=True` is required** in Redis client initialization.

This ensures cached prompt blocks are returned as strings, preventing downstream prompt assembly errors. Without this setting, Redis returns bytes, which would break string concatenation during prompt assembly.

---

## 6. Metrics & Observability (DEV)

Cache metrics are DEV-only and not exposed in production. They provide visibility into cache performance and Redis health.

### Metrics Dictionary

`_PROMPT_CACHE_METRICS` tracks:

- **`hits`**: Number of cache hits (block retrieved from cache)
- **`misses`**: Number of cache misses (block built fresh)
- **`sets`**: Number of cache sets (blocks stored in cache)
- **`redis_bypass`**: Number of Redis bypass events (Redis enabled but unavailable or error)

### Accessing Metrics

Metrics are available via `get_prompt_cache_metrics()` (DEV use only):

```python
{
    "enabled": bool,        # Whether caching is enabled
    "entries": int,         # Number of entries in in-memory cache
    "hits": int,            # Cache hits
    "misses": int,          # Cache misses
    "sets": int,            # Cache sets
    "redis_bypass": int     # Redis bypass events
}
```

### Interpreting Metrics

- **High hit rate**: Indicates effective cache reuse
- **High `redis_bypass`**: Indicates Redis availability issues (client unavailable or errors)
- **Low hit rate**: May indicate cache key churn or version updates

### Why DEV-Only?

Metrics are in-memory counters that reset on process restart. They're designed for development observability, not production monitoring. Production monitoring would require:
- Metrics export (e.g., Prometheus)
- Persistent storage
- Aggregation across instances

These are not currently implemented.

---

## 7. OpenAI Native Prompt Caching (Explicit Evaluation)

OpenAI's API includes native prompt caching that automatically caches identical prompts across requests. This is automatic and not directly controllable by the application.

### What OpenAI Caching Does

OpenAI may cache identical system prompts and reuse them across API calls, potentially reducing input token costs. This caching is:
- Automatic (no configuration required)
- Opportunistic (not guaranteed)
- Invisible (no metrics exposed)
- Short-lived (not persistent across API versions)

### Why Voira Does NOT Rely on OpenAI Caching

**Redis caching is the contract; OpenAI caching is opportunistic.**

Voira implements Redis-backed caching because:

1. **Controllability**: Redis caching is explicit and controllable (feature flags, versioning, observability)
2. **Predictability**: Cache keys are deterministic, versioned, and observable
3. **Correctness**: Versioned keys ensure correctness; OpenAI caching is a black box
4. **Cost Control**: Redis caching provides measurable token savings; OpenAI caching is invisible
5. **Personalization**: Voice profiles require user-specific caching (OpenAI caching is global)

### Treatment of OpenAI Caching

OpenAI's native caching may provide additional token savings, but it is treated as a **bonus**, not a requirement. The system is designed to:
- Work correctly even if OpenAI caching is disabled or unavailable
- Provide cost savings via Redis caching regardless of OpenAI behavior
- Not depend on OpenAI caching for correctness or cost control

If OpenAI exposes caching metrics in the future, they can be used for observability, but Redis caching remains the primary mechanism.

---

## 8. Safety & Rollback

The caching system is designed for safe operation and easy rollback.

### Feature Flags

- **`ENABLE_PROMPT_CACHING`**: Controlled by `ENV` environment variable
  - `ENV=dev`: Caching enabled
  - `ENV=prod` (or unset): Caching disabled
  - Defaults to disabled (safe)

- **`ENABLE_REDIS_PROMPT_CACHE`**: Opt-in Redis caching
  - Set to `"true"` to enable
  - Defaults to disabled (safe)

### Disabling Caching

Caching can be disabled safely:

1. **Disable prompt caching entirely**: Set `ENV` to `prod` (or unset)
   - All blocks are built fresh (no caching)
   - No behavior change (prompts are identical)

2. **Disable Redis caching**: Unset `ENABLE_REDIS_PROMPT_CACHE` or set to `"false"`
   - Falls back to in-memory cache (if `ENV=dev`)
   - Or builds fresh (if `ENV=prod`)

3. **Redis unavailable**: System automatically falls back to in-memory cache
   - No errors or exceptions
   - Behavior identical (prompts are identical)

### Guaranteed Fallback Behavior

The system guarantees:
- **No exceptions**: Cache failures never raise exceptions
- **Identical prompts**: Cached vs. non-cached prompts are identical
- **Graceful degradation**: Redis → in-memory → build fresh

This ensures:
- Production safety: Caching issues never break requests
- Rollback safety: Disabling caching has zero impact on correctness
- Observability: `redis_bypass` metric tracks fallback events

---

## 9. Future Improvements

The following improvements are **not currently implemented** but may be considered:

### Redis Eviction Strategies

- LRU (Least Recently Used) eviction instead of full cache clear
- Per-block TTL tuning (different TTLs for different block types)
- Cache warming strategies (pre-populate cache on startup)

### Metrics Export

- Prometheus metrics endpoint
- Persistent metrics storage
- Aggregation across instances
- Alerting on cache hit rates or Redis availability

### OpenAI Caching Observability

- Track OpenAI API response headers for cache indicators (if exposed)
- Monitor token usage to infer cache effectiveness
- Compare Redis cache hit rates with OpenAI token savings

### Additional Cache Layers

- CDN-level caching for base prompts (if applicable)
- Database-backed caching for voice profiles (persistent across deployments)

---

## Summary

Voira's LLM prompt caching infrastructure provides:

- **Block-level caching**: Granular, reusable cache entries
- **Two-layer strategy**: Redis (shared, persistent) and in-memory (fast, fallback)
- **Versioned keys**: Deterministic invalidation without TTL dependency
- **Safe operation**: Feature flags, graceful fallback, zero breaking changes
- **DEV observability**: Metrics for development, not production

The system is designed to reduce token costs and improve latency while maintaining correctness and safety. Redis caching is the primary mechanism; OpenAI's native caching is treated as opportunistic.
