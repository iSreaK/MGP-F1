"""Extract a metric Mexico City centreline from the FIA's 2025 vector circuit map.

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
    "2025_mexico_city_grand_prix_-_event_notes_-_circuit_map_pit_lane_"
    "drawing_emergency_exits_map_and_quarantine_zone_area.pdf"
)
TRACK_LENGTH_METERS = 4304.0
# 71 x 4,304 m - 305,354 m official race distance = 230 m between grid start
# and the timing/control line. FIA 2025 provisional classification:
# https://www.fia.com/sites/default/files/2025_20_mex_f1_r0_timing_raceprovisionalclassification_v01.pdf
START_LINE_OFFSET_METERS = 230.0
PIT_STRAIGHT_FROM_INDEX = 848
PIT_STRAIGHT_TO_INDEX = 222
FAIRING_RADIUS_POINTS = 8
PDF_PAGE_INDEX = 1
RASTER_SCALE = 3
SAMPLE_STEP_METERS = 5.0
CONTROL_POINT_PDF = (138.0, 655.3)

# Blue corner labels in the FIA vector drawing, used as local anchors.  The
# printed numbers are offset slightly from the actual apexes, so these are
# approximate turn locations rather than a claim of surveyed coordinates.
TURN_LABEL_PDF = {
    1: (197.5, 221.0),
    2: (232.7, 231.5),
    3: (238.8, 206.5),
    4: (464.7, 319.0),
    5: (485.5, 310.0),
    6: (514.5, 351.5),
    7: (395.0, 345.0),
    8: (374.0, 375.0),
    9: (336.0, 382.0),
    10: (315.0, 449.0),
    11: (283.5, 462.5),
    12: (245.5, 668.5),
    13: (167.5, 675.0),
    14: (166.5, 703.0),
    15: (179.0, 714.0),
    16: (174.0, 737.0),
    17: (144.0, 715.0),
}

# Every span below is a true straight on the FIA plan. The medial-axis
# skeleton inherits sub-metre pixel stair steps; preserve the end tangents
# while projecting interior samples onto the surveyed-looking road axis.
STRAIGHT_INTERVALS = [
    (842, 860, 205, 224),  # stadium exit -> T1 main straight, wraps control
    (275, 290, 380, 397),  # T3 -> T4 diagonal to the far-right hairpin
    (454, 461, 495, 513),  # T6 -> T7 back straight
    (644, 660, 700, 721),  # T11 -> T12 approach
]


def rasterize_track(pdf_path: Path) -> tuple[np.ndarray, tuple[int, int]]:
    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[PDF_PAGE_INDEX]
        image = Image.new(
            "L", (round(page.width * RASTER_SCALE), round(page.height * RASTER_SCALE)), 0
        )
        draw = ImageDraw.Draw(image)
        count = 0
        for curve in page.curves:
            if curve.get("non_stroking_color") != 0.5 or not curve.get("fill"):
                continue
            points = curve.get("pts", ())
            if len(points) < 3:
                continue
            draw.polygon(
                [(round(x * RASTER_SCALE), round(y * RASTER_SCALE)) for x, y in points],
                fill=255,
            )
            count += 1
    if count < 500:
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
    # From the control line we travel north/up along the main straight to T1.
    current = min(next_steps, key=lambda p: p[1])
    previous = start
    cycle = [start]
    while current != start:
        cycle.append(current)
        choices = [p for p in neighbours(current) if p != previous]
        if len(choices) != 1 or len(cycle) > len(pixels):
            raise ValueError("FIA centreline skeleton is not one simple loop")
        previous, current = current, choices[0]
    # The small broadcast-tower icon west of the pit straight shares the
    # circuit grey fill in the FIA artwork. It forms a separate 64-pixel
    # island, so only the race loop is required to close.
    if len(cycle) < len(pixels) * .98:
        raise ValueError(f"Traced only {len(cycle)} of {len(pixels)} skeleton points")
    return cycle


def rectify_straights(track: list[list[float]]) -> list[list[float]]:
    """Project each straight core to a line and blend its turn approaches."""
    count = len(track)
    result = [point[:] for point in track]

    def smoothstep(value: float) -> float:
        t = min(1.0, max(0.0, value))
        return t * t * (3 - 2 * t)

    for from_index, core_from, core_to, to_index in STRAIGHT_INTERVALS:
        if to_index < from_index:
            core_to += count
            to_index += count
        ax, az = track[core_from]
        bx, bz = track[core_to % count]
        dx, dz = bx - ax, bz - az
        length_squared = dx * dx + dz * dz
        if length_squared < 50 * 50:
            raise ValueError(f"Straight {core_from}->{core_to} is too short")
        for station_index in range(from_index + 1, to_index):
            index = station_index % count
            blend = min(
                smoothstep((station_index - from_index) / (core_from - from_index)),
                smoothstep((to_index - station_index) / (to_index - core_to)),
            )
            x, z = track[index]
            along = ((x - ax) * dx + (z - az) * dz) / length_squared
            result[index] = [
                x + (ax + along * dx - x) * blend,
                z + (az + along * dz - z) * blend,
            ]
    return result


def fair_centerline(track: list[list[float]]) -> list[list[float]]:
    """Suppress raster stair steps while retaining the broad shape of turns.

    A 13-point quadratic Savitzky-Golay fit evaluates the local centreline at
    each original station. Unlike a Gaussian average, it exactly reproduces
    lines and quadratic bends; 5 m sampling places its window roughly 30 m
    on either side. Keep the already rectified spans fixed.
    """
    count = len(track)
    radius = FAIRING_RADIUS_POINTS
    offsets = range(-radius, radius + 1)
    count_window = 2 * radius + 1
    squares = sum(offset * offset for offset in offsets)
    fourths = sum(offset ** 4 for offset in offsets)
    denominator = count_window * fourths - squares * squares
    weights = [
        (fourths - squares * offset * offset) / denominator
        for offset in offsets
    ]
    if abs(sum(weights) - 1) > 1e-12:
        raise ValueError("Quadratic fairing weights do not sum to one")
    straight = set()
    for _, core_from, core_to, _ in STRAIGHT_INTERVALS:
        if core_to < core_from:
            straight.update(range(core_from, count))
            straight.update(range(core_to + 1))
        else:
            straight.update(range(core_from, core_to + 1))
    result = []
    for index in range(count):
        if index in straight:
            result.append(track[index][:])
            continue
        result.append([
            sum(weight * track[(index + offset) % count][axis]
                for offset, weight in zip(offsets, weights))
            for axis in (0, 1)
        ])
    return result


def round_turn_twelve(track: list[list[float]]) -> list[list[float]]:
    """Reserved for any measured apex correction; none is needed here."""
    return track


def align_grid_offset(track: list[list[float]], grid_index: int) -> list[list[float]]:
    """The sample list includes the measured 230 m offset directly."""
    return track


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
    # actual exported polyline, not the raw pixel walk, to exactly 5,513m.
    correction = TRACK_LENGTH_METERS / sampled_length
    track = [[x * correction, z * correction] for x, z in track]
    track = rectify_straights(track)
    track = fair_centerline(track)
    # Fairing removes the high-frequency length generated by raster stair
    # steps. Recalibrate the entire closed line to preserve the FIA's lap.
    final_length = sum(
        math.dist(track[i], track[(i + 1) % len(track)])
        for i in range(len(track))
    )
    correction = TRACK_LENGTH_METERS / final_length
    track = [[x * correction, z * correction] for x, z in track]
    track = round_turn_twelve(track)
    corrected_length = sum(
        math.dist(track[i], track[(i + 1) % len(track)])
        for i in range(len(track))
    )
    correction = TRACK_LENGTH_METERS / corrected_length
    track = [[x * correction, z * correction] for x, z in track]
    provisional_cumulative = [0.0]
    for i in range(len(track) - 1):
        provisional_cumulative.append(
            provisional_cumulative[-1] + math.dist(track[i], track[i + 1])
        )
    grid_sample_index = min(
        range(PIT_STRAIGHT_TO_INDEX),
        key=lambda i: abs(provisional_cumulative[i] - START_LINE_OFFSET_METERS),
    )
    track = align_grid_offset(track, grid_sample_index)
    track = [[round(x, 4), round(z, 4)] for x, z in track]
    track.append(track[0][:])
    # The start-line offset and turn distances refer to the *exported*
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
            "pitLaneSide": "east / right of travel / positive across",
            "entryIndex": 846,
            "exitIndex": 210,
        },
        "turns": turn_data,
        "sectors": {
            "S1": {"beforeTurn": "T4", "beforeMeters": 136},
            "S2": {"beforeTurn": "T12", "beforeMeters": 242},
        },
        "drs": {
            "detection1": {"afterTurn": "T9", "afterMeters": 70},
            "activation1": {"afterTurn": "T11", "afterMeters": 80},
            "detection2": {"afterTurn": "T15", "afterMeters": 18},
            "activation2": {"afterTurn": "T17", "afterMeters": 240},
            "activation3": {"afterTurn": "T3", "afterMeters": 115},
        },
        "speedTrap": {"beforeTurn": "T1", "beforeMeters": 234},
    }
    header = (
        "// Autodromo Hermanos Rodriguez, full 2025 F1 Grand Prix layout.\n"
        "// Primary geometry: FIA 2025 Mexico City GP Doc 3, Circuit Map (page 2):\n"
        f"// {FIA_URL}\n"
        "// FIA vector track band skeletonized and resampled at ~5 m intervals.\n"
        "// Major straights were projected to lines, turn segments fair-fitted,\n"
        "// then the loop was calibrated to the FIA's 4,304 m centreline length.\n"
        "// [x,z] are metre coordinates, x right / z up on the FIA diagram.\n"
        "// This map is not georeferenced. Width, pit lane and apex markers\n"
        "// remain estimates; FIA artwork is not a kerb or barrier survey.\n"
        f"// Raw resampled length before final correction: {sampled_length:.3f} m.\n"
    )
    points_lines = ["  " + json.dumps(point, separators=(",", ":")) + "," for point in track]
    body = (
        "export const TRACK_LENGTH_METERS = 4304;\n"
        "export const TRACK_WIDTH_METERS = 14; // visual estimate; not a kerb survey\n"
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
    parser.add_argument("--out", type=Path, default=Path("dist/mexico/track-data.js"))
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
        overlay = Image.fromarray((mask.astype(np.uint8) * 130)).convert("RGB")
        paint = ImageDraw.Draw(overlay)
        raw_edges = [math.dist(cycle[i], cycle[(i + 1) % len(cycle)])
                     for i in range(len(cycle))]
        raw_total = sum(raw_edges)
        raw_distances = [0.0]
        for edge in raw_edges[:-1]:
            raw_distances.append(raw_distances[-1] + edge * TRACK_LENGTH_METERS / raw_total)
        for station in range(0, int(TRACK_LENGTH_METERS), 500):
            i = min(range(len(cycle)), key=lambda j: abs(raw_distances[j] - station))
            x, y = cycle[i]
            paint.ellipse((x - 7, y - 7, x + 7, y + 7), fill="#ff3b32")
            paint.text((x + 10, y - 10), str(station), fill="white")
        for number, (index, _) in turns.items():
            station = index * SAMPLE_STEP_METERS
            i = min(range(len(cycle)), key=lambda j: abs(raw_distances[j] - station))
            x, y = cycle[i]
            paint.text((x + 8, y + 3), f"T{number}", fill="#44ddff")
        overlay.save(f"{args.debug_prefix}-stations.png")
    print(f"Origin: {origin}, pixels: {np.count_nonzero(line)}")
    print(f"Track: {len(track)} closed points; scale {metres_per_pixel:.5f} m/px")
    print(f"Polyline before correction: {sampled_length:.3f} m")
    print(f"Grid index: {grid_index}, control index: 0")
    print("Turns (index, m):", turns)


if __name__ == "__main__":
    main()
