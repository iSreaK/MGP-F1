"""Optional QA: compare the FIA diagram against a clean 2025 OpenF1 race lap.

Usage: python scripts/singapore/compare-openf1.py
The ignored raw file is produced by scripts/singapore-replay/fetch-openf1.mjs.
OpenF1 location x/y values are in approximately decimetre-sized units.  This
comparison fits translation, rotation, uniform scale and cyclic lap origin;
it never uses OpenF1 data to silently alter the official-map geometry.
"""

import argparse
import ast
import json
from pathlib import Path
import subprocess

import numpy as np


ROOT = Path(__file__).resolve().parents[2]
LOCATION = ROOT / "scripts/singapore-replay/raw/location_1.json"
TRACK = ROOT / "dist/singapore/track-data.js"
LAP_START = "2025-10-05T12:05:17"
LAP_END = "2025-10-05T12:06:57"
SAMPLES = 300


def resample_closed(points: np.ndarray, count: int) -> np.ndarray:
    points = np.concatenate([points, points[:1]], axis=0)
    distances = np.linalg.norm(np.diff(points, axis=0), axis=1)
    cumulative = np.concatenate([[0.0], np.cumsum(distances)])
    target = np.linspace(0, cumulative[-1], count, endpoint=False)
    return np.stack(
        [np.interp(target, cumulative, points[:, axis]) for axis in range(2)],
        axis=1,
    )


def fit_rigid(source: np.ndarray, target: np.ndarray) -> tuple[float, float]:
    a = source - source.mean(axis=0)
    b = target - target.mean(axis=0)
    u, singular, vh = np.linalg.svd(a.T @ b)
    sign = np.linalg.det(u @ vh)
    diag = np.diag([1.0, sign])
    rotation = u @ diag @ vh
    scale = np.sum(singular * [1.0, sign]) / np.sum(a * a)
    diff = scale * a @ rotation - b
    return float(np.sqrt(np.mean(np.sum(diff * diff, axis=1)))), float(scale)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--rendered", action="store_true",
        help="compare the calibrated fair-fitted 3D centreline",
    )
    args = parser.parse_args()
    raw = json.loads(LOCATION.read_text(encoding="utf-8"))
    lap = np.array(
        [(row["x"], row["y"]) for row in raw if LAP_START <= row["date"] < LAP_END],
        dtype=float,
    ) / 10.0
    if args.rendered:
        script = (
            "import * as THREE from './dist/vendor/three/build/three.module.js';"
            "import {TRACK_POINTS,TRACK_LENGTH_METERS} from './dist/singapore/track-data.js';"
            "import {prepareSingaporeCurve} from './dist/singapore/geometry-smoothing.js';"
            "const result=prepareSingaporeCurve(THREE,TRACK_POINTS,TRACK_LENGTH_METERS);"
            "console.log(JSON.stringify(result.sourcePoints.map(p=>[p.x,p.z])));"
        )
        output = subprocess.check_output(
            ["node", "--input-type=module", "-e", script], cwd=ROOT, text=True
        )
        fia = np.array(json.loads(output), dtype=float)
    else:
        source = TRACK.read_text(encoding="utf-8")
        fia = np.array(
            ast.literal_eval(source.split("export const TRACK_POINTS = ", 1)[1].split(";", 1)[0]),
            dtype=float,
        )[:-1]
    telemetry = resample_closed(lap, SAMPLES)
    diagram = resample_closed(fia, SAMPLES)
    candidates = []
    for reverse in (False, True):
        for shift in range(SAMPLES):
            aligned = np.roll(diagram[::-1] if reverse else diagram, shift, axis=0)
            rms, scale = fit_rigid(aligned, telemetry)
            candidates.append((rms, scale, shift, reverse))
    rms, scale, shift, reverse = min(candidates)
    path_length = float(np.sum(np.linalg.norm(np.diff(lap, axis=0), axis=1)))
    print(f"OpenF1 clean lap 2: {len(lap)} samples; XY path {path_length:.1f} m")
    print(
        f"Best uniform-scale/rotation/translation match ({'rendered' if args.rendered else 'FIA raw'}): RMS {rms:.1f} m, "
        f"scale {scale:.4f}, phase {shift}/{SAMPLES}, reversed={reverse}"
    )
    print("Approximate data and different racing lines limit survey-level agreement.")


if __name__ == "__main__":
    main()
