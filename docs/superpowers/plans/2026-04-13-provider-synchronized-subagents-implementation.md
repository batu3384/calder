# Provider-Synchronized Claude Code Agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Claude Code main sessions, subagents, and helper agents all follow the user’s active provider (`Claude`, `Z.ai`, or `MiniMax`) without changing the visible model-selection UX.

**Architecture:** Use the real Claude Code request header `X-Claude-Code-Session-Id` as the stable gateway session key. Resolve the active provider from the existing runtime sidecar in `/Users/batuhanyuksel/.calder/runtime` when possible, fall back to a gateway-maintained in-memory registry when the sidecar is missing, and keep routing in `observe` mode before turning on `enforce` mode. All alias rewriting happens in a new pure Python routing layer so the HTTP gateway stays thin and current Z.ai/MiniMax sanitization behavior remains intact.

**Tech Stack:** Python 3, FastAPI, httpx, stdlib `unittest`, FastAPI `TestClient`, existing Claude Code runtime sidecars in `/Users/batuhanyuksel/.calder/runtime`

---

## Scope

This plan covers only provider-synchronized routing for Claude Code sessions and subagents. It does not redesign the model picker, statusline, or provider quota surfaces.

## Execution Model

`/Users/batuhanyuksel/.litellm` is not a git repository, so runtime safety checkpoints replace git commits for the gateway files in that directory. Use timestamped backup folders before each risky task. Repo-tracked docs may still be committed normally if desired, but the runtime work itself should be checkpointed with shell copies.

## File Structure Lock

- `/Users/batuhanyuksel/.litellm/provider_sync.py`
  Pure routing policy: provider detection, alias-tier inference, provider-relative model resolution, and in-memory session registry.
- `/Users/batuhanyuksel/.litellm/provider_sync_test.py`
  Unit tests for pure routing behavior.
- `/Users/batuhanyuksel/.litellm/provider_sync_runtime.py`
  Runtime sidecar bridge that maps `X-Claude-Code-Session-Id` to the current visible Claude Code model using `/Users/batuhanyuksel/.calder/runtime/*.sessionid` and `*.cost`.
- `/Users/batuhanyuksel/.litellm/provider_sync_runtime_test.py`
  Unit tests for the runtime bridge.
- `/Users/batuhanyuksel/.litellm/gateway_integration_test.py`
  Request-level tests using FastAPI `TestClient` and a fake async upstream client.
- `/Users/batuhanyuksel/.litellm/tiny_gateway.py`
  Existing HTTP gateway; wire in session-aware routing here.
- `/Users/batuhanyuksel/.litellm/claude-gateway.sh`
  Wrapper that exports routing mode and runtime directory for the gateway.

## Key Design Inputs To Preserve

- Visible model UX stays the same:
  - Claude: `/model opus`, `/model sonnet`, `/model haiku`
  - Z.ai: `custom = glm-5.1`, `/model glm-5-turbo`, `/model glm-4.7`
  - MiniMax: `/model MiniMax-M2.7`
- Explicit provider-native models always win:
  - `glm-*` stays Z.ai
  - `MiniMax-*` stays MiniMax
- Existing Z.ai fallback chain remains:
  - `glm-5.1 -> glm-5-turbo -> glm-4.7`
  - `glm-5-turbo -> glm-4.7`
- Existing thinking sanitization remains intact for Anthropic, Z.ai, and MiniMax.

## Execution Order

1. Create the pure routing module and lock its behavior with tests.
2. Bridge gateway requests to the existing runtime sidecar using `X-Claude-Code-Session-Id`.
3. Add observe-mode wiring to the gateway with no rewriting yet.
4. Turn on enforce-mode rewrites only after observe-mode tests and sidecar resolution are green.
5. Lock regressions around fallback and thinking sanitization.
6. Flip the wrapper default to `enforce`, run live smoke tests, and keep a clean rollback path.

## Task 1: Create The Pure Routing Module

**Files:**
- Create: `/Users/batuhanyuksel/.litellm/provider_sync.py`
- Create: `/Users/batuhanyuksel/.litellm/provider_sync_test.py`

- [ ] **Step 1: Write the failing routing tests**

Create `/Users/batuhanyuksel/.litellm/provider_sync_test.py` with:

