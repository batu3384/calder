import { getEvents, getCostDeltas } from '../../session-inspector-state.js';
import type { InspectorEvent } from '../../../shared/types/session.js';
import { inspectorState } from './session-inspector-state-ui.js';
import {
  emptyMessage,
  formatRelativeTime,
  formatDuration,
  badgeClass,
  badgeLabel,
  agentLabel,
  isAgentEvent,
  findAgentDuration,
  makeExpandable,
  createToolDetailEl,
  createAgentDetailEl,
  parseMcpToolName,
  isMcpToolEvent,
  renderInspectorEmpty,
} from './session-inspector-utils.js';

export interface AgentSpan {
  agentId: string;
  startIdx: number;
  stopIdx: number;          // events.length if still running
  isRunning: boolean;
  parentAgentId: string | null;
  childEventIndices: number[]; // sorted event indices belonging to this agent
}

export interface AgentModel {
  spans: Map<string, AgentSpan>;       // agentId → span
  eventOwner: Map<number, string>;     // event index → owning agentId
  stopIndices: Set<number>;            // all stop event indices (to skip in rendering)
  startToAgent: Map<number, string>;   // startIdx → agentId (for render dispatch)
}

interface TimelineRenderContext {
  events: InspectorEvent[];
  sessionStart: number;
  sessionId: string;
  deltaMap: Map<number, number>;
  model: AgentModel;
  renderedIndices: Set<number>;
}

/**
 * Build an agent model that pairs agent lifecycles by `agent_id` and assigns
 * child events based on each event's own `agent_id`.
 */
export function buildAgentModel(events: InspectorEvent[], startIdx: number): AgentModel {
  const spans = new Map<string, AgentSpan>();
  const startToAgent = new Map<number, string>();
  const openAgents = new Map<string, AgentSpan>();

  for (let i = startIdx; i < events.length; i++) {
    const ev = events[i];

    if (ev.type === 'subagent_start' && ev.agent_id) {
      const span: AgentSpan = {
        agentId: ev.agent_id,
        startIdx: i,
        stopIdx: events.length,
        isRunning: true,
        parentAgentId: null,
        childEventIndices: [],
      };
      spans.set(ev.agent_id, span);
      startToAgent.set(i, ev.agent_id);
      openAgents.set(ev.agent_id, span);
    } else if (ev.type === 'subagent_stop' && ev.agent_id) {
      const span = openAgents.get(ev.agent_id);
      if (span) {
        span.stopIdx = i;
        span.isRunning = false;
        openAgents.delete(ev.agent_id);
      }
    } else if (ev.agent_id) {
      const owner = spans.get(ev.agent_id);
      if (owner) {
        owner.childEventIndices.push(i);
      }
    }
  }

  for (const span of spans.values()) {
    span.childEventIndices.sort((a, b) => a - b);
  }

  const stopIndices = new Set<number>();
  const eventOwner = new Map<number, string>();
  for (const span of spans.values()) {
    if (!span.isRunning) stopIndices.add(span.stopIdx);
    for (const idx of span.childEventIndices) {
      eventOwner.set(idx, span.agentId);
    }
  }

  return { spans, eventOwner, stopIndices, startToAgent };
}

function appendLoadMoreNotice(list: HTMLElement, startIdx: number): void {
  if (startIdx <= 0) return;
  const loadMore = document.createElement('div');
  loadMore.className = 'inspector-load-more';
  loadMore.textContent = `${startIdx} earlier events not shown`;
  list.appendChild(loadMore);
}

function countVisibleChildEvents(events: InspectorEvent[], span: AgentSpan): number {
  let count = 0;
  for (const idx of span.childEventIndices) {
    if (events[idx].type !== 'status_update') count++;
  }
  return count;
}

function markAgentSpanRendered(span: AgentSpan, renderedIndices: Set<number>): void {
  renderedIndices.add(span.startIdx);
  if (!span.isRunning) {
    renderedIndices.add(span.stopIdx);
  }
  for (const idx of span.childEventIndices) {
    renderedIndices.add(idx);
  }
}

