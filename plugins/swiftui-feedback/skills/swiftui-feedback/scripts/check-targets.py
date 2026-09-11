#!/usr/bin/env python3
"""Find duplicate literal feedbackTarget IDs; not a Swift parser or a coverage proof."""
import argparse
import pathlib
import re
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source", type=pathlib.Path, help="Host Swift source directory or file")
args = parser.parse_args()
if not args.source.exists():
    parser.error("source does not exist")
files = [args.source] if args.source.is_file() else sorted(args.source.rglob("*.swift"))
pattern = re.compile(r'\.feedbackTarget\s*\(\s*"([^"\n]*)"')
ids = {}
count = 0
for path in files:
    if any(p in {".build", ".swiftpm", "Vendor", "vendor", "node_modules", ".git"} for p in path.parts):
        continue
    content = path.read_text()
    for match in pattern.finditer(content):
        target = match.group(1)
        if "\\(" in target:
            continue
        count += 1
        line = content[:match.start()].count("\n") + 1
        ids.setdefault(target, []).append(f"{path}:{line}")
conflicts = {key: values for key, values in ids.items() if len(values) > 1 or not key.strip()}
for key, locations in conflicts.items():
    print(f"Review ID {key!r}: " + ", ".join(locations))
print(f"Checked {count} literal declarations; {len(conflicts)} conflicts. Verify interpolated IDs and visual coverage in the picker.")
sys.exit(bool(conflicts))
