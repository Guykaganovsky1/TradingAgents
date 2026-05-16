FROM python:3.12-slim

WORKDIR /app

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy tradingagents package (required by the backend)
COPY tradingagents/ /app/tradingagents/
COPY cli/ /app/cli/

# Copy backend
COPY dashboard/backend/ /app/dashboard/backend/

WORKDIR /app/dashboard/backend

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Create data dir
RUN mkdir -p /app/dashboard/backend/data

EXPOSE 8787

# Add project root to PYTHONPATH so tradingagents is importable
ENV PYTHONPATH="/app"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8787"]
