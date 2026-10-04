"""Extract a metric Marina Bay centreline from the FIA's 2025 vector circuit map.

The FIA PDF is deliberately not redistributed here. Pass a locally downloaded copy
of the document identified by FIA_URL below. Its grey track band is vector artwork
composed of small filled polygons, so we rasterize just that layer before tracing
its medial axis. This avoids the distorted proportions of presentation SVG maps.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
import pdfplumber
from PIL import Image, ImageDraw, ImageFilter

FIA_URL = (
    "https://www.fia.com/system/files/decision-document/"
    "2025_singapore_grand_prix_-_event_notes_-_circuit_map_pit_lane_"
    "emergency_exits_map_and_quarantine_zone.pdf"
)
TRACK_LENGTH_METERS = 4927.0
START_LINE_OFFSET_METERS = 137.0
PIT_STRAIGHT_FROM_INDEX = 973
PIT_STRAIGHT_TO_INDEX = 81
PDF_PAGE_INDEX = 3
RASTER_SCALE = 3
SAMPLE_STEP_METERS = 5.0
CONTROL_POINT_PDF = (517.7, 324.0)

# Blue corner labels in the FIA vector drawing, used as local anchors.  The
# printed numbers are offset slightly from the actual apexes, so these are
# approximate turn locations rather than a claim of surveyed coordinates.
TURN_LABEL_PDF = {
    1: (424.6, 177.5),
    2: (397.8, 204.3),
    3: (359.6, 181.8),
    4: (377.9, 247.2),
    5: (448.6, 319.5),
    6: (295.2, 397.3),
    7: (146.5, 374.2),
    8: (128.6, 453.3),
    9: (69.7, 455.4),
    10: (36.6, 613.5),
    11: (107.5, 619.5),
    12: (117.2, 658.0),
    13: (187.6, 682.7),
    14: (152.0, 462.6),
    15: (238.4, 478.6),
    16: (411.1, 407.4),
    17: (433.5, 423.9),
    18: (513.5, 388.8),
    19: (551.3, 355.8),
}


def rasterize_track(pdf_path: Path) -> tuple[np.ndarray, tuple[int, int]]:
    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[PDF_PAGE_INDEX]
        image = Image.new(
            "L", (round(page.width * RASTER_SCALE), round(page.height * RASTER_SCALE)), 0
        )
        draw = ImageDraw.Draw(image)
        count = 0
        for curve in page.curves:
            if curve.get("non_stroking_color") != 0.863 or not curve.get("fill"):
                continue
            points = curve.get("pts", ())
            if len(points) < 3:
                continue
            draw.polygon(
                [(round(x * RASTER_SCALE), round(y * RASTER_SCALE)) for x, y in points],
                fill=255,
            )
            count += 1
    if count < 5000:
        raise ValueError(f"Only {count} track polygons found; FIA PDF format changed")
    bounds = image.getbbox()
    if bounds is None:
        raise ValueError("No track band found")
    x0, y0, x1, y1 = bounds
    pad = 12
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(image.width, x1 + pad)
    y1 = min(image.height, y1 + pad)
    # The PDF triangulation has occasional pixel-sized seams within the band.
    cropped = image.crop((x0, y0, x1, y1))
    cropped = cropped.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    return np.asarray(cropped) > 0, (x0, y0)


def thin(mask: np.ndarray) -> np.ndarray:
    """Zhang-Suen thinning, vectorised over the limited circuit bounding box."""
    pixels = np.pad(mask.astype(np.uint8), 1)
    for iteration in range(100):
        removed = 0
        for phase in (0, 1):
            c = pixels[1:-1, 1:-1]
            p2 = pixels[:-2, 1:-1]
            p3 = pixels[:-2, 2:]
            p4 = pixels[1:-1, 2:]
            p5 = pixels[2:, 2:]
            p6 = pixels[2:, 1:-1]
            p7 = pixels[2:, :-2]
            p8 = pixels[1:-1, :-2]
            p9 = pixels[:-2, :-2]
            neighbors = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9
            transitions = sum(
                (a == 0) & (b == 1)
                for a, b in (
                    (p2, p3),
                    (p3, p4),
                    (p4, p5),
                    (p5, p6),
                    (p6, p7),
                    (p7, p8),
                    (p8, p9),
                    (p9, p2),
                )
            )
            pick = (c == 1) & (neighbors >= 2) & (neighbors <= 6) & (transitions == 1)
            if phase == 0:
                pick &= (p2 * p4 * p6 == 0) & (p4 * p6 * p8 == 0)
            else:
                pick &= (p2 * p4 * p8 == 0) & (p2 * p6 * p8 == 0)
            removed += int(np.count_nonzero(pick))
            c[pick] = 0
        if not removed:
            break
    print(f"Thinning: {iteration + 1} iterations, {np.count_nonzero(pixels)} pixels")
    return pixels[1:-1, 1:-1].astype(bool)


def trace_cycle(line: np.ndarray, origin: tuple[int, int]) -> list[tuple[int, int]]:
    ys, xs = np.where(line)
    pixels = set(zip(xs.tolist(), ys.tolist()))
    target = (
        CONTROL_POINT_PDF[0] * RASTER_SCALE - origin[0],
        CONTROL_POINT_PDF[1] * RASTER_SCALE - origin[1],
    )
    start = min(pixels, key=lambda p: math.dist(p, target))

    def neighbours(point: tuple[int, int]) -> list[tuple[int, int]]:
        x, y = point
        found = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                other = (x + dx, y + dy)
                if (dx == 0 and dy == 0) or other not in pixels:
                    continue
                # Ignore diagonal corner-cuts beside an orthogonal edge. This
                # makes the one-pixel skeleton a simple degree-2 cycle.
                if dx and dy and ((x + dx, y) in pixels or (x, y + dy) in pixels):
                    continue
                found.append(other)
        return found

    next_steps = neighbours(start)
    if len(next_steps) != 2:
        raise ValueError(f"Control-point skeleton degree is {len(next_steps)}")
    # From the control line we travel northwest to T1. This is the actual
    # anti-clockwise race direction on the 2025 FIA circuit map.
    current = min(next_steps, key=lambda p: p[0] + p[1])
    previous = start
    cycle = [start]
    while current != start:
        cycle.append(current)
        choices = [p for p in neighbours(current) if p != previous]
        if len(choices) != 1 or len(cycle) > len(pixels):
            raise ValueError("FIA centreline skeleton is not one simple loop")
        previous, current = current, choices[0]
    if len(cycle) != len(pixels):
        raise ValueError(f"Traced {len(cycle)} of {len(pixels)} skeleton points")
    return cycle


def straighten_start_finish(
    track: list[list[float]], from_index: int, to_index: int
) -> list[list[float]]:
    """Remove raster jitter only from the 415 m start/finish straight.

    The FIA map represents this stretch as a straight road, but the medial
    axis of its triangulated road band meanders by about one metre. Project
    interior points onto the line between two anchors outside T19 and T1.
    Keeping each point's longitudinal projection preserves local spacing,
    while leaving every corner apex untouched.
    """
    count = len(track)
    indices = list(range(from_index, count)) + list(range(to_index + 1))
    ax, az = track[from_index]
    bx, bz = track[to_index]
    dx, dz = bx - ax, bz - az
    length_squared = dx * dx + dz * dz
    if length_squared < 100 * 100:
        raise ValueError("The start/finish anchors are unexpectedly close")
    result = [point[:] for point in track]
    for index in indices[1:-1]:
        x, z = track[index]
        along = ((x - ax) * dx + (z - az) * dz) / length_squared
        result[index] = [ax + along * dx, az + along * dz]
    return result


def align_grid_offset(track: list[list[float]], grid_index: int) -> list[list[float]]:
    """Place the actual start boxes 137 m after the control line.

    Raster-path sampling measures the extra 137 m on a zigzag skeleton,
    leaving the rendered grid about a metre short. Re-time only collinear
    points between control line and straight endpoint. Their endpoints and
    total lap length stay fixed.
    """
    result = [point[:] for point in track]
    ox, oz = track[0]
    ex, ez = track[PIT_STRAIGHT_TO_INDEX]
    dx, dz = ex - ox, ez - oz
    straight_length = math.hypot(dx, dz)
    ux, uz = dx / straight_length, dz / straight_length

    def along(index: int) -> float:
        x, z = track[index]
        return (x - ox) * ux + (z - oz) * uz

    old_grid_offset = along(grid_index)
    if not (0 < old_grid_offset < straight_length
            and 0 < START_LINE_OFFSET_METERS < straight_length):
        raise ValueError("Grid offset is outside the start/finish straight")
    for index in range(1, PIT_STRAIGHT_TO_INDEX):
        distance = along(index)
        if index <= grid_index:
            adjusted = distance * START_LINE_OFFSET_METERS / old_grid_offset
        else:
            adjusted = START_LINE_OFFSET_METERS + (
                distance - old_grid_offset
            ) * (straight_length - START_LINE_OFFSET_METERS) / (
                straight_length - old_grid_offset
            )
        result[index] = [ox + adjusted * ux, oz + adjusted * uz]
    return result


def build_track(
    cycle: list[tuple[int, int]], origin: tuple[int, int]
) -> tuple[list[list[float]], dict[int, tuple[int, float]], int, float, float]:
    edges = [
        math.dist(cycle[i], cycle[(i + 1) % len(cycle)])
        for i in range(len(cycle))
    ]
    total_pixels = sum(edges)
    metres_per_pixel = TRACK_LENGTH_METERS / total_pixels
    cumulative = [0.0]
    for edge in edges:
        cumulative.append(cumulative[-1] + edge * metres_per_pixel)

    def point_at(metres: float) -> tuple[float, float]:
        metres %= TRACK_LENGTH_METERS
        lo, hi = 0, len(cycle)
        while lo < hi:
            mid = (lo + hi) // 2
            if cumulative[mid + 1] < metres:
                lo = mid + 1
            else:
                hi = mid
        a, b = cycle[lo], cycle[(lo + 1) % len(cycle)]
        span = cumulative[lo + 1] - cumulative[lo]
        f = 0 if span == 0 else (metres - cumulative[lo]) / span
        return (a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f)

    samples = sorted(
        set([i * SAMPLE_STEP_METERS for i in range(int(TRACK_LENGTH_METERS // SAMPLE_STEP_METERS) + 1)]
            + [START_LINE_OFFSET_METERS])
    )
    samples = [m for m in samples if m < TRACK_LENGTH_METERS]
    px_points = [point_at(m) for m in samples]
    # Centre the site in the view, using FIA map axes. The PDF's page is not
    # georeferenced, so these coordinates preserve shape, scale and orientation
    # of the published circuit diagram, not absolute GPS orientation.
    cx = sum(p[0] for p in px_points) / len(px_points)
    cy = sum(p[1] for p in px_points) / len(px_points)
    track = [
        [(p[0] - cx) * metres_per_pixel, (cy - p[1]) * metres_per_pixel]
        for p in px_points
    ]
    sampled_length = sum(
        math.dist(track[i], track[(i + 1) % len(track)])
        for i in range(len(track))
    )
    # The discrete skeleton takes staircase diagonals at sub-metre scale.  A
    # clean centreline sampled every 5m is a little shorter, so scale the
    # actual exported polyline, not the raw pixel walk, to exactly 4,927m.
    correction = TRACK_LENGTH_METERS / sampled_length
    track = [[x * correction, z * correction] for x, z in track]
    track = straighten_start_finish(
        track, PIT_STRAIGHT_FROM_INDEX, PIT_STRAIGHT_TO_INDEX
    )
    # Straightening removes approximately 0.8 m of skeleton-derived zigzag.
    # Recalibrate the entire closed line to preserve the FIA's exact lap.
    final_length = sum(
        math.dist(track[i], track[(i + 1) % len(track)])
        for i in range(len(track))
    )
    correction = TRACK_LENGTH_METERS / final_length
    track = [[x * correction, z * correction] for x, z in track]
    grid_sample_index = samples.index(START_LINE_OFFSET_METERS)
    track = align_grid_offset(track, grid_sample_index)
    track = [[round(x, 4), round(z, 4)] for x, z in track]
    track.append(track[0][:])
    # The 137 m start-line offset and turn distances refer to the *exported*
    # geometry. Resampling removes pixel stair steps, so raw-skeleton distances
    # are not valid for the smooth final path.
    actual_cumulative = [0.0]
    for i in range(len(track) - 1):
        actual_cumulative.append(
            actual_cumulative[-1] + math.dist(track[i], track[i + 1])
        )
    grid_index = min(
        range(len(track) - 1),
        key=lambda i: abs(actual_cumulative[i] - START_LINE_OFFSET_METERS),
    )

    turns = {}
    previous_distance = 0.0
    for number, (px, py) in TURN_LABEL_PDF.items():
        target = (px * RASTER_SCALE - origin[0], py * RASTER_SCALE - origin[1])
        # The label for T14 is near T8 in the 2D map: enforce the known lap
        # order to snap it to the correct branch after T13.
        eligible = [i for i in range(len(cycle)) if cumulative[i] > previous_distance + 15]
        best = min(eligible, key=lambda i: math.dist(cycle[i], target))
        distance = cumulative[best]
        index = min(range(len(samples)), key=lambda i: abs(samples[i] - distance))
        turns[number] = (index, round(actual_cumulative[index], 1))
        previous_distance = distance
    return track, turns, grid_index, metres_per_pixel, sampled_length


def write_track_data(
    output: Path,
    track: list[list[float]],
    turns: dict[int, tuple[int, float]],
    grid_index: int,
    sampled_length: float,
) -> None:
    turn_data = {
        f"T{number}": {"name": f"Virage {number}", "index": index, "distanceMeters": distance}
        for number, (index, distance) in turns.items()
    }
    landmarks = {
        "controlLineIndex": 0,
        "gridIndex": grid_index,
        "startLineOffsetMeters": START_LINE_OFFSET_METERS,
        "pitStraight": {
            "fromIndex": PIT_STRAIGHT_FROM_INDEX,
            "toIndex": PIT_STRAIGHT_TO_INDEX,
            "pitLaneSide": "west / intérieur du circuit",
            "entryIndex": 925,
            "exitIndex": 84,
        },
        "turns": turn_data,
        "sectors": {
            "S1": {"beforeTurn": "T7", "beforeMeters": 150},
            "S2": {"beforeTurn": "T14", "beforeMeters": 140},
        },
        "drs": {
            "detection1": {"atTurn": "T4"},
            "activation1": {"afterTurn": "T5", "afterMeters": 48},
            "detection2": {"beforeTurn": "T13", "beforeMeters": 102},
            "activation2": {"afterTurn": "T13", "afterMeters": 78},
            "activation3": {"afterTurn": "T14", "afterMeters": 100},
            "detection3": {"afterTurn": "T17", "afterMeters": 105},
            "activation4": {"atTurn": "T19", "position": "exit"},
        },
    }
    header = (
        "// Marina Bay Street Circuit, 2025 Singapore GP.\n"
        "// Source: FIA 2025 Singapore GP Doc 7, Circuit Map (page 4 of PDF):\n"
        f"// {FIA_URL}\n"
        "// The FIA PDF vector track band was skeletonized and resampled. Its\n"
        "// start/finish straight is rectified to remove raster jitter; the\n"
        "// centreline is calibrated to the FIA's 4,927 m lap length.\n"
        "// [x,z] are metre coordinates, x right / z up on the FIA diagram.\n"
        "// This map is not georeferenced. Lateral width, pit lane and apex markers\n"
        "// remain estimates; the official map is not a survey of kerbs or barriers.\n"
        f"// Raw resampled length before final correction: {sampled_length:.3f} m.\n"
    )
    points_lines = ["  " + json.dumps(point, separators=(",", ":")) + "," for point in track]
    body = (
        "export const TRACK_LENGTH_METERS = 4927;\n"
        "export const TRACK_WIDTH_METERS = 10; // visual estimate; width varies by corner\n"
        "export const TRACK_POINTS = [\n"
        + "\n".join(points_lines)
        + "\n];\n\n"
        "export const LANDMARKS = "
        + json.dumps(landmarks, ensure_ascii=False, indent=2)
        + ";\n"
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(header + "\n" + body, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("fia_pdf", type=Path)
    parser.add_argument("--debug-prefix", type=Path)
    parser.add_argument("--out", type=Path, default=Path("dist/singapore/track-data.js"))
    args = parser.parse_args()
    mask, origin = rasterize_track(args.fia_pdf)
    line = thin(mask)
    cycle = trace_cycle(line, origin)
    track, turns, grid_index, metres_per_pixel, sampled_length = build_track(cycle, origin)
    write_track_data(args.out, track, turns, grid_index, sampled_length)
    if args.debug_prefix:
        Image.fromarray(mask.astype(np.uint8) * 255).save(
            f"{args.debug_prefix}-band.png"
        )
        Image.fromarray(line.astype(np.uint8) * 255).save(
            f"{args.debug_prefix}-skeleton.png"
        )
    print(f"Origin: {origin}, pixels: {np.count_nonzero(line)}")
    print(f"Track: {len(track)} closed points; scale {metres_per_pixel:.5f} m/px")
    print(f"Polyline before correction: {sampled_length:.3f} m")
    print(f"Grid index: {grid_index}, control index: 0")
    print("Turns (index, m):", turns)


if __name__ == "__main__":
    main()
