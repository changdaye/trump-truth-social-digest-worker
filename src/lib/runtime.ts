export interface RuntimeState {
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastHeartbeatAt?: string;
  lastAlertAt?: string;
  lastError?: string;
  consecutiveFailures: number;
}

const RUNTIME_STATE_KEY = "runtime-state";

export async function getRuntimeState(kv: KVNamespace): Promise<RuntimeState> {
  return (await kv.get<RuntimeState>(RUNTIME_STATE_KEY, "json")) ?? { consecutiveFailures: 0 };
}

export async function setRuntimeState(kv: KVNamespace, state: RuntimeState): Promise<void> {
  await kv.put(RUNTIME_STATE_KEY, JSON.stringify(state));
}

export function recordSuccess(state: RuntimeState, now: Date): RuntimeState {
  return {
    ...state,
    consecutiveFailures: 0,
    lastSuccessAt: now.toISOString(),
    lastError: undefined
  };
}

export function recordFailure(state: RuntimeState, error: string, now: Date): RuntimeState {
  return {
    ...state,
    consecutiveFailures: state.consecutiveFailures + 1,
    lastFailureAt: now.toISOString(),
    lastError: error
  };
}

export function shouldSendHeartbeat(state: RuntimeState, intervalHours: number, now: Date): boolean {
  if (!state.lastHeartbeatAt) return true;
  return now.getTime() - new Date(state.lastHeartbeatAt).getTime() >= intervalHours * 60 * 60 * 1000;
}

export function shouldSendFailureAlert(
  state: RuntimeState,
  threshold: number,
  cooldownMinutes: number,
  now: Date
): boolean {
  if (state.consecutiveFailures < threshold) return false;
  if (!state.lastAlertAt) return true;
  return now.getTime() - new Date(state.lastAlertAt).getTime() >= cooldownMinutes * 60 * 1000;
}
