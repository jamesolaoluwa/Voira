# Dockerfile for FastAPI backend
# Build: docker build -t voira-api -f infra/Dockerfile .
# Run: docker run -p 8000:8000 --env-file .env voira-api

FROM python:3.11-slim-bookworm

WORKDIR /app

RUN addgroup --system voira && adduser --system --ingroup voira voira

COPY apps/api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/api/ .

RUN chown -R voira:voira /app

USER voira

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')" || exit 1

CMD ["gunicorn", "main:app", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000"]
