FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install build dependencies, runtime libs, and clean up
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    curl \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    && pip install --upgrade pip \
    && pip install --no-cache-dir \
        wheel \
        setuptools \
    && rm -rf /var/lib/apt/lists/* /root/.cache/pip/*

COPY requirements.txt .
# torch first, from the CPU-only index: the default PyPI wheel drags in ~3 GB of
# NVIDIA CUDA packages that are useless here (and blow up the build disk).
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch \
    && pip install --no-cache-dir -r requirements.txt

# Remove build dependencies to reduce image size
RUN apt-get purge -y --auto-remove build-essential git

COPY api.py .

EXPOSE 7000

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "7000"]
