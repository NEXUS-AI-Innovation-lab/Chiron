"""
Client pour communiquer avec le service InstanSeg
"""

import httpx
from typing import Optional, List, Dict, Any
from pydantic import BaseModel

class Instance(BaseModel):
    id: int
    area_px: int
    centroid_x: float
    centroid_y: float
    bbox: List[int]

class SegmentResult(BaseModel):
    model: str
    target: str
    processing_time_s: float
    image_shape: List[int]
    instance_count: int
    instances: List[Instance]
    labeled_array: List[List[int]]

class Point(BaseModel):
    x: int
    y: int

class BlobPoints(BaseModel):
    color: str
    points: List[Point]


class InstanSegClient:
    """Client pour l'API InstanSeg"""
    
    def __init__(self, base_url: str = "http://instanseg:7000"):
        self.base_url = base_url
        self.client = httpx.AsyncClient(base_url=base_url, timeout=300.0)
    
    async def health(self) -> Dict[str, Any]:
        """Vérifie la santé du service InstanSeg"""
        response = await self.client.get("/health")
        response.raise_for_status()
        return response.json()
    
    async def segment(
        self,
        file_bytes: bytes,
        model: str = "brightfield_nuclei",
        target: str = "nuclei",
        pixel_size: Optional[float] = None,
    ) -> SegmentResult:
        """Segmente une image avec InstanSeg"""
        files = {"file": ("image.png", file_bytes, "image/png")}
        params = {"model": model, "target": target}
        if pixel_size is not None:
            params["pixel_size"] = pixel_size
        
        response = await self.client.post("/segment", files=files, params=params)
        response.raise_for_status()
        data = response.json()
        return SegmentResult(**data)
    
    async def segment_points(
        self,
        file_bytes: bytes,
        model: str = "brightfield_nuclei",
        target: str = "nuclei",
        pixel_size: Optional[float] = None,
        mode: str = "polygon",
    ) -> List[BlobPoints]:
        """Obtient les points de contour des instances segmentées"""
        files = {"file": ("image.png", file_bytes, "image/png")}
        params = {
            "model": model,
            "target": target,
            "mode": mode,
        }
        if pixel_size is not None:
            params["pixel_size"] = pixel_size
        
        response = await self.client.post("/segment/points", files=files, params=params)
        response.raise_for_status()
        data = response.json()
        return [BlobPoints(**item) for item in data]
    
    async def close(self):
        """Ferme la connexion de manière appropriée"""
        await self.client.aclose()
