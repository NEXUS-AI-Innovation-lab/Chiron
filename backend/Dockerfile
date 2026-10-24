FROM python:3.9-slim

WORKDIR /app

# 1. Installation des dépendances système 
RUN apt-get update && apt-get install -y \
    libvips-dev \
    gcc \
    pkg-config \
    python3-dev \
    libc6-dev \
    libgl1 \
    libglib2.0-0 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 2. Installation des dépendances Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 3. Copie du code source
COPY . .

# 4. Démarrage
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8002"]