```python
import unittest

from provider_sync import RouteState, resolve_request_model


class ResolveRequestModelTests(unittest.TestCase):
    def test_explicit_glm_model_passes_through(self):
        state = RouteState(active_provider="anthropic", active_main_model="claude-sonnet-4-6")
        resolved = resolve_request_model("glm-5.1", state)
        self.assertEqual(resolved.provider, "zai")
        self.assertEqual(resolved.model, "glm-5.1")
        self.assertFalse(resolved.rewritten)

    def test_explicit_minimax_model_passes_through(self):
        state = RouteState(active_provider="zai", active_main_model="glm-5.1")
        resolved = resolve_request_model("MiniMax-M2.7", state)
        self.assertEqual(resolved.provider, "minimax")
        self.assertEqual(resolved.model, "MiniMax-M2.7")
        self.assertFalse(resolved.rewritten)

    def test_alias_uses_zai_mapping(self):
        state = RouteState(active_provider="zai", active_main_model="glm-5.1")
        resolved = resolve_request_model("sonnet", state)
        self.assertEqual(resolved.provider, "zai")
        self.assertEqual(resolved.model, "glm-5-turbo")
        self.assertTrue(resolved.rewritten)

    def test_claude_family_request_uses_minimax_mapping_when_session_is_minimax(self):
        state = RouteState(active_provider="minimax", active_main_model="MiniMax-M2.7")
        resolved = resolve_request_model("claude-haiku-4-5-20251001", state)
        self.assertEqual(resolved.provider, "minimax")
        self.assertEqual(resolved.model, "MiniMax-M2.7")
        self.assertTrue(resolved.rewritten)

    def test_ambiguous_claude_family_request_stays_claude_without_state(self):
        resolved = resolve_request_model("claude-sonnet-4-6", None)
        self.assertEqual(resolved.provider, "anthropic")
        self.assertEqual(resolved.model, "claude-sonnet-4-6")
        self.assertFalse(resolved.rewritten)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the routing tests and verify they fail**

Run:

```bash
/Users/batuhanyuksel/.litellm/venv/bin/python3 -m unittest /Users/batuhanyuksel/.litellm/provider_sync_test.py -v
```

Expected: FAIL because `provider_sync.py` does not exist yet.

- [ ] **Step 3: Implement the minimal routing policy**

Create `/Users/batuhanyuksel/.litellm/provider_sync.py` with:

```python
from dataclasses import dataclass
from typing import Literal, Optional

ProviderId = Literal["anthropic", "zai", "minimax"]
TierId = Literal["haiku", "sonnet", "opus"]

CLAUDE_ALIAS_MODELS = {
    "haiku": "claude-haiku-4-5-20251001",
    "sonnet": "claude-sonnet-4-6",
    "opus": "claude-opus-4-1",
}
ZAI_ALIAS_MODELS = {
    "haiku": "glm-4.7",
    "sonnet": "glm-5-turbo",
    "opus": "glm-5.1",
}
MINIMAX_ALIAS_MODELS = {
    "haiku": "MiniMax-M2.7",
    "sonnet": "MiniMax-M2.7",
    "opus": "MiniMax-M2.7",
}


@dataclass(frozen=True)
class RouteState:
    active_provider: ProviderId
    active_main_model: str


@dataclass(frozen=True)
class ResolvedRoute:
    provider: ProviderId
    model: str
    tier: str
    rewritten: bool


def detect_provider(model: str) -> ProviderId:
    lower = model.lower()
    if lower.startswith("glm-"):
        return "zai"
    if lower.startswith("minimax-"):
        return "minimax"
    return "anthropic"


def infer_tier(model: str) -> Optional[TierId]:
    lower = model.lower()
    if lower == "haiku" or lower.startswith("claude-haiku-"):
        return "haiku"
    if lower == "sonnet" or lower.startswith("claude-sonnet-"):
        return "sonnet"
    if lower == "opus" or lower.startswith("claude-opus-"):
        return "opus"
    return None


def provider_model_for_tier(provider: ProviderId, tier: TierId) -> str:
    if provider == "zai":
        return ZAI_ALIAS_MODELS[tier]
    if provider == "minimax":
        return MINIMAX_ALIAS_MODELS[tier]
    return CLAUDE_ALIAS_MODELS[tier]


def resolve_request_model(model: str, state: Optional[RouteState]) -> ResolvedRoute:
    provider = detect_provider(model)
    if provider != "anthropic":
        return ResolvedRoute(provider=provider, model=model, tier="explicit", rewritten=False)

    tier = infer_tier(model)
    if state is None or tier is None:
        return ResolvedRoute(provider="anthropic", model=model, tier=tier or "explicit", rewritten=False)

    resolved_model = provider_model_for_tier(state.active_provider, tier)
    return ResolvedRoute(
        provider=detect_provider(resolved_model),
        model=resolved_model,
        tier=tier,
        rewritten=(resolved_model != model),
    )
