"""Draw a smooth Interlagos centreline from the official F1/FIA 2025 diagrams.

The map fixes the shape and order of corners, but is presentation artwork,
not a georeferenced survey. Bézier controls below were manually traced from
the F1 circuit illustration, then the resulting centreline is scaled to the
FIA's 4,309 m. No external image is redistributed or loaded at runtime.

FIA: https://www.fia.com/system/files/decision-document/2025_sao_paulo_grand_prix_-_event_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_quarantine_zone_and_red_zones_map.pdf
F1: https://www.formula1.com/en/racing/2025/brazil
"""

from __future__ import annotations

import json
import math
from pathlib import Path

LAP_METRES = 4309.0
SAMPLE_METRES = 4.5
START = (350.0, 107.0)  # control line, near the chequered flag on F1 map

# type, end, control 1, control 2, corner number. Image coordinates are
# deliberately hand faired so that genuine straights are perfectly linear.
PATH = [
    ("C", (153, 163), (280, 127), (200, 149), None),
    ("C", (98, 214), (97, 179), (81, 195), 1),
    ("C", (126, 276), (112, 240), (149, 252), 2),
    ("C", (100, 465), (105, 326), (80, 440), 3),
    ("C", (207, 505), (119, 488), (171, 495), None),
    ("L", (748, 661), None, None, None),
    ("C", (791, 669), (771, 668), (781, 676), 4),
    ("C", (809, 511), (841, 649), (823, 553), 5),
    ("C", (787, 461), (804, 493), (805, 479), None),
    ("L", (539, 291), None, None, None),
    ("C", (507, 243), (509, 272), (509, 260), 6),
    ("C", (559, 119), (501, 175), (522, 138), 7),
    ("C", (676, 98), (606, 104), (662, 88), 8),
    ("C", (697, 139), (704, 103), (702, 119), None),
    ("C", (677, 222), (685, 173), (659, 202), 9),
    ("C", (722, 226), (690, 240), (705, 234), None),
    ("C", (821, 146), (754, 203), (783, 158), None),
    ("C", (912, 145), (861, 126), (912, 126), 10),
    ("C", (906, 166), (912, 156), (911, 162), None),
    ("C", (829, 278), (869, 209), (832, 265), None),
    ("C", (826, 309), (825, 290), (825, 299), 11),
    ("C", (856, 370), (825, 331), (837, 350), None),
    ("L", (991, 457), None, None, None),
    ("C", (1025, 458), (1010, 468), (1018, 465), 12),
    ("C", (1058, 344), (1047, 441), (1068, 391), 13),
    ("C", (992, 112), (1067, 257), (1043, 157), 14),
    ("C", (649, 43), (932, 57), (741, 34), 15),
    ("C", START, (580, 39), (427, 86), None),
]


def bezier(a, b, c, d, t):
    q = 1 - t
    return (q**3 * a[0] + 3*q*q*t*b[0] + 3*q*t*t*c[0] + t**3*d[0],
            q**3 * a[1] + 3*q*q*t*b[1] + 3*q*t*t*c[1] + t**3*d[1])


def path_samples():
    points = [START]
    turns = {}
    p = START
    for kind, end, c1, c2, corner in PATH:
        estimate = math.dist(p, end) if kind == "L" else (
            math.dist(p, c1) + math.dist(c1, c2) + math.dist(c2, end))
        divisions = max(8, math.ceil(estimate / 1.2))
        for i in range(1, divisions + 1):
            t = i / divisions
            points.append((p[0] + (end[0]-p[0])*t,
                           p[1] + (end[1]-p[1])*t) if kind == "L"
                          else bezier(p, c1, c2, end, t))
        if corner:
            turns[corner] = len(points)-1
        p = end
    lengths = [0.0]
    for a, b in zip(points, points[1:]):
        lengths.append(lengths[-1] + math.dist(a, b))
    return points, lengths, turns