function maybeAutoExpandRunningGroup(sessionId: string, groupKey: string, isRunning: boolean): void {
  const autoExpandKey = `${sessionId}:${groupKey}`;
  if (
    isRunning
    && !inspectorState.expandedRows.has(groupKey)
    && !inspectorState.autoExpandedAgentGroups.has(autoExpandKey)
  ) {
    inspectorState.expandedRows.add(groupKey);
    inspectorState.autoExpandedAgentGroups.add(autoExpandKey);
  }
}

function setGroupToggleText(toggleEl: HTMLElement, groupKey: string): void {
  toggleEl.textContent = inspectorState.expandedRows.has(groupKey) ? '\u25BC' : '\u25B6';
}

function createAgentChildren(span: AgentSpan, context: TimelineRenderContext): HTMLElement {
  const children = document.createElement('div');
  children.className = 'inspector-agent-children';

  const startEvent = context.events[span.startIdx];
  children.appendChild(renderEventRow(span.startIdx, startEvent, context));
  for (const idx of span.childEventIndices) {
    children.appendChild(renderEventRow(idx, context.events[idx], context));
  }
  if (!span.isRunning) {
    children.appendChild(renderEventRow(span.stopIdx, context.events[span.stopIdx], context));
  }

  return children;
}

function toggleAgentGroup(group: HTMLElement, groupKey: string, toggleEl: HTMLElement, renderChildren: () => HTMLElement): void {
  if (inspectorState.expandedRows.has(groupKey)) {
    inspectorState.expandedRows.delete(groupKey);
  } else {
    inspectorState.expandedRows.add(groupKey);
  }
  setGroupToggleText(toggleEl, groupKey);
  const existing = group.querySelector('.inspector-agent-children');
  if (existing) {
    existing.remove();
    return;
  }
  group.appendChild(renderChildren());
}

function renderAgentGroup(agentId: string, parent: HTMLElement, context: TimelineRenderContext): void {
  const span = context.model.spans.get(agentId);
  if (!span) return;

  const startEvent = context.events[span.startIdx];
  const stopEvent = span.isRunning ? null : context.events[span.stopIdx];
  const duration = span.isRunning ? Date.now() - startEvent.timestamp : stopEvent!.timestamp - startEvent.timestamp;
  const childCount = countVisibleChildEvents(context.events, span);
  markAgentSpanRendered(span, context.renderedIndices);

  const group = document.createElement('div');
  group.className = 'inspector-agent-group';
  if (span.isRunning) {
    group.classList.add('inspector-agent-running');
  }

  const row = document.createElement('div');
  row.className = 'inspector-timeline-row inspector-agent-header';

  const timeEl = document.createElement('span');
  timeEl.className = 'inspector-time';
  timeEl.textContent = formatRelativeTime(startEvent.timestamp - context.sessionStart);

  const badge = document.createElement('span');
  badge.className = 'inspector-badge inspector-badge-agent';
  badge.textContent = span.isRunning ? 'Agent\u2026' : 'Agent';

  const groupKey = `agent-group:${agentId}`;
  maybeAutoExpandRunningGroup(context.sessionId, groupKey, span.isRunning);

  const toggleEl = document.createElement('span');
  toggleEl.className = 'inspector-agent-toggle';
  setGroupToggleText(toggleEl, groupKey);

  const desc = document.createElement('span');
  desc.className = 'inspector-desc';
  const parts = [agentLabel(startEvent), formatDuration(duration)];
  if (childCount > 0) {
    parts.push(`${childCount} action${childCount !== 1 ? 's' : ''}`);
  }
  desc.textContent = parts.join(' \u00B7 ');

  row.appendChild(timeEl);
  row.appendChild(badge);
  row.appendChild(toggleEl);
  row.appendChild(desc);
  group.appendChild(row);

  const renderChildren = () => createAgentChildren(span, context);
  if (inspectorState.expandedRows.has(groupKey)) {
    group.appendChild(renderChildren());
  }

  row.addEventListener('click', () => {
    toggleAgentGroup(group, groupKey, toggleEl, renderChildren);
  });

  parent.appendChild(group);
}