```

- [ ] **Step 4: Run the routing tests and verify they pass**

Run:

```bash
/Users/batuhanyuksel/.litellm/venv/bin/python3 -m unittest /Users/batuhanyuksel/.litellm/provider_sync_test.py -v
```

Expected: PASS with 5 passing tests.

- [ ] **Step 5: Create a safety checkpoint**

Run:

```bash
STAMP="$(date +%Y%m%d-%H%M%S)-provider-sync-task1"
mkdir -p "/Users/batuhanyuksel/.litellm/checkpoints/$STAMP"
cp /Users/batuhanyuksel/.litellm/provider_sync.py "/Users/batuhanyuksel/.litellm/checkpoints/$STAMP/"
cp /Users/batuhanyuksel/.litellm/provider_sync_test.py "/Users/batuhanyuksel/.litellm/checkpoints/$STAMP/"
printf '%s\n' "$STAMP" > /Users/batuhanyuksel/.litellm/checkpoints/LATEST_PROVIDER_SYNC_CHECKPOINT
```

Expected: a new timestamped folder exists under `/Users/batuhanyuksel/.litellm/checkpoints`.

## Task 2: Bridge Session Headers To The Existing Runtime Sidecar

**Files:**
- Create: `/Users/batuhanyuksel/.litellm/provider_sync_runtime.py`
- Create: `/Users/batuhanyuksel/.litellm/provider_sync_runtime_test.py`

- [ ] **Step 1: Write the failing runtime-bridge tests**

Create `/Users/batuhanyuksel/.litellm/provider_sync_runtime_test.py` with:

```python
import json
import tempfile
import unittest
from pathlib import Path

from provider_sync_runtime import load_runtime_route_state


class RuntimeBridgeTests(unittest.TestCase):
    def test_maps_claude_session_id_to_minimax_sidecar_model(self):
        with tempfile.TemporaryDirectory() as tmp:
            runtime_dir = Path(tmp)
            (runtime_dir / "ide-1.sessionid").write_text("claude-session-123", encoding="utf-8")
            (runtime_dir / "ide-1.cost").write_text(
                json.dumps({"model": "MiniMax-M2.7"}),
                encoding="utf-8",
            )
            state = load_runtime_route_state("claude-session-123", runtime_dir)
            self.assertIsNotNone(state)
            self.assertEqual(state.active_provider, "minimax")
            self.assertEqual(state.active_main_model, "MiniMax-M2.7")

    def test_maps_claude_session_id_to_zai_sidecar_model(self):
        with tempfile.TemporaryDirectory() as tmp:
            runtime_dir = Path(tmp)
            (runtime_dir / "ide-2.sessionid").write_text("claude-session-456", encoding="utf-8")
            (runtime_dir / "ide-2.cost").write_text(
                json.dumps({"model": "glm-5.1"}),
                encoding="utf-8",
            )
            state = load_runtime_route_state("claude-session-456", runtime_dir)
            self.assertIsNotNone(state)
            self.assertEqual(state.active_provider, "zai")
            self.assertEqual(state.active_main_model, "glm-5.1")

    def test_returns_none_when_cost_sidecar_is_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            runtime_dir = Path(tmp)
            (runtime_dir / "ide-3.sessionid").write_text("claude-session-789", encoding="utf-8")
            self.assertIsNone(load_runtime_route_state("claude-session-789", runtime_dir))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the runtime-bridge tests and verify they fail**

Run:

```bash
/Users/batuhanyuksel/.litellm/venv/bin/python3 -m unittest /Users/batuhanyuksel/.litellm/provider_sync_runtime_test.py -v
```

Expected: FAIL because `provider_sync_runtime.py` does not exist yet.

- [ ] **Step 3: Implement the runtime sidecar bridge**

Create `/Users/batuhanyuksel/.litellm/provider_sync_runtime.py` with:

```python
import json
from pathlib import Path
from typing import Optional

from provider_sync import RouteState, detect_provider


def reverse_lookup_ide_session_id(claude_session_id: str, runtime_dir: Path) -> Optional[str]:
    for session_file in runtime_dir.glob("*.sessionid"):
        try:
            if session_file.read_text(encoding="utf-8").strip() == claude_session_id:
                return session_file.stem
        except OSError:
            continue
    return None


def load_runtime_route_state(claude_session_id: str, runtime_dir: Path) -> Optional[RouteState]:
    ide_session_id = reverse_lookup_ide_session_id(claude_session_id, runtime_dir)
    if not ide_session_id:
        return None

    cost_file = runtime_dir / f"{ide_session_id}.cost"
    if not cost_file.exists():
        return None

    try:
        payload = json.loads(cost_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None

    model = str(payload.get("model") or "").strip()
    if not model:
        return None

    return RouteState(
        active_provider=detect_provider(model),
        active_main_model=model,
    )
```

- [ ] **Step 4: Run the runtime-bridge tests and verify they pass**

Run:

```bash
/Users/batuhanyuksel/.litellm/venv/bin/python3 -m unittest /Users/batuhanyuksel/.litellm/provider_sync_runtime_test.py -v
```

Expected: PASS with 3 passing tests.

- [ ] **Step 5: Create a safety checkpoint**

Run:

