"""
InstanSeg REST API  –  single file
"""

import io
import time
import logging
from typing import Optional

import numpy as np
from PIL import Image
import torch
from instanseg import InstanSeg
import uvicorn

from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="InstanSeg API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)

# ── Model cache ───────────────────────────────────────────────────────────────

_cache: dict[str, InstanSeg] = {}

def _get_device() -> str:
    if torch.cuda.is_available():
        return "cuda"
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    return "cpu"

def _load(model_name: str) -> InstanSeg:
    if model_name not in _cache:
        logger.info("Loading model '%s' …", model_name)
        _cache[model_name] = InstanSeg(model_name, device=_get_device(), verbosity=1)
    return _cache[model_name]

# ── Schemas ───────────────────────────────────────────────────────────────────

class Instance(BaseModel):
    id: int
    area_px: int
    centroid_x: float
    centroid_y: float
    bbox: list[int]   # [y_min, x_min, y_max, x_max]

class SegmentResult(BaseModel):
    model: str
    target: str
    processing_time_s: float
    image_shape: list[int]
    instance_count: int
    instances: list[Instance]
    labeled_array: list[list[int]]


class Point(BaseModel):
    x: int
    y: int


class BlobPoints(BaseModel):
    color: str
    points: list[Point]

# ── Helpers ───────────────────────────────────────────────────────────────────

def _to_array(upload: bytes) -> np.ndarray:
    return np.array(Image.open(io.BytesIO(upload)))

def _prepare(arr: np.ndarray) -> np.ndarray:
    """Normalize and convert image to CHW float32 [0-1], with channel safety."""
    f = arr.astype(np.float32)

    if f.ndim == 2:
        # Grayscale HW -> 1HW
        out = f[np.newaxis]
    elif f.ndim == 3:
        channels = f.shape[2]
        if channels == 1:
            out = f.transpose(2, 0, 1)
        elif channels == 2:
            # Duplicate first channel to obtain a 3-channel tensor.
            f = np.repeat(f[:, :, :1], 3, axis=2)
            out = f.transpose(2, 0, 1)
        else:
            # Keep RGB and drop alpha/extra channels (e.g., RGBA -> RGB).
            out = f[:, :, :3].transpose(2, 0, 1)
    else:
        raise ValueError(f"Unsupported image shape: {arr.shape}")

    mn, mx = out.min(), out.max()
    if mx > mn:
        out = (out - mn) / (mx - mn)
    return out

def _instances(labeled: np.ndarray) -> list[Instance]:
    out = []
    for inst_id in np.unique(labeled):
        if inst_id == 0:
            continue
        mask = labeled == inst_id
        ys, xs = np.where(mask)
        out.append(Instance(
            id=int(inst_id),
            area_px=int(mask.sum()),
            centroid_x=round(float(xs.mean()), 2),
            centroid_y=round(float(ys.mean()), 2),
            bbox=[int(ys.min()), int(xs.min()), int(ys.max()) + 1, int(xs.max()) + 1],
        ))
    return out

def _colorize(labeled: np.ndarray) -> Image.Image:
    if labeled.ndim != 2:
        raise ValueError(f"Expected 2D labeled array, got shape {labeled.shape}")
    rng = np.random.default_rng(42)
    n = int(labeled.max())
    palette = np.zeros((n + 1, 3), dtype=np.uint8)
    if n:
        palette[1:] = rng.integers(60, 256, (n, 3), dtype=np.uint8)
    return Image.fromarray(palette[labeled], "RGB")


def _palette_for_labels(max_label: int) -> np.ndarray:
    rng = np.random.default_rng(42)
    palette = np.zeros((max_label + 1, 3), dtype=np.uint8)
    if max_label:
        palette[1:] = rng.integers(60, 256, (max_label, 3), dtype=np.uint8)
    return palette


def _to_hex_color(rgb: np.ndarray) -> str:
    return f"#{int(rgb[0]):02x}{int(rgb[1]):02x}{int(rgb[2]):02x}"


def _contour_points(mask: np.ndarray) -> np.ndarray:
    # Keep only border pixels by removing pixels fully surrounded in 8-neighborhood.
    padded = np.pad(mask, 1, mode="constant", constant_values=False)
    core = padded[1:-1, 1:-1]
    interior = core.copy()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx == 0 and dy == 0:
                continue
            interior &= padded[1 + dy:1 + dy + core.shape[0], 1 + dx:1 + dx + core.shape[1]]
    border = core & ~interior
    ys, xs = np.where(border)
    if xs.size == 0:
        ys, xs = np.where(mask)
    if xs.size == 0:
        return np.empty((0, 2), dtype=np.int32)

    # Simple angular ordering around centroid gives a compact polygon-like chain.
    cx = float(xs.mean())
    cy = float(ys.mean())
    angles = np.arctan2(ys - cy, xs - cx)
    order = np.argsort(angles)
    return np.column_stack((xs[order], ys[order])).astype(np.int32)


