# Phase 2 Implementation Plan

**Start Date**: March 27, 2026  
**Target Completion**: March 31, 2026  
**Branch**: phase2/production-improvements

---

## Tasks to Complete (In Order)

### Task #6: Request Size Limits Validation (2 hours)
- [ ] Add middleware in `apps/api/middleware.py`
- [ ] Test with curl commands
- [ ] Verify 413 response for oversized requests

### Task #7: Rate Limit Configuration for Scale (4 hours)
- [ ] Migrate to Redis in `apps/api/rate_limit.py`
- [ ] Add per-endpoint customization
- [ ] Implement graceful fallback
- [ ] Test with load testing

### Task #8: Database Connection Pooling (3 hours)
- [ ] Configure pool size in `apps/api/db.py`
- [ ] Test with concurrent connections
- [ ] Add monitoring to Sentry

### Task #9: Transcription Provider Fallback (6 hours)
- [ ] Implement OpenAI fallback in `apps/api/transcription.py`
- [ ] Update provider logic
- [ ] Add Sentry logging for switches
- [ ] Cost monitoring setup

### Task #10: Admin Action Audit Trail (4 hours)
- [ ] Create audit logging function in `apps/api/admin.py`
- [ ] Add before/after state capture
- [ ] Add IP address and user agent logging
- [ ] Create query endpoints for audit logs

---

## Execution Strategy

1. Create feature branch `phase2/production-improvements`
2. Implement tasks sequentially (#6, #7, #8, #9, #10)
3. Test each independently
4. Create combined test suite
5. Single commit with all changes for clean history

