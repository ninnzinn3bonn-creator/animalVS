FROM python:3.11-slim

ARG REMBG_MODEL=birefnet-portrait

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    REMBG_MODEL=${REMBG_MODEL} \
    ALLOW_SEGMENTATION_FALLBACK=false

WORKDIR /app

COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt \
    && python -c "from rembg import new_session; new_session('${REMBG_MODEL}')"

COPY app.py contour.py processor.py segmentation.py ./

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=3)"

CMD ["python", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