def _blobs_to_points(labeled: np.ndarray, mode: str) -> list[BlobPoints]:
    max_label = int(labeled.max())
    palette = _palette_for_labels(max_label)
    out: list[BlobPoints] = []

    for inst_id in np.unique(labeled):
        if inst_id == 0:
            continue
        mask = labeled == inst_id
        if mode == "pixel":
            ys, xs = np.where(mask)
            coords = np.column_stack((xs, ys))
        else:
            coords = _contour_points(mask)

        points = [Point(x=int(x), y=int(y)) for x, y in coords]
        out.append(
            BlobPoints(
                color=_to_hex_color(palette[int(inst_id)]),
                points=points,
            )
        )
    return out


def _to_label_2d(labeled_out: np.ndarray) -> np.ndarray:
    # InstanSeg can return shapes like (H,W), (1,H,W), or (1,1,H,W).
    arr = np.asarray(labeled_out)
    arr = np.squeeze(arr)
    if arr.ndim == 2:
        return arr.astype(np.int32)
    if arr.ndim == 3:
        return arr[0].astype(np.int32)
    raise ValueError(f"Unsupported model output shape: {arr.shape}")

def _run(image_array, model_name, target, pixel_size) -> tuple[np.ndarray, float]:
    model = _load(model_name)
    img = _prepare(image_array)
    kw = dict(target=target)
    if pixel_size:
        kw["pixel_size"] = pixel_size
    t0 = time.perf_counter()
    try:
        labeled_out, _ = model.eval_small_image(img, **kw)
    except RuntimeError as e:
        msg = str(e)
        if "to have 3 channels, but got" in msg:
            raise ValueError(
                "Image has an unsupported channel layout. Please send grayscale or RGB image."
            ) from e
        raise
    elapsed = time.perf_counter() - t0
    if isinstance(labeled_out, torch.Tensor):
        labeled_out = labeled_out.cpu().numpy()
    labeled_2d = _to_label_2d(labeled_out)
    return labeled_2d, elapsed

# ── Routes ────────────────────────────────────────────────────────────────────

MODELS = ["brightfield_nuclei", "fluorescence_nuclei_and_cells"]
TARGETS = ["nuclei", "cells", "all_outputs"]

@app.get("/health")
def health():
    return {"status": "ok", "device": _get_device(), "loaded_models": list(_cache)}


@app.post("/segment", response_model=SegmentResult)
async def segment(
    file: UploadFile = File(...),
    model: str = Query("brightfield_nuclei", enum=MODELS),
    target: str = Query("nuclei", enum=TARGETS),
    pixel_size: Optional[float] = Query(None),
):
    try:
        arr = _to_array(await file.read())
        labeled, elapsed = _run(arr, model, target, pixel_size)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    instances = _instances(labeled)
    return SegmentResult(
        model=model, target=target,
        processing_time_s=round(elapsed, 3),
        image_shape=list(arr.shape),
        instance_count=len(instances),
        instances=instances,
        labeled_array=labeled.tolist(),
    )


@app.post("/segment/mask")
async def segment_mask(
    file: UploadFile = File(...),
    model: str = Query("brightfield_nuclei", enum=MODELS),
    target: str = Query("nuclei", enum=TARGETS),
    pixel_size: Optional[float] = Query(None),
    colorize: bool = Query(True),
):
    """Returns a PNG mask – colorized or raw 16-bit label IDs."""
    try:
        arr = _to_array(await file.read())
        labeled, _ = _run(arr, model, target, pixel_size)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    if colorize:
        img = _colorize(labeled)
    else:
        img = Image.fromarray(np.clip(labeled, 0, 65535).astype(np.uint16), "I;16")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(
        buf, media_type="image/png",
        headers={"X-Instance-Count": str(int(labeled.max()))},
    )


@app.post("/segment/points", response_model=list[BlobPoints])
async def segment_points(
    file: UploadFile = File(...),
    model: str = Query("brightfield_nuclei", enum=MODELS),
    target: str = Query("nuclei", enum=TARGETS),
    pixel_size: Optional[float] = Query(None),
    mode: str = Query("polygon", enum=["pixel", "polygon", "pylgone"]),
):
    """Returns blobs as JSON with either all pixels or contour points only."""
    selected_mode = "polygon" if mode == "pylgone" else mode
    try:
        arr = _to_array(await file.read())
        labeled, _ = _run(arr, model, target, pixel_size)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return _blobs_to_points(labeled, selected_mode)


if __name__ == "__main__":
    uvicorn.run("api:app", host="0.0.0.0", port=7000, reload=True)