```bash
STAMP="$(date +%Y%m%d-%H%M%S)-provider-sync-task2"
mkdir -p "/Users/batuhanyuksel/.litellm/checkpoints/$STAMP"
cp /Users/batuhanyuksel/.litellm/provider_sync.py "/Users/batuhanyuksel/.litellm/checkpoints/$STAMP/"
cp /Users/batuhanyuksel/.litellm/provider_sync_runtime.py "/Users/batuhanyuksel/.litellm/checkpoints/$STAMP/"
cp /Users/batuhanyuksel/.litellm/provider_sync_test.py "/Users/batuhanyuksel/.litellm/checkpoints/$STAMP/"
cp /Users/batuhanyuksel/.litellm/provider_sync_runtime_test.py "/Users/batuhanyuksel/.litellm/checkpoints/$STAMP/"
printf '%s\n' "$STAMP" > /Users/batuhanyuksel/.litellm/checkpoints/LATEST_PROVIDER_SYNC_CHECKPOINT
```

Expected: checkpoint folder contains both modules and both test files.

## Task 3: Wire The Gateway In Observe Mode First

**Files:**
- Create: `/Users/batuhanyuksel/.litellm/gateway_integration_test.py`
- Modify: `/Users/batuhanyuksel/.litellm/tiny_gateway.py`

- [ ] **Step 1: Write the failing observe-mode integration test**

Create `/Users/batuhanyuksel/.litellm/gateway_integration_test.py` with:

```python
import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

TINY_GATEWAY_PATH = Path("/Users/batuhanyuksel/.litellm/tiny_gateway.py")


class FakeResponse:
    def __init__(self, payload):
        self.status_code = 200
        self._payload = payload
        self.content = json.dumps(payload).encode("utf-8")
        self.headers = {"content-type": "application/json"}

    def json(self):
        return self._payload


class FakeAsyncClient:
    calls = []

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def request(self, method, url, headers=None, content=None):
        payload = json.loads((content or b"{}").decode("utf-8"))
        self.__class__.calls.append({"method": method, "url": url, "headers": headers or {}, "body": payload})
        return FakeResponse({
            "id": "msg_test",
            "type": "message",
            "role": "assistant",
            "model": payload.get("model"),
            "content": [{"type": "text", "text": "OK"}],
            "stop_reason": "end_turn",
            "stop_sequence": None,
            "usage": {"input_tokens": 1, "output_tokens": 1},
        })


def load_gateway():
    spec = importlib.util.spec_from_file_location("tiny_gateway_test_module", TINY_GATEWAY_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class GatewayObserveModeTests(unittest.TestCase):
    def test_observe_mode_does_not_rewrite_ambiguous_claude_family_request(self):
        with tempfile.TemporaryDirectory() as tmp:
            runtime_dir = Path(tmp)
            (runtime_dir / "ide-1.sessionid").write_text("claude-session-123", encoding="utf-8")
            (runtime_dir / "ide-1.cost").write_text(json.dumps({"model": "MiniMax-M2.7"}), encoding="utf-8")

            os.environ["CLAUDE_PROVIDER_SYNC_MODE"] = "observe"
            os.environ["CALDER_RUNTIME_DIR"] = str(runtime_dir)
            FakeAsyncClient.calls = []
            gateway = load_gateway()

            with patch.object(gateway.httpx, "AsyncClient", FakeAsyncClient):
                client = TestClient(gateway.app)
                response = client.post(
                    "/v1/messages",
                    headers={"X-Claude-Code-Session-Id": "claude-session-123"},
                    json={"model": "claude-haiku-4-5-20251001", "messages": []},
                )

            self.assertEqual(response.status_code, 200)
            self.assertEqual(FakeAsyncClient.calls[-1]["body"]["model"], "claude-haiku-4-5-20251001")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the integration test and verify it fails**

Run:

```bash
/Users/batuhanyuksel/.litellm/venv/bin/python3 -m unittest /Users/batuhanyuksel/.litellm/gateway_integration_test.py -v
```

Expected: FAIL because the gateway has no provider-sync observe mode yet.

- [ ] **Step 3: Add observe-mode routing hooks to the gateway**

Modify `/Users/batuhanyuksel/.litellm/tiny_gateway.py` so it:

- reads `X-Claude-Code-Session-Id` from request headers
- falls back to `metadata.user_id.session_id` when the header is absent
- loads runtime state from `CALDER_RUNTIME_DIR`
- keeps an in-memory registry keyed by Claude session id
- logs routing decisions
- does **not** rewrite models when `CLAUDE_PROVIDER_SYNC_MODE=observe`

Add these helpers near the top of the file:

```python
from pathlib import Path

from provider_sync import RouteState, detect_provider, resolve_request_model
from provider_sync_runtime import load_runtime_route_state

CALDER_RUNTIME_DIR = Path(os.environ.get("CALDER_RUNTIME_DIR", os.path.expanduser("~/.calder/runtime")))
CLAUDE_PROVIDER_SYNC_MODE = os.environ.get("CLAUDE_PROVIDER_SYNC_MODE", "observe").strip().lower() or "observe"
SESSION_REGISTRY: dict[str, RouteState] = {}