function shouldSkipEvent(index: number, event: InspectorEvent, context: TimelineRenderContext): boolean {
  if (context.renderedIndices.has(index)) return true;
  if (event.type === 'status_update') return true;
  if (context.model.stopIndices.has(index)) return true;
  return false;
}

function renderEventsRange(from: number, to: number, parent: HTMLElement, context: TimelineRenderContext): void {
  for (let i = from; i < to; i++) {
    const event = context.events[i];
    if (shouldSkipEvent(i, event, context)) continue;

    const agentId = context.model.startToAgent.get(i);
    if (event.type === 'subagent_start' && agentId && context.model.spans.has(agentId)) {
      renderAgentGroup(agentId, parent, context);
      continue;
    }

    parent.appendChild(renderEventRow(i, event, context));
  }
}

export function describeTimelineEvent(
  event: InspectorEvent,
  events: InspectorEvent[],
  index: number,
  toolLabel?: string,
): string {
  if (event.tool_name) return toolLabel ?? event.tool_name;
  if (event.type === 'user_prompt') return 'User prompt submitted';
  if (event.type === 'stop') return 'Response completed';
  if (event.type === 'stop_failure') return event.error || 'Response stopped with error';
  if (event.type === 'session_start') return 'Session started';
  if (event.type === 'session_end') return 'Session ended';
  if (event.type === 'permission_request') return 'Waiting for permission';
  if (event.type === 'approval_decision') {
    const decision = event.auto_approval?.decision ?? 'ask';
    const operationClass = event.auto_approval?.operation_class
      ? event.auto_approval.operation_class.replace(/_/g, ' ')
      : 'unknown operation';
    return `Auto-approval ${decision}: ${operationClass}`;
  }
  if (event.type === 'subagent_start') return `Agent started: ${agentLabel(event)}`;
  if (event.type === 'subagent_stop') {
    const duration = findAgentDuration(events, index);
    return duration
      ? `Agent stopped: ${agentLabel(event)} (${formatDuration(duration)})`
      : `Agent stopped: ${agentLabel(event)}`;
  }
  if (event.type === 'notification') return event.message || 'Notification';
  if (event.type === 'pre_compact') return 'Context compaction starting';
  if (event.type === 'post_compact') return 'Context compaction complete';
  if (event.type === 'task_created') return event.task_id ? `Task created: ${event.task_id}` : 'Task created';
  if (event.type === 'task_completed') return event.task_id ? `Task completed: ${event.task_id}` : 'Task completed';
  if (event.type === 'worktree_create') return event.worktree_path || 'Worktree created';
  if (event.type === 'worktree_remove') return event.worktree_path || 'Worktree removed';
  if (event.type === 'cwd_changed') return event.cwd || 'Working directory changed';
  if (event.type === 'file_changed') return event.file_path || 'File changed';
  if (event.type === 'config_change') return event.config_key ? `Config: ${event.config_key}` : 'Config changed';
  if (event.type === 'elicitation') return event.question || 'Elicitation requested';
  if (event.type === 'elicitation_result') return 'Elicitation answered';
  if (event.type === 'instructions_loaded') return 'Instructions loaded';
  if (event.type === 'teammate_idle') return `Teammate idle: ${agentLabel(event)}`;
  return '';
}

export function buildApprovalDecisionMetaText(event: InspectorEvent): string | null {
  if (event.type !== 'approval_decision' || !event.auto_approval) {
    return null;
  }
  const details: string[] = [
    `Mode: ${event.auto_approval.effective_mode}`,
    `Source: ${event.auto_approval.policy_source}`,
  ];
  if (event.auto_approval.reason) {
    details.push(`Reason: ${event.auto_approval.reason}`);
  }
  return details.join(' · ');
}

