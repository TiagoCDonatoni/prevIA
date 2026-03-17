from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional
import time

@dataclass
class JobResult:
  ok: bool
  job_name: str
  elapsed_sec: float
  counters: Dict[str, Any]
  error: Optional[str] = None

def run_job(job_name: str, fn: Callable[..., Dict[str, Any]], **kwargs: Any) -> JobResult:
  t0 = time.time()
  try:
    counters = fn(**kwargs) or {}
    return JobResult(ok=True, job_name=job_name, elapsed_sec=round(time.time()-t0, 3), counters=counters)
  except Exception as e:
    return JobResult(ok=False, job_name=job_name, elapsed_sec=round(time.time()-t0, 3), counters={}, error=str(e))