def extract_claude_session_id(request_headers: dict[str, str], body: bytes) -> str:
    header_value = request_headers.get("x-claude-code-session-id") or request_headers.get("X-Claude-Code-Session-Id")
    if isinstance(header_value, str) and header_value.strip():
        return header_value.strip()

    payload = parse_json_body(body) or {}
    metadata = payload.get("metadata")
    if not isinstance(metadata, dict):
        return ""
    raw_user_id = metadata.get("user_id")
    if not isinstance(raw_user_id, str):
        return ""
    try:
        decoded = json.loads(raw_user_id)
    except json.JSONDecodeError:
        return ""
    session_id = decoded.get("session_id")
    return session_id.strip() if isinstance(session_id, str) else ""


def current_route_state(session_id: str) -> Optional[RouteState]:
    if not session_id:
        return None
    runtime_state = load_runtime_route_state(session_id, CALDER_RUNTIME_DIR)
    if runtime_state is not None:
        SESSION_REGISTRY[session_id] = runtime_state
        return runtime_state
    return SESSION_REGISTRY.get(session_id)
```

Then update `proxy_request()` so that right after `model = parse_model(body)` it also computes:

```python
    session_id = extract_claude_session_id(dict(request.headers), body)
    active_state = current_route_state(session_id)
    route = resolve_request_model(model, active_state)

    if session_id and detect_provider(model) != "anthropic":
        SESSION_REGISTRY[session_id] = RouteState(
            active_provider=detect_provider(model),
            active_main_model=model,
        )

    effective_model = model
    effective_upstream = pick_upstream(model)

    if CLAUDE_PROVIDER_SYNC_MODE == "enforce" and route.rewritten:
        effective_model = route.model
        effective_upstream = route.provider
        body = set_request_model(body, effective_model)

    log(
        "provider-sync "
        f"mode={CLAUDE_PROVIDER_SYNC_MODE} "
        f"session={session_id or '-'} "
        f"incoming={model or '-'} "
        f"active_provider={(active_state.active_provider if active_state else 'unknown')} "
        f"resolved={route.model} "
        f"resolved_provider={route.provider} "
        f"rewritten={'yes' if CLAUDE_PROVIDER_SYNC_MODE == 'enforce' and route.rewritten else 'no'}"
    )
