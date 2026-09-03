"""
boundary_test/python_producer.py

Runs formation.py once, builds a BOUNDARY_CONTRACT-conforming envelope
from the resulting FormationEngine state, and writes it to disk as JSON.

The envelope shape matches BOUNDARY_CONTRACT.md (v1.0.0) exactly:

  {
    "formation": { seed, tick, equation: { index, lam, omega, K, threshold, delta } },
    "operation": <string>,
    "input": <any>,
    "observation": { valid, residual, constraints }
  }

This script does NOT interpret, validate, or transform the data
beyond serializing it. The JS consumer is responsible for that.

Usage:
  python3 boundary_test/python_producer.py <output.json> [seed]
"""

import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
# FORMATION_DIR is the directory that contains formation.py. The default
# points at the PAC_CODE clone that holds the validated formation source.
# Override with the FORMATION_DIR environment variable to point at a
# different location.
FORMATION_DIR = Path(os.environ.get("FORMATION_DIR", REPO_ROOT / "TET_GOD_OF_PLAY"))
sys.path.insert(0, str(FORMATION_DIR))

import formation  # noqa: E402


def build_envelope(seed: int) -> dict:
    """
    Construct a FormationEngine, run a single tick, and serialize the
    envelope exactly as the contract specifies.

    Notes:
      - We use the public API only (no internal state access).
      - `input` is left as an empty object for now; the contract
        permits it to be opaque.
      - `operation` is taken from the FormationTrigger result, which
        is what `step()` returns.
    """
    engine = formation.FormationEngine(seed=seed)
    trigger_result = engine.step()

    operation = trigger_result.get("operation") if isinstance(trigger_result, dict) else None
    valid_flag = trigger_result.get("valid") if isinstance(trigger_result, dict) else None

    es = engine.current_equation
    envelope = {
        "formation": {
            "seed": int(engine.seed),
            "tick": int(engine.tick_count),
            "equation": {
                "index": int(es.index),
                "lam": float(es.lam),
                "omega": [float(es.omega[0]), float(es.omega[1])],
                "K": float(es.K),
                "threshold": float(es.threshold),
                "delta": float(es.delta),
            },
        },
        "operation": operation,
        "input": {},
        "observation": {
            "valid": bool(valid_flag) if valid_flag is not None else False,
            "residual": float(getattr(engine.last_observation, "residual", 0.0) or 0.0),
            "constraints": dict(engine.constraints or {}),
        },
    }
    return envelope


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: python_producer.py <output.json> [seed]", file=sys.stderr)
        return 2

    out_path = Path(sys.argv[1])
    seed = int(sys.argv[2]) if len(sys.argv) > 2 else 12345

    envelope = build_envelope(seed)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w") as f:
        json.dump(envelope, f, indent=2, sort_keys=True)
        f.write("\n")

    print(f"wrote {out_path} ({out_path.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())