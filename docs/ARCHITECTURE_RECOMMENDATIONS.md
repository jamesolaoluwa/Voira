# File Upload Architecture Recommendations for LLM Context

## Current Architecture Analysis

### Current Flow:
1. **Frontend**: Upload file → `base44.integrations.Core.UploadFile`
2. **Frontend**: Extract text → `base44.integrations.Core.ExtractDataFromUploadedFile`
3. **Frontend**: Send extracted text (max 10,000 chars) → Backend `/analyze` endpoint
4. **Backend**: Truncate to 2000 chars → Include in LLM prompt

### Current Limitations:
- ❌ Images lose visual context (only text extracted)
- ❌ Hard truncation at 2000 chars loses important context
- ❌ Text extraction on frontend (less control, security concerns)
- ❌ No semantic understanding of large documents
- ❌ File URL not available for Vision API

---

## Recommended Architecture: Hybrid Approach

### Option 1: Enhanced Hybrid (Recommended - Immediate Implementation)

**Flow:**
1. **Frontend**: Upload file → Backend `/upload-reference` endpoint
2. **Backend**: 
   - Store file URL
   - Extract text (PDF/Word) OR prepare image for Vision API
   - Return `{ file_url, extracted_text, file_type, needs_vision }`
3. **Frontend**: Send both `reference_text` AND `reference_file_url` to `/analyze`
4. **Backend LLM**:
   - For text files: Use extracted text (with smart truncation)
   - For images: Use Vision API (GPT-4 Vision) to analyze image
   - For large docs: Use first 2000 chars + summary of rest

**Benefits:**
- ✅ Images get visual analysis via Vision API
- ✅ Better control over text extraction
- ✅ Can use both text and visual context
- ✅ Backend can optimize/process files
- ✅ More secure (files processed server-side)

**Implementation:**
- Add `/upload-reference` endpoint for file uploads
- Add `reference_file_url` and `reference_file_type` to request models
- Enhance LLM prompt to handle both text and image URLs
- Use GPT-4 Vision for images when `file_type` is image

---

### Option 2: OpenAI File API + Assistants API (Future Enhancement)

**Flow:**
1. **Frontend**: Upload file → Backend
2. **Backend**: Upload to OpenAI File API → Get `file_id`
3. **Backend**: Use Assistants API with file attachment
4. **LLM**: Processes file directly (handles all formats)

**Benefits:**
- ✅ OpenAI handles all file processing
- ✅ No manual text extraction needed
- ✅ Supports all OpenAI-supported formats
- ✅ Better for large documents

**Drawbacks:**
- ❌ More expensive (Assistants API pricing)
- ❌ Less control over processing
- ❌ Requires Assistants API setup

---

### Option 3: RAG (Retrieval-Augmented Generation) - For Large Documents

**Flow:**
1. **Backend**: Extract text → Chunk into segments
2. **Backend**: Create embeddings → Store in vector DB
3. **LLM Request**: 
   - Convert query to embedding
   - Retrieve relevant chunks via similarity search
   - Include top chunks in prompt

**Benefits:**
- ✅ Handles very large documents efficiently
- ✅ Semantic understanding of content
- ✅ Only relevant parts included in prompt

**Drawbacks:**
- ❌ More complex architecture
- ❌ Requires vector database (Pinecone, FAISS, etc.)
- ❌ Overkill for reference materials (usually small)

---

## Recommended Implementation Plan

### Phase 1: Immediate (Hybrid Enhancement)
1. ✅ Add `reference_file_url` and `reference_file_type` to request models
2. ✅ Create `/upload-reference` endpoint for file uploads
3. ✅ Enhance LLM prompt to handle image URLs with Vision API
4. ✅ Improve text truncation (smart chunking instead of hard cut)

### Phase 2: Short-term
1. Move text extraction to backend (more control)
2. Add summarization for large documents
3. Support multiple reference files

### Phase 3: Future (if needed)
1. Consider RAG for very large documents
2. Consider OpenAI File API for complex formats

---

## Code Changes Needed

### Backend (`apps/api/`):

1. **New endpoint**: `POST /upload-reference`
   - Accept file upload
   - Extract text (PDF/Word) or prepare image
   - Return file metadata

2. **Update models**: Add `reference_file_url` and `reference_file_type`

3. **Enhance LLM service**: 
   - Detect if reference is image → Use Vision API
   - Smart text truncation (keep beginning + end, summarize middle)
   - Combine text + visual context

### Frontend (`apps/web/src/`):

1. **Update file upload**: Send to backend instead of base44
2. **Update API calls**: Include `reference_file_url` in requests
3. **Handle both text and image references**

---

## Example: Enhanced LLM Prompt with Images

```python
# For images
if reference_file_type in ['image/jpeg', 'image/png', 'image/gif', 'image/webp']:
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Analyze this reference image for style and tone..."},
                {"type": "image_url", "image_url": {"url": reference_file_url}}
            ]
        }
    ]
    # Use gpt-4-vision-preview model

# For text documents
if reference_text:
    # Smart truncation: first 1000 chars + last 500 chars + summary of middle
    truncated = smart_truncate(reference_text, max_length=2000)
```

---

## Conclusion

**Current API is sufficient for basic use cases**, but **enhancing it with the hybrid approach** will:
- ✅ Better support images (Vision API)
- ✅ Better handle large documents (smart truncation)
- ✅ More secure (backend processing)
- ✅ More flexible (can use both text and visual context)

**Recommended**: Implement Phase 1 (Hybrid Enhancement) as it provides significant improvements with minimal complexity.

**Later Implementations:
- Deferred (Intentional) Follow-Ups — To Handle Later

- Folder-level access control (auth.uid() enforcement): Restrict users to uploading only within reference-files/{user_id}/ once user ownership and cleanup workflows are finalized.

- Read (SELECT) storage policy: Add only if private references are introduced or public access is removed; not needed while bucket is public.

- Signed URL flow: Replace public URLs with time-limited signed URLs if references become sensitive or paid-tier gated.

- File size limits in storage policy: Enforce stricter size limits at the storage layer once real-world usage patterns are known.

- MIME type enforcement in Supabase: Mirror backend file validation at the storage policy level for defense-in-depth.

- Virus / malware scanning: Add async scanning (e.g., Cloudflare Workers or third-party service) if user-uploaded files expand beyond PDFs/images.

- Reference file lifecycle management: Add auto-expiry or cleanup jobs for unused reference files to control storage cost.

- Per-user storage quotas: Introduce limits once pricing tiers or abuse patterns emerge.

- Audit logging for uploads: Track upload metadata (user_id, timestamp, file hash) if compliance or enterprise use is introduced.

- Encrypted private buckets: Move references to private, encrypted buckets if handling regulated or confidential data.

- Access revocation on account deletion: Ensure user reference files are deleted or orphaned files are cleaned up.