```

Also replace later `upstream = pick_upstream(model)` usages in `proxy_request()` with `upstream = effective_upstream`, and make sure the log line prints `effective_model`.

- [ ] **Step 4: Run the integration test and verify it passes**

Run:

```bash
/Users/batuhanyuksel/.litellm/venv/bin/python3 -m unittest /Users/batuhanyuksel/.litellm/gateway_integration_test.py -v
```

Expected: PASS, and the fake upstream receives the original `claude-haiku-4-5-20251001` model while mode is `observe`.

- [ ] **Step 5: Create a safety checkpoint**

Run:

```bash
STAMP="$(date +%Y%m%d-%H%M%S)-provider-sync-task3"
mkdir -p "/Users/batuhanyuksel/.litellm/checkpoints/$STAMP"
cp /Users/batuhanyuksel/.litellm/provider_sync.py "/Users/batuhanyuksel/.litellm/checkpoints/$STAMP/"
cp /Users/batuhanyuksel/.litellm/provider_sync_runtime.py "/Users/batuhanyuksel/.litellm/checkpoints/$STAMP/"
cp /Users/batuhanyuksel/.litellm/gateway_integration_test.py "/Users/batuhanyuksel/.litellm/checkpoints/$STAMP/"
cp /Users/batuhanyuksel/.litellm/tiny_gateway.py "/Users/batuhanyuksel/.litellm/checkpoints/$STAMP/"
printf '%s\n' "$STAMP" > /Users/batuhanyuksel/.litellm/checkpoints/LATEST_PROVIDER_SYNC_CHECKPOINT
```

Expected: new checkpoint contains the gateway and test harness.

## Task 4: Turn On Enforce-Mode Rewrites For Session-Relative Agent Traffic

**Files:**
- Modify: `/Users/batuhanyuksel/.litellm/gateway_integration_test.py`
- Modify: `/Users/batuhanyuksel/.litellm/tiny_gateway.py`

- [ ] **Step 1: Extend the integration tests for enforce mode**

Append these tests to `/Users/batuhanyuksel/.litellm/gateway_integration_test.py`:

```python
    def test_enforce_mode_rewrites_claude_family_request_to_zai_when_runtime_model_is_glm(self):
        with tempfile.TemporaryDirectory() as tmp:
            runtime_dir = Path(tmp)
            (runtime_dir / "ide-2.sessionid").write_text("claude-session-zai", encoding="utf-8")
            (runtime_dir / "ide-2.cost").write_text(json.dumps({"model": "glm-5.1"}), encoding="utf-8")

            os.environ["CLAUDE_PROVIDER_SYNC_MODE"] = "enforce"
            os.environ["CALDER_RUNTIME_DIR"] = str(runtime_dir)
            FakeAsyncClient.calls = []
            gateway = load_gateway()

            with patch.object(gateway.httpx, "AsyncClient", FakeAsyncClient):
                client = TestClient(gateway.app)
                response = client.post(
                    "/v1/messages",
                    headers={"X-Claude-Code-Session-Id": "claude-session-zai"},
                    json={"model": "claude-haiku-4-5-20251001", "messages": []},
                )

            self.assertEqual(response.status_code, 200)
            self.assertEqual(FakeAsyncClient.calls[-1]["body"]["model"], "glm-4.7")

    def test_enforce_mode_rewrites_claude_family_request_to_minimax_when_runtime_model_is_minimax(self):
        with tempfile.TemporaryDirectory() as tmp:
            runtime_dir = Path(tmp)
            (runtime_dir / "ide-3.sessionid").write_text("claude-session-mm", encoding="utf-8")
            (runtime_dir / "ide-3.cost").write_text(json.dumps({"model": "MiniMax-M2.7"}), encoding="utf-8")

            os.environ["CLAUDE_PROVIDER_SYNC_MODE"] = "enforce"
            os.environ["CALDER_RUNTIME_DIR"] = str(runtime_dir)
            FakeAsyncClient.calls = []
            gateway = load_gateway()

            with patch.object(gateway.httpx, "AsyncClient", FakeAsyncClient):
                client = TestClient(gateway.app)
                response = client.post(
                    "/v1/messages",
                    headers={"X-Claude-Code-Session-Id": "claude-session-mm"},
                    json={"model": "claude-sonnet-4-6", "messages": []},
                )

            self.assertEqual(response.status_code, 200)
            self.assertEqual(FakeAsyncClient.calls[-1]["body"]["model"], "MiniMax-M2.7")

    def test_enforce_mode_keeps_claude_when_runtime_model_is_claude(self):
        with tempfile.TemporaryDirectory() as tmp:
            runtime_dir = Path(tmp)
            (runtime_dir / "ide-4.sessionid").write_text("claude-session-cc", encoding="utf-8")
            (runtime_dir / "ide-4.cost").write_text(json.dumps({"model": "Claude Sonnet 4.6"}), encoding="utf-8")

            os.environ["CLAUDE_PROVIDER_SYNC_MODE"] = "enforce"
            os.environ["CALDER_RUNTIME_DIR"] = str(runtime_dir)
            FakeAsyncClient.calls = []
            gateway = load_gateway()

            with patch.object(gateway.httpx, "AsyncClient", FakeAsyncClient):
                client = TestClient(gateway.app)
                response = client.post(
                    "/v1/messages",
                    headers={"X-Claude-Code-Session-Id": "claude-session-cc"},
                    json={"model": "claude-sonnet-4-6", "messages": []},
                )

            self.assertEqual(response.status_code, 200)
            self.assertEqual(FakeAsyncClient.calls[-1]["body"]["model"], "claude-sonnet-4-6")
```

- [ ] **Step 2: Run the integration tests and verify they fail**

Run:

```bash
/Users/batuhanyuksel/.litellm/venv/bin/python3 -m unittest /Users/batuhanyuksel/.litellm/gateway_integration_test.py -v
```

Expected: FAIL because enforce-mode rewrites are not active yet.

- [ ] **Step 3: Activate enforce-mode rewriting in the gateway**

Adjust `/Users/batuhanyuksel/.litellm/tiny_gateway.py` so that:

- runtime sidecar state is preferred over registry state
- explicit `glm-*` and `MiniMax-*` requests refresh the registry
- `enforce` mode rewrites only when `route.rewritten` is `True`
- ambiguous `claude-*` requests still stay untouched when no state exists

Keep this exact rule block in `proxy_request()`:

```python
    session_id = extract_claude_session_id(dict(request.headers), body)
    active_state = current_route_state(session_id)
    route = resolve_request_model(model, active_state)

    if session_id and detect_provider(model) != "anthropic":
        SESSION_REGISTRY[session_id] = RouteState(
            active_provider=detect_provider(model),
            active_main_model=model,
        )

    effective_model = model
    effective_upstream = pick_upstream(model)

    if CLAUDE_PROVIDER_SYNC_MODE == "enforce" and route.rewritten:
        effective_model = route.model
        effective_upstream = route.provider
        body = set_request_model(body, effective_model)
