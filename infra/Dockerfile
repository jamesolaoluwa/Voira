# Dockerfile for FastAPI backend
# Build: docker build -t voira-api -f infra/Dockerfile .
# Run: docker run -p 8000:8000 --env-file .env voira-api

FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY apps/api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY apps/api/ .

# Expose port
EXPOSE 8000

# Run with Gunicorn
CMD ["gunicorn", "main:app", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000"]

