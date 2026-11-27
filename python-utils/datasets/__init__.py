"""
Dataset preparation modules for corese-benchmark.

Each module exposes a `prepare(input_dir: str) -> str` function
that downloads/generates the dataset and returns the directory of .nt files.
"""

from __future__ import annotations

import os
import shutil


def create_file_view(view_dir: str, store_dir: str, filenames: list[str]) -> str:
    """Expose only requested inputs, removing stale files and conversions."""
    os.makedirs(view_dir, exist_ok=True)
    for name in os.listdir(view_dir):
        os.remove(os.path.join(view_dir, name))
    for name in filenames:
        source = os.path.abspath(os.path.join(store_dir, name))
        destination = os.path.join(view_dir, name)
        try:
            os.symlink(source, destination)
        except (OSError, NotImplementedError):
            shutil.copy2(source, destination)
    return view_dir
