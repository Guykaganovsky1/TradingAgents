"""Structured logging configuration and audit logger."""
from __future__ import annotations

import logging
import logging.handlers
import sys
from pathlib import Path


def configure_logging(data_dir: Path) -> None:
    """Configure root logger (structured JSON-ish) and audit rotating file."""
    # Root logger: structured to stdout
    root = logging.getLogger()
    root.setLevel(logging.INFO)

    if not root.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(
            logging.Formatter(
                fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
                datefmt="%Y-%m-%dT%H:%M:%S",
            )
        )
        root.addHandler(handler)

    # Audit logger: rotating file, 10 MB per file, keep 5
    audit_logger = logging.getLogger("dashboard.audit")
    if not audit_logger.handlers:
        audit_path = data_dir / "audit.log"
        audit_handler = logging.handlers.RotatingFileHandler(
            audit_path,
            maxBytes=10 * 1024 * 1024,  # 10 MB
            backupCount=5,
            encoding="utf-8",
        )
        audit_handler.setFormatter(
            logging.Formatter(
                fmt="%(asctime)s AUDIT %(message)s",
                datefmt="%Y-%m-%dT%H:%M:%SZ",
            )
        )
        audit_logger.addHandler(audit_handler)
        audit_logger.setLevel(logging.INFO)
        audit_logger.propagate = False


def get_audit_logger() -> logging.Logger:
    return logging.getLogger("dashboard.audit")
