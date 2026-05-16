"""WebSocket event flow tests."""
from __future__ import annotations

import asyncio

import pytest


@pytest.mark.asyncio
async def test_ws_event_flow():
    """Published events must be received by WebSocket subscriber."""
    from services.run_manager import RunManager

    mgr = RunManager()
    run_id = "test-run-ws-flow"

    q = mgr.subscribe(run_id)
    test_event = {"type": "llm_start", "model": "gpt-5.4"}
    mgr.publish(run_id, test_event)

    # Event should be in queue
    assert not q.empty()
    evt = q.get_nowait()
    assert evt == test_event

    mgr.unsubscribe(run_id, q)


@pytest.mark.asyncio
async def test_ws_buffer_catchup():
    """Reconnecting client should receive buffered events."""
    from services.run_manager import RunManager

    mgr = RunManager()
    run_id = "test-run-buffer"

    # Publish events before subscriber connects
    for i in range(5):
        mgr.publish(run_id, {"type": "event", "seq": i})

    # Get buffer
    buffered = mgr.get_buffer(run_id)
    assert len(buffered) == 5
    assert buffered[0]["seq"] == 0
    assert buffered[4]["seq"] == 4


@pytest.mark.asyncio
async def test_ws_sentinel_signals_done():
    """Sentinel value must be detectable."""
    from services.run_manager import RunManager

    mgr = RunManager()
    run_id = "test-sentinel"
    q = mgr.subscribe(run_id)
    mgr.publish_done(run_id)

    evt = await asyncio.wait_for(q.get(), timeout=1.0)
    assert mgr.is_sentinel(evt)
    mgr.unsubscribe(run_id, q)


@pytest.mark.asyncio
async def test_ws_buffer_deque_maxlen():
    """Buffer should not exceed max size."""
    from services.run_manager import RunManager

    mgr = RunManager()
    run_id = "test-maxlen"

    # Publish 250 events (more than 200 buffer)
    for i in range(250):
        mgr.publish(run_id, {"type": "event", "seq": i})

    buffered = mgr.get_buffer(run_id)
    assert len(buffered) <= 200
    # Should have kept the LAST 200
    assert buffered[-1]["seq"] == 249