def main():
    points, lengths, turn_indices = path_samples()
    scale = LAP_METRES / lengths[-1]
    count = round(LAP_METRES / SAMPLE_METRES)
    sampled = []
    cursor = 0
    for i in range(count):
        target = i * lengths[-1] / count
        while cursor + 1 < len(lengths)-1 and lengths[cursor+1] < target:
            cursor += 1
        width = lengths[cursor+1] - lengths[cursor]
        alpha = (target - lengths[cursor]) / width if width else 0
        x = points[cursor][0]*(1-alpha) + points[cursor+1][0]*alpha
        y = points[cursor][1]*(1-alpha) + points[cursor+1][1]*alpha
        sampled.append([round((x-625)*scale, 4), round((352-y)*scale, 4)])
    sampled.append(sampled[0])
    # The runtime uses the resampled *polyline* length. Cubic chord loss must
    # be calibrated out as well, especially around the tight Bico de Pato.
    rendered = sum(math.dist(a, b) for a, b in zip(sampled, sampled[1:]))
    correction = LAP_METRES / rendered
    sampled = [[round(x*correction, 4), round(z*correction, 4)] for x, z in sampled]
    sampled[-1] = sampled[0]
    turn_stations = {str(c): lengths[i]*scale*correction for c, i in turn_indices.items()}
    turns = {f"T{c}": {
        "name": {
            1: "S de Senna · entrée", 2: "S de Senna · sortie",
            3: "Curva do Sol", 4: "Descida do Lago", 5: "Descida do Lago · sortie",
            6: "Ferradura", 7: "Laranjinha", 8: "Pinheirinho · entrée",
            9: "Pinheirinho · sortie", 10: "Bico de Pato", 11: "Mergulho",
            12: "Junção", 13: "Subida dos Boxes", 14: "Arquibancadas",
            15: "Reta dos Boxes",
        }[c],
        "index": round(turn_stations[str(c)]/LAP_METRES*count) % count,
        "distanceMeters": round(turn_stations[str(c)], 1)
    } for c in range(1, 16)}
    landmarks = {
        "controlLineIndex": 0,
        "gridIndex": round(60 / LAP_METRES * count),
        "startLineOffsetMeters": 60,
        "pitStraight": {
            "fromIndex": turns["T15"]["index"],
            "toIndex": turns["T1"]["index"],
            "pitLaneSide": "left of travel / negative across",
            "entryIndex": turns["T15"]["index"],
            "exitIndex": turns["T1"]["index"],
        },
        "turns": turns,
        "sectors": {
            "S1": {"beforeTurn": "T4", "beforeMeters": 168},
            "S2": {"beforeTurn": "T13", "beforeMeters": 100},
        },
        "drs": {
            "detection1": {"afterTurn": "T2", "afterMeters": 0},
            "activation1": {"afterTurn": "T3", "afterMeters": 70},
            "detection2": {"beforeTurn": "T13", "beforeMeters": 65},
            "activation2": {"afterTurn": "T15", "afterMeters": 60},
        },
        "speedTrap": {"beforeTurn": "T1", "beforeMeters": 90},
    }
    # This hand trace is only the registration reference. The final road is
    # generated from measured OpenF1 laps by build-gps-track.mjs.
    out = Path(__file__).resolve().parent / "hand-trace.js"
    head = ("// Interlagos 2025. Plan-view hand traced from the official F1 and FIA maps.\n"
            "// Centreline calibrated to FIA 4,309 m; not a georeferenced survey.\n"
            "// https://www.fia.com/system/files/decision-document/2025_sao_paulo_grand_prix_-_event_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_quarantine_zone_and_red_zones_map.pdf\n"
            "// https://www.formula1.com/en/racing/2025/brazil\n"
            "export const TRACK_LENGTH_METERS = 4309;\n"
            "export const TRACK_WIDTH_METERS = 13; // visual estimate\n"
            "export const TRACK_POINTS = ")
    out.write_text(head + json.dumps(sampled, separators=(",", ":")) + ";\n"
                   + "export const LANDMARKS = " + json.dumps(landmarks, indent=2, ensure_ascii=False)
                   + ";\n", encoding="utf-8")
    print(f"Generated {count} stations, input path {lengths[-1]:.1f} px, scale {scale:.4f} m/px")
    print("Turn distances:", {key: t["distanceMeters"] for key, t in turns.items()})


if __name__ == "__main__":
    main()