```

Also make sure every later provider branch uses `effective_upstream` and every request log prints `effective_model`.

- [ ] **Step 4: Run the integration tests and verify they pass**

Run:

```bash
/Users/batuhanyuksel/.litellm/venv/bin/python3 -m unittest /Users/batuhanyuksel/.litellm/gateway_integration_test.py -v
```

Expected: PASS with observe-mode and enforce-mode coverage green.

- [ ] **Step 5: Create a safety checkpoint**

Run:

```bash
STAMP="$(date +%Y%m%d-%H%M%S)-provider-sync-task4"
mkdir -p "/Users/batuhanyuksel/.litellm/checkpoints/$STAMP"
cp /Users/batuhanyuksel/.litellm/provider_sync.py "/Users/batuhanyuksel/.litellm/checkpoints/$STAMP/"
cp /Users/batuhanyuksel/.litellm/provider_sync_runtime.py "/Users/batuhanyuksel/.litellm/checkpoints/$STAMP/"
cp /Users/batuhanyuksel/.litellm/gateway_integration_test.py "/Users/batuhanyuksel/.litellm/checkpoints/$STAMP/"
cp /Users/batuhanyuksel/.litellm/tiny_gateway.py "/Users/batuhanyuksel/.litellm/checkpoints/$STAMP/"
printf '%s\n' "$STAMP" > /Users/batuhanyuksel/.litellm/checkpoints/LATEST_PROVIDER_SYNC_CHECKPOINT
```

Expected: a restore-ready checkpoint exists before regression hardening.

## Task 5: Lock Current Provider-Specific Behavior With Regression Tests

**Files:**
- Modify: `/Users/batuhanyuksel/.litellm/provider_sync_test.py`
- Modify: `/Users/batuhanyuksel/.litellm/gateway_integration_test.py`
- Modify: `/Users/batuhanyuksel/.litellm/tiny_gateway.py`

- [ ] **Step 1: Add regression tests for pass-through and ambiguity safety**

Append these tests:

```python
    def test_explicit_glm_does_not_get_rewritten_when_runtime_state_is_claude(self):
        with tempfile.TemporaryDirectory() as tmp:
            runtime_dir = Path(tmp)
            (runtime_dir / "ide-5.sessionid").write_text("claude-session-explicit-zai", encoding="utf-8")
            (runtime_dir / "ide-5.cost").write_text(json.dumps({"model": "Claude Sonnet 4.6"}), encoding="utf-8")

            os.environ["CLAUDE_PROVIDER_SYNC_MODE"] = "enforce"
            os.environ["CALDER_RUNTIME_DIR"] = str(runtime_dir)
            FakeAsyncClient.calls = []
            gateway = load_gateway()

            with patch.object(gateway.httpx, "AsyncClient", FakeAsyncClient):
                client = TestClient(gateway.app)
                response = client.post(
                    "/v1/messages",
                    headers={"X-Claude-Code-Session-Id": "claude-session-explicit-zai"},
                    json={"model": "glm-5.1", "messages": []},
                )

            self.assertEqual(response.status_code, 200)
            self.assertEqual(FakeAsyncClient.calls[-1]["body"]["model"], "glm-5.1")

    def test_ambiguous_claude_family_request_without_sidecar_state_stays_claude_in_enforce_mode(self):
        with tempfile.TemporaryDirectory() as tmp:
            os.environ["CLAUDE_PROVIDER_SYNC_MODE"] = "enforce"
            os.environ["CALDER_RUNTIME_DIR"] = tmp
            FakeAsyncClient.calls = []
            gateway = load_gateway()

            with patch.object(gateway.httpx, "AsyncClient", FakeAsyncClient):
                client = TestClient(gateway.app)
                response = client.post(
                    "/v1/messages",
                    headers={"X-Claude-Code-Session-Id": "claude-session-ambiguous"},
                    json={"model": "claude-haiku-4-5-20251001", "messages": []},
                )

            self.assertEqual(response.status_code, 200)
            self.assertEqual(FakeAsyncClient.calls[-1]["body"]["model"], "claude-haiku-4-5-20251001")
```

- [ ] **Step 2: Run the regression tests and verify they fail if pass-through safety regressed**

Run:

```bash
/Users/batuhanyuksel/.litellm/venv/bin/python3 -m unittest /Users/batuhanyuksel/.litellm/provider_sync_test.py /Users/batuhanyuksel/.litellm/gateway_integration_test.py -v
```

Expected: FAIL until the gateway preserves pass-through and ambiguity safety correctly.

- [ ] **Step 3: Preserve current sanitization and fallback hooks while refactoring**

Do **not** rewrite these existing blocks out of the gateway:

- `sanitize_anthropic_request_body(...)`
- `strip_non_anthropic_thinking_blocks(...)`
- `request_zai_message(...)`
- `candidate_models(...)`

Keep these exact call sites alive after the routing changes:

```python
    if upstream == "anthropic":
        body = sanitize_anthropic_request_body(body)
```

```python
            try:
                upstream_response, message = await request_zai_message(client, method, target_url, headers, body)
```

```python
                message = strip_non_anthropic_thinking_blocks(message, "MiniMax")