function renderEventRow(index: number, event: InspectorEvent, context: TimelineRenderContext): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'inspector-timeline-row';

  const timeEl = document.createElement('span');
  timeEl.className = 'inspector-time';
  timeEl.textContent = formatRelativeTime(event.timestamp - context.sessionStart);

  const badge = document.createElement('span');
  badge.className = `inspector-badge inspector-badge-${badgeClass(event.type)}`;
  badge.textContent = badgeLabel(event.type);

  const mcpTool = parseMcpToolName(event.tool_name);
  const showMcpBadge = mcpTool && isMcpToolEvent(event);
  const mcpBadge = showMcpBadge ? document.createElement('span') : null;
  if (mcpBadge) {
    mcpBadge.className = 'inspector-badge inspector-badge-mcp';
    mcpBadge.textContent = 'MCP';
  }

  const desc = document.createElement('span');
  desc.className = 'inspector-desc';
  desc.textContent = describeTimelineEvent(event, context.events, index, mcpTool?.displayLabel);

  const durationEl = document.createElement('span');
  durationEl.className = 'inspector-duration';
  if (index < context.events.length - 1) {
    const durationMs = context.events[index + 1].timestamp - event.timestamp;
    durationEl.textContent = formatDuration(durationMs);
  }

  const costEl = document.createElement('span');
  costEl.className = 'inspector-cost-delta';
  const delta = context.deltaMap.get(index);
  if (delta !== undefined && delta > 0) {
    costEl.textContent = `+$${delta.toFixed(4)}`;
  }

  row.appendChild(timeEl);
  row.appendChild(badge);
  if (mcpBadge) {
    row.appendChild(mcpBadge);
  }
  row.appendChild(desc);
  row.appendChild(durationEl);
  row.appendChild(costEl);

  const approvalMeta = buildApprovalDecisionMetaText(event);
  if (approvalMeta) {
    const metaEl = document.createElement('div');
    metaEl.className = 'inspector-meta-text';
    metaEl.textContent = approvalMeta;
    row.appendChild(metaEl);
  }

  if (event.tool_input) {
    makeExpandable(
      row,
      `${event.timestamp}:${event.type}:${event.tool_name || ''}`,
      '.inspector-tool-detail',
      () => createToolDetailEl(event.tool_input!, mcpTool?.rawToolName),
    );
  }

  if (isAgentEvent(event)) {
    const duration = event.type === 'subagent_stop' ? findAgentDuration(context.events, index) : null;
    makeExpandable(
      row,
      `${event.timestamp}:${event.type}:${event.agent_id || ''}`,
      '.inspector-agent-detail',
      () => createAgentDetailEl(event, duration),
    );
  }

  if (event.error) {
    const errorEl = document.createElement('div');
    errorEl.className = 'inspector-error-text';
    errorEl.textContent = event.error.length > 200 ? event.error.slice(0, 200) + '...' : event.error;
    row.appendChild(errorEl);
  }

  return row;
}

function applyTimelineAutoScroll(container: HTMLElement): void {
  if (!inspectorState.autoScroll) return;
  requestAnimationFrame(() => {
    inspectorState.programmaticScroll = true;
    container.scrollTop = container.scrollHeight;
    inspectorState.programmaticScroll = false;
  });
}

export function renderTimeline(container: HTMLElement): void {
  const sessionId = inspectorState.inspectedSessionId!;
  const events = getEvents(sessionId);
  if (events.length === 0) {
    renderInspectorEmpty(container, emptyMessage('No events yet'));
    return;
  }

  const list = document.createElement('div');
  list.className = 'inspector-timeline';

  const startIdx = Math.max(0, events.length - 500);
  appendLoadMoreNotice(list, startIdx);

  const costDeltas = getCostDeltas(sessionId);
  const context: TimelineRenderContext = {
    events,
    sessionStart: events[0].timestamp,
    sessionId,
    deltaMap: new Map(costDeltas.map((delta) => [delta.index, delta.delta])),
    model: buildAgentModel(events, startIdx),
    renderedIndices: new Set<number>(),
  };

  renderEventsRange(startIdx, events.length, list, context);
  container.appendChild(list);
  applyTimelineAutoScroll(container);
}
