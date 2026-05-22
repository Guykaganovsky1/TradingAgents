"""Codex CLI subprocess wrapper.

The Codex CLI (`/opt/homebrew/bin/codex`) authenticates against the user's
ChatGPT Plus/Pro subscription via `~/.codex/auth.json`, so this wrapper
costs nothing in API credits — it's billed against the user's existing
ChatGPT account. That makes it ideal for the Coding Planner role, which
runs once at the end of every analysis and would otherwise burn $1+ in
Responses API tokens.

Why subprocess instead of `codex mcp-server`?
    The MCP-server mode is a long-lived stdio process and would require a
    persistent connection inside the LangGraph worker. For a single-shot
    "critique this report" prompt, `codex exec` with `--ephemeral` is
    simpler and stateless: spawn → write prompt → read file → exit.

Flag rationale (every flag earns its keep):
    --skip-git-repo-check
        Worker runs from /tmp or the dashboard root, neither is a git repo.
    --ignore-user-config
        Skips `~/.codex/config.toml` which loads ~30 MCP servers (Penpot,
        Linear, Vercel, Supabase, etc). Without this, even a one-line
        prompt costs ~24k tokens of MCP tool definitions before the model
        sees the actual question.
    --ephemeral
        Don't persist a session file. We don't want this run to clutter
        the user's `codex resume` history.
    -o <file>
        Write ONLY the assistant's last message to a file. Avoids parsing
        the noisy stdout (session id, prompt echo, MCP error lines, etc).
    --sandbox read-only
        The planner shouldn't be writing files — it's producing text.
"""
from __future__ import annotations

import logging
import shutil
import subprocess
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)


class CodexCliError(RuntimeError):
    """Raised when the codex CLI fails (auth, timeout, missing binary, etc.)."""


def _resolve_codex_binary() -> str:
    """Locate the codex executable. Honors `which codex` first, then known paths."""
    path = shutil.which("codex")
    if path:
        return path
    # Common Homebrew install path on macOS
    candidate = "/opt/homebrew/bin/codex"
    if Path(candidate).exists():
        return candidate
    raise CodexCliError(
        "codex CLI not found on PATH. Install via `npm i -g @openai/codex` or "
        "`curl -L code.kimi.com/install.sh | bash` — see openai.com/codex."
    )


def run_codex(
    prompt: str,
    *,
    model: str = "",
    timeout_seconds: float = 600.0,
    working_dir: str | None = None,
) -> str:
    """Execute a one-shot Codex CLI prompt and return the assistant's reply.

    Args:
        prompt: The user prompt. Pass as much context as needed; Codex
            handles 200k+ token contexts comfortably for gpt-5-codex.
        model: Model name. Empty string (default) = let Codex pick what
            the account supports. ChatGPT Plus/Pro auth does NOT permit
            gpt-5-codex (API-only); leaving this empty avoids that 400.
        timeout_seconds: Hard cap on subprocess duration. The Coding Planner
            usually finishes in 60-180s; we leave 10 minutes of headroom
            for very long reports.
        working_dir: Optional working directory for the agent. Defaults to
            /tmp to keep the planner from accidentally touching project files.

    Returns:
        The assistant's final reply as a stripped string.

    Raises:
        CodexCliError: subprocess failed, timed out, or produced no output.
    """
    binary = _resolve_codex_binary()

    # Stage a temp file for -o so we don't have to scrape stdout.
    with tempfile.NamedTemporaryFile(
        mode="r", suffix=".codex.txt", delete=False
    ) as tmp:
        output_path = tmp.name

    cmd = [
        binary,
        "exec",
        "--skip-git-repo-check",
        "--ignore-user-config",
        "--ephemeral",
        "--sandbox", "read-only",
        "-o", output_path,
    ]
    if model:
        cmd.extend(["-m", model])
    cmd.append(prompt)

    logger.info("Invoking codex CLI: model=%s prompt_chars=%d", model, len(prompt))

    try:
        result = subprocess.run(
            cmd,
            cwd=working_dir or "/tmp",
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise CodexCliError(
            f"codex CLI timed out after {timeout_seconds}s"
        ) from exc

    if result.returncode != 0:
        # stderr from codex is noisy (MCP transport errors etc.) — only
        # surface the last 500 chars to keep error messages manageable.
        tail = (result.stderr or "")[-500:].strip()
        raise CodexCliError(
            f"codex CLI exited {result.returncode}: {tail or '(no stderr)'}"
        )

    try:
        reply = Path(output_path).read_text(encoding="utf-8", errors="replace").strip()
    except OSError as exc:
        raise CodexCliError(f"could not read codex output file: {exc}") from exc
    finally:
        Path(output_path).unlink(missing_ok=True)

    if not reply:
        # Fall back to scraping stdout when -o produced an empty file.
        # The codex CLI prints the final message between a "codex" marker
        # line and a "tokens used" line in interactive mode; in --output
        # mode an empty file usually means the agent errored mid-stream.
        raise CodexCliError("codex CLI returned an empty response")

    return reply