```

This step is successful only if the new routing code wraps the current provider-specific logic instead of replacing it.

- [ ] **Step 4: Run the regression suite and verify it passes**

Run:

```bash
/Users/batuhanyuksel/.litellm/venv/bin/python3 -m unittest /Users/batuhanyuksel/.litellm/provider_sync_test.py /Users/batuhanyuksel/.litellm/provider_sync_runtime_test.py /Users/batuhanyuksel/.litellm/gateway_integration_test.py -v
```

Expected: PASS with all unit and integration tests green.

## Task 6: Flip The Wrapper Default And Run Live Smoke Verification

**Files:**
- Modify: `/Users/batuhanyuksel/.litellm/claude-gateway.sh`
- Modify: `/Users/batuhanyuksel/.litellm/tiny_gateway.py` (only if logs need final polish)

- [ ] **Step 1: Make enforce mode the wrapper default**

Modify `/Users/batuhanyuksel/.litellm/claude-gateway.sh` and export these two variables before the gateway starts:

```bash
export CALDER_RUNTIME_DIR="${CALDER_RUNTIME_DIR:-$HOME/.calder/runtime}"
export CLAUDE_PROVIDER_SYNC_MODE="${CLAUDE_PROVIDER_SYNC_MODE:-enforce}"
```

Keep them next to the existing gateway exports:

```bash
export ZAI_API_KEY
export MINIMAX_API_KEY
export CALDER_RUNTIME_DIR="${CALDER_RUNTIME_DIR:-$HOME/.calder/runtime}"
export CLAUDE_PROVIDER_SYNC_MODE="${CLAUDE_PROVIDER_SYNC_MODE:-enforce}"
export CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS="${CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS:-1}"
```

- [ ] **Step 2: Run the automated non-interactive smoke checks**

Run:

```bash
zsh -ic 'claude --no-session-persistence --model sonnet -p "Just reply OK."'
zsh -ic 'claude --no-session-persistence --model glm-5.1 -p "Just reply OK."'
zsh -ic 'claude --no-session-persistence --model MiniMax-M2.7 -p "Just reply OK."'
```

Expected:

- first command prints `OK` from Claude
- second prints `OK` from Z.ai
- third prints `OK` from MiniMax

- [ ] **Step 3: Run the interactive subagent smoke matrix inside Claude Code**

Open Claude Code three times and run these exact prompts:

1. Claude session
   - select `/model sonnet`
   - prompt: `Use the Explore subagent, find the name field in package.json and just write the value.`
2. Z.ai session
   - select `/model glm-5.1`
   - prompt: `Use the Explore subagent, find the name field in package.json and just write the value.`
3. MiniMax session
   - select `/model MiniMax-M2.7`
   - prompt: `Use the Explore subagent, find the name field in package.json and just write the value.`

In a separate terminal, watch the gateway log while running those prompts:

```bash
tail -f /Users/batuhanyuksel/.litellm/hybrid-gateway.log | rg "provider-sync|POST /v1/messages"
```

Expected:

- Claude session logs only resolve to Anthropic models
- Z.ai session logs show `resolved_provider=zai` and no escaped `upstream=anthropic` helper traffic for that session
- MiniMax session logs show `resolved_provider=minimax` and no escaped `upstream=anthropic` helper traffic for that session

- [ ] **Step 4: Record the rollback path before declaring success**

Run:

```bash
LATEST="$(cat /Users/batuhanyuksel/.litellm/checkpoints/LATEST_PROVIDER_SYNC_CHECKPOINT)"
cp "/Users/batuhanyuksel/.litellm/checkpoints/$LATEST/tiny_gateway.py" /Users/batuhanyuksel/.litellm/tiny_gateway.py
cp "/Users/batuhanyuksel/.litellm/checkpoints/$LATEST/provider_sync.py" /Users/batuhanyuksel/.litellm/provider_sync.py 2>/dev/null || true
cp "/Users/batuhanyuksel/.litellm/checkpoints/$LATEST/provider_sync_runtime.py" /Users/batuhanyuksel/.litellm/provider_sync_runtime.py 2>/dev/null || true
```

Expected: a known-good restore command exists and has already been validated syntactically.

## Self-Review

### Spec coverage

- Stable visible model UX: covered by Tasks 4 and 6.
- All subagents/helper agents follow active provider: covered by Tasks 3, 4, and 6.
- Explicit `glm-*` and `MiniMax-*` pass through unchanged: covered by Tasks 1 and 5.
- Z.ai fallback and thinking sanitization preserved: covered by Task 5.
- MiniMax thinking sanitization preserved: covered by Task 5.
- Safe rollout with observability first: covered by Tasks 3 and 6.

### Placeholder scan

- No `TBD`
- No `TODO`
- No “implement later”
- Every file path is absolute
- Every test/run step has an explicit command

### Type consistency

- `RouteState.active_provider` is always one of `anthropic | zai | minimax`
- `resolve_request_model()` always returns `ResolvedRoute`
- `load_runtime_route_state()` always returns `RouteState | None`
- Gateway session key is always the Claude session id from `X-Claude-Code-Session-Id` or the decoded `metadata.user_id.session_id`
