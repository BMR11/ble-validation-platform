import { useCallback, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useDroppable,
  type CollisionDetection,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  charSortableId,
  dragKind,
  findServiceIdForChar,
  findStateIdForTransition,
  moveCharBy,
  moveCharacteristic,
  moveServiceBy,
  moveStateBy,
  moveTransition,
  moveTransitionBy,
  reorderServices,
  reorderStates,
  serviceDropId,
  serviceSortableId,
  stateDropId,
  stateSortableId,
  transitionSortableId,
} from './builderDnD';

type CharRow = { localId: string; data: Record<string, unknown> };
type ServiceRow = { localId: string; serviceData: Record<string, unknown>; characteristics: CharRow[] };
type TransitionRow = { localId: string; data: Record<string, unknown> };
type StateMachineStateRow = {
  localId: string;
  stateKey: string;
  stateData: Record<string, unknown>;
  transitions: TransitionRow[];
};

type MoveDelta = -1 | 1;

type DragSnapshot = {
  services: ServiceRow[];
  states: StateMachineStateRow[];
};

function genLocalId(): string {
  return `k_${Math.random().toString(36).slice(2, 12)}`;
}

function safeParseDoc(json: string): Record<string, unknown> {
  try {
    const d = JSON.parse(json) as unknown;
    if (d && typeof d === 'object' && !Array.isArray(d)) {
      return d as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return {
    id: '',
    name: '',
    version: '1.0',
    description: '',
    advertising: { localName: '' },
    services: [],
  };
}

function rowsFromDoc(doc: Record<string, unknown>): ServiceRow[] {
  const raw = doc.services;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return {
        localId: genLocalId(),
        serviceData: { uuid: '', name: '', primary: true },
        characteristics: [],
      };
    }
    const obj = item as Record<string, unknown>;
    const ch = Array.isArray(obj.characteristics) ? obj.characteristics : [];
    const characteristics: CharRow[] = ch.map((c) => ({
      localId: genLocalId(),
      data:
        c && typeof c === 'object' && !Array.isArray(c)
          ? { ...(c as Record<string, unknown>) }
          : { uuid: '', name: '' },
    }));
    const { characteristics: _omit, ...serviceData } = obj;
    return {
      localId: genLocalId(),
      serviceData: { ...serviceData },
      characteristics,
    };
  });
}

function rowsToServices(rows: ServiceRow[]): unknown[] {
  return rows.map((r) => ({
    ...r.serviceData,
    characteristics: r.characteristics.map((c) => ({ ...c.data })),
  }));
}

function parseStateMachine(sm: unknown): { initial: string; rows: StateMachineStateRow[] } {
  if (!sm || typeof sm !== 'object' || Array.isArray(sm)) {
    return { initial: 'idle', rows: [] };
  }
  const obj = sm as Record<string, unknown>;
  const initial = String(obj.initial ?? 'idle');
  const states = obj.states;
  if (!states || typeof states !== 'object' || Array.isArray(states)) {
    return { initial, rows: [] };
  }
  const rows: StateMachineStateRow[] = [];
  for (const [stateKey, def] of Object.entries(states as Record<string, unknown>)) {
    if (!def || typeof def !== 'object' || Array.isArray(def)) {
      continue;
    }
    const d = def as Record<string, unknown>;
    const tr = Array.isArray(d.transitions) ? d.transitions : [];
    const transitions: TransitionRow[] = tr.map((t) => ({
      localId: genLocalId(),
      data:
        t && typeof t === 'object' && !Array.isArray(t)
          ? { ...(t as Record<string, unknown>) }
          : { to: '', trigger: { type: 'manual' } },
    }));
    const { transitions: _omit, ...stateData } = d;
    rows.push({
      localId: genLocalId(),
      stateKey,
      stateData: { ...stateData },
      transitions,
    });
  }
  return { initial, rows };
}

function stateRowsToMachine(
  initial: string,
  rows: StateMachineStateRow[]
): Record<string, unknown> {
  const states: Record<string, unknown> = {};
  for (const r of rows) {
    const key = r.stateKey.trim() || `state_${r.localId.slice(2)}`;
    states[key] = {
      ...r.stateData,
      transitions: r.transitions.map((t) => ({ ...t.data })),
    };
  }
  const init = initial.trim() || (rows[0] ? rows[0].stateKey.trim() || `state_${rows[0].localId.slice(2)}` : 'idle');
  return { initial: init, states };
}

function emitDoc(
  root: Record<string, unknown>,
  rows: ServiceRow[],
  advertising: { localName: string; deviceName: string },
  advertisingSeed: unknown,
  smInitial: string,
  smRows: StateMachineStateRow[]
): string {
  let adv: Record<string, unknown> = {};
  if (advertisingSeed && typeof advertisingSeed === 'object' && !Array.isArray(advertisingSeed)) {
    adv = { ...(advertisingSeed as Record<string, unknown>) };
  }
  if (advertising.localName.trim()) {
    adv.localName = advertising.localName.trim();
  } else {
    delete adv.localName;
  }
  if (advertising.deviceName.trim()) {
    adv.deviceName = advertising.deviceName.trim();
  } else {
    delete adv.deviceName;
  }
  const next: Record<string, unknown> = {
    ...root,
    advertising: adv,
    services: rowsToServices(rows),
  };
  if (smRows.length > 0) {
    next.stateMachine = stateRowsToMachine(smInitial, smRows);
  } else {
    delete next.stateMachine;
  }
  return JSON.stringify(next, null, 2);
}

const PROP_OPTIONS = ['read', 'write', 'notify', 'writeWithoutResponse'] as const;

const TRIGGER_TYPES = ['manual', 'onSubscribe', 'onUnsubscribe', 'onWrite', 'timer'] as const;

function defaultTrigger(type: string): Record<string, unknown> {
  switch (type) {
    case 'onSubscribe':
      return { type: 'onSubscribe' };
    case 'onUnsubscribe':
      return { type: 'onUnsubscribe' };
    case 'onWrite':
      return { type: 'onWrite', characteristicUUID: '' };
    case 'timer':
      return { type: 'timer', delayMs: 5000 };
    default:
      return { type: 'manual' };
  }
}

function readTrigger(data: Record<string, unknown>): Record<string, unknown> {
  const t = data.trigger;
  if (t && typeof t === 'object' && !Array.isArray(t)) {
    return { ...(t as Record<string, unknown>) };
  }
  return { type: 'manual' };
}

const PROP_LABEL: Record<(typeof PROP_OPTIONS)[number], string> = {
  read: 'Read',
  write: 'Write',
  notify: 'Notify',
  writeWithoutResponse: 'Write without response',
};

const TRIGGER_LABEL: Record<(typeof TRIGGER_TYPES)[number], string> = {
  manual: 'Manual',
  onSubscribe: 'On subscribe',
  onUnsubscribe: 'On unsubscribe',
  onWrite: 'On write',
  timer: 'Timer',
};

function cx(...parts: Array<string | false>): string {
  return parts.filter((part) => part !== false).join(' ');
}

function countPhrase(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function confirmRemove(name: string, count: number, singular: string, plural: string): boolean {
  return window.confirm(`Remove "${name}" and its ${countPhrase(count, singular, plural)}?`);
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function shortUuid(uuid: string): string {
  const trimmed = uuid.trim();
  if (!trimmed) return 'No UUID';
  if (trimmed.length <= 8) return trimmed;
  return `${trimmed.slice(0, 8)}…`;
}

function serviceTitle(row: ServiceRow): string {
  const name = String(row.serviceData.name ?? '').trim();
  return name || 'Untitled service';
}

function serviceSubtitle(row: ServiceRow): string {
  return `${shortUuid(String(row.serviceData.uuid ?? ''))} · ${countPhrase(row.characteristics.length, 'characteristic', 'characteristics')}`;
}

function charTitle(row: CharRow): string {
  const name = String(row.data.name ?? '').trim();
  return name || 'Untitled characteristic';
}

function propertiesSubtitle(data: Record<string, unknown>): string {
  const raw = stringList(data.properties);
  const known = PROP_OPTIONS.filter((prop) => raw.includes(prop)).map((prop) => PROP_LABEL[prop]);
  const extra = raw.filter((prop) => !(PROP_OPTIONS as readonly string[]).includes(prop));
  const labels = [...known, ...extra];
  return labels.length > 0 ? labels.join(', ') : 'No properties';
}

function stateTitle(row: StateMachineStateRow): string {
  const name = String(row.stateData.name ?? '').trim();
  return name || row.stateKey.trim() || 'Untitled state';
}

function stateSubtitle(row: StateMachineStateRow): string {
  const id = row.stateKey.trim() || 'No id';
  return `${id} · ${countPhrase(row.transitions.length, 'transition', 'transitions')}`;
}

function stateOptionLabel(row: StateMachineStateRow): string {
  const name = String(row.stateData.name ?? '').trim() || 'Untitled';
  return `${row.stateKey} — ${name}`;
}

function transitionTitle(row: TransitionRow): string {
  const label = String(row.data.label ?? '').trim();
  if (label) return label;
  const to = String(row.data.to ?? '').trim();
  return to ? `To ${to}` : 'To (unset)';
}

function displayedTriggerType(data: Record<string, unknown>): string {
  const trig = readTrigger(data);
  const type = typeof trig.type === 'string' ? trig.type : 'manual';
  return (TRIGGER_TYPES as readonly string[]).includes(type) ? type : 'manual';
}

function triggerPlain(data: Record<string, unknown>): string {
  const type = displayedTriggerType(data);
  if ((TRIGGER_TYPES as readonly string[]).includes(type)) {
    return TRIGGER_LABEL[type as (typeof TRIGGER_TYPES)[number]];
  }
  return type;
}

function duplicateStateKeySet(rows: StateMachineStateRow[]): Set<string> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = row.stateKey.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const dupes = new Set<string>();
  for (const [key, count] of counts) {
    if (count > 1) dupes.add(key);
  }
  return dupes;
}

function initialExpanded(services: ServiceRow[], states: StateMachineStateRow[]): Set<string> {
  const open = new Set<string>();
  if (services.length < 2) {
    for (const service of services) open.add(serviceSortableId(service.localId));
  }
  for (const service of services) {
    if (service.characteristics.length < 2) {
      for (const characteristic of service.characteristics) open.add(charSortableId(characteristic.localId));
    }
  }
  if (states.length < 2) {
    for (const state of states) open.add(stateSortableId(state.localId));
  }
  for (const state of states) {
    if (state.transitions.length < 2) {
      for (const transition of state.transitions) open.add(transitionSortableId(transition.localId));
    }
  }
  return open;
}

function charLocalIdFromId(rows: ServiceRow[], id: string): string | null {
  for (const service of rows) {
    for (const characteristic of service.characteristics) {
      if (id === characteristic.localId || id === charSortableId(characteristic.localId)) {
        return characteristic.localId;
      }
    }
  }
  return null;
}

function transitionLocalIdFromId(rows: StateMachineStateRow[], id: string): string | null {
  for (const state of rows) {
    for (const transition of state.transitions) {
      if (id === transition.localId || id === transitionSortableId(transition.localId)) {
        return transition.localId;
      }
    }
  }
  return null;
}

function normalizeServiceLocalId(rows: ServiceRow[], id: string | null | undefined): string | null {
  if (!id) return null;
  for (const row of rows) {
    if (id === row.localId || id === serviceSortableId(row.localId) || id === serviceDropId(row.localId)) {
      return row.localId;
    }
  }
  return null;
}

function normalizeStateLocalId(rows: StateMachineStateRow[], id: string | null | undefined): string | null {
  if (!id) return null;
  for (const row of rows) {
    if (id === row.localId || id === stateSortableId(row.localId) || id === stateDropId(row.localId)) {
      return row.localId;
    }
  }
  return null;
}

function destinationServiceId(rows: ServiceRow[], overId: string): string | null {
  for (const row of rows) {
    if (overId === serviceSortableId(row.localId) || overId === serviceDropId(row.localId)) {
      return row.localId;
    }
  }
  const charLocal = charLocalIdFromId(rows, overId);
  if (!charLocal) return null;
  return normalizeServiceLocalId(rows, findServiceIdForChar(rows, charLocal));
}

function destinationStateId(rows: StateMachineStateRow[], overId: string): string | null {
  for (const row of rows) {
    if (overId === stateSortableId(row.localId) || overId === stateDropId(row.localId)) {
      return row.localId;
    }
  }
  const transLocal = transitionLocalIdFromId(rows, overId);
  if (!transLocal) return null;
  return normalizeStateLocalId(rows, findStateIdForTransition(rows, transLocal));
}

function collisionRank(activeKind: ReturnType<typeof dragKind>, overId: string): number {
  const overKind = dragKind(overId);
  if (activeKind === 'char') {
    if (overKind === 'char') return 0;
    if (overKind === 'service-drop') return 1;
    if (overKind === 'service') return 2;
    return 9;
  }
  if (activeKind === 'transition') {
    if (overKind === 'transition') return 0;
    if (overKind === 'state-drop') return 1;
    if (overKind === 'state') return 2;
    return 9;
  }
  if (activeKind === 'service') {
    if (overKind === 'service') return 0;
    if (overKind === 'char' || overKind === 'service-drop') return 1;
    return 9;
  }
  if (activeKind === 'state') {
    if (overKind === 'state') return 0;
    if (overKind === 'transition' || overKind === 'state-drop') return 1;
    return 9;
  }
  return 5;
}

// Tall cards make corner-distance collision pick the parent container. Prefer the
// droppable actually under the pointer, then the most specific kind for this drag.
const builderCollision: CollisionDetection = (args) => {
  const activeKind = dragKind(String(args.active.id));
  const pointerHits = pointerWithin(args);
  const hits = pointerHits.length > 0 ? pointerHits : closestCorners(args);
  if (hits.length <= 1) return hits;
  const ranked = [...hits].sort(
    (a, b) => collisionRank(activeKind, String(a.id)) - collisionRank(activeKind, String(b.id))
  );
  const best = collisionRank(activeKind, String(ranked[0].id));
  return ranked.filter((hit) => collisionRank(activeKind, String(hit.id)) === best);
};

function isServiceTreeId(id: string): boolean {
  const kind = dragKind(id);
  return kind === 'service' || kind === 'char' || kind === 'service-drop';
}

function isStateTreeId(id: string): boolean {
  const kind = dragKind(id);
  return kind === 'state' || kind === 'transition' || kind === 'state-drop';
}

function serviceOrderChanged(a: ServiceRow[], b: ServiceRow[]): boolean {
  if (a === b) return false;
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].localId !== b[i].localId) return true;
    const left = a[i].characteristics;
    const right = b[i].characteristics;
    if (left.length !== right.length) return true;
    for (let j = 0; j < left.length; j += 1) {
      if (left[j].localId !== right[j].localId) return true;
    }
  }
  return false;
}

function stateOrderChanged(a: StateMachineStateRow[], b: StateMachineStateRow[]): boolean {
  if (a === b) return false;
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].localId !== b[i].localId) return true;
    const left = a[i].transitions;
    const right = b[i].transitions;
    if (left.length !== right.length) return true;
    for (let j = 0; j < left.length; j += 1) {
      if (left[j].localId !== right[j].localId) return true;
    }
  }
  return false;
}

function cardClassName(isOver: boolean, isDragging: boolean): string {
  return cx('builder-card', isOver && !isDragging && 'is-over', isDragging && 'is-dragging');
}

function overlayCopy(
  id: string,
  services: ServiceRow[],
  states: StateMachineStateRow[]
): { kind: string; name: string } | null {
  const kind = dragKind(id);
  if (kind === 'service') {
    const row = services.find((service) => serviceSortableId(service.localId) === id);
    return row ? { kind: 'Service', name: serviceTitle(row) } : null;
  }
  if (kind === 'char') {
    for (const service of services) {
      const characteristic = service.characteristics.find((item) => charSortableId(item.localId) === id);
      if (characteristic) return { kind: 'Characteristic', name: charTitle(characteristic) };
    }
    return null;
  }
  if (kind === 'state') {
    const row = states.find((state) => stateSortableId(state.localId) === id);
    return row ? { kind: 'State', name: stateTitle(row) } : null;
  }
  if (kind === 'transition') {
    for (const state of states) {
      const transition = state.transitions.find((item) => transitionSortableId(item.localId) === id);
      if (transition) return { kind: 'Transition', name: transitionTitle(transition) };
    }
    return null;
  }
  return null;
}

function GripIcon() {
  return (
    <svg width="14" height="18" viewBox="0 0 14 18" aria-hidden="true" focusable="false">
      <circle cx="4" cy="3" r="1.3" fill="currentColor" />
      <circle cx="10" cy="3" r="1.3" fill="currentColor" />
      <circle cx="4" cy="9" r="1.3" fill="currentColor" />
      <circle cx="10" cy="9" r="1.3" fill="currentColor" />
      <circle cx="4" cy="15" r="1.3" fill="currentColor" />
      <circle cx="10" cy="15" r="1.3" fill="currentColor" />
    </svg>
  );
}

function DropHint({ id, label }: { id: string; label: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cx('builder-empty', isOver && 'is-over')}>
      {label}
    </div>
  );
}

function CardHeader({
  title,
  subtitle,
  expanded,
  onToggle,
  badge,
  disableUp,
  disableDown,
  onMoveUp,
  onMoveDown,
  onRemove,
  attributes,
  listeners,
}: {
  title: string;
  subtitle: string;
  expanded: boolean;
  onToggle: () => void;
  badge?: string;
  disableUp: boolean;
  disableDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  attributes: ReturnType<typeof useSortable>['attributes'];
  listeners: ReturnType<typeof useSortable>['listeners'];
}) {
  return (
    <div className="builder-header">
      <button
        type="button"
        className="builder-grip"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder or move"
      >
        <GripIcon />
      </button>
      <button
        type="button"
        className="builder-title-btn"
        onClick={onToggle}
        aria-expanded={expanded}
        title={`${title}. ${subtitle}`}
      >
        <span className="builder-title-line">
          <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
          <span className="builder-title-label">{title}</span>
        </span>
        <span className="builder-subtitle">{subtitle}</span>
      </button>
      {badge ? <span className="builder-badge">{badge}</span> : null}
      <div className="builder-actions">
        <button
          type="button"
          className="btn btn-ghost builder-icon-btn"
          aria-label="Move up"
          disabled={disableUp}
          onClick={onMoveUp}
        >
          Up
        </button>
        <button
          type="button"
          className="btn btn-ghost builder-icon-btn"
          aria-label="Move down"
          disabled={disableDown}
          onClick={onMoveDown}
        >
          Down
        </button>
        <button type="button" className="btn btn-ghost builder-icon-btn" onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  );
}

function SortableCharCard({
  row,
  expanded,
  disableUp,
  disableDown,
  onToggle,
  onMove,
  onRemove,
  onPatch,
}: {
  row: CharRow;
  expanded: boolean;
  disableUp: boolean;
  disableDown: boolean;
  onToggle: () => void;
  onMove: (delta: MoveDelta) => void;
  onRemove: () => void;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({
    id: charSortableId(row.localId),
    animateLayoutChanges: () => false,
  });
  const uuid = String(row.data.uuid ?? '');
  const name = String(row.data.name ?? '');
  const propsArr = stringList(row.data.properties);
  const title = charTitle(row);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cardClassName(isOver, isDragging)}
    >
      <CardHeader
        title={title}
        subtitle={propertiesSubtitle(row.data)}
        expanded={expanded}
        onToggle={onToggle}
        disableUp={disableUp}
        disableDown={disableDown}
        onMoveUp={() => onMove(-1)}
        onMoveDown={() => onMove(1)}
        onRemove={onRemove}
        attributes={attributes}
        listeners={listeners}
      />
      {expanded && (
        <div className="builder-body">
          <div className="field">
            <label>UUID</label>
            <input
              value={uuid}
              onChange={(e) => onPatch({ uuid: e.target.value })}
              spellCheck={false}
              className="code"
            />
          </div>
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={(e) => onPatch({ name: e.target.value })} />
          </div>
          <div className="field">
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              Properties
            </span>
            <div className="builder-prop-grid">
              {PROP_OPTIONS.map((prop) => (
                <label key={prop} className="builder-check">
                  <input
                    type="checkbox"
                    checked={propsArr.includes(prop)}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...propsArr, prop]
                        : propsArr.filter((item) => item !== prop);
                      onPatch({ properties: next });
                    }}
                  />
                  {PROP_LABEL[prop]}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SortableServiceCard({
  row,
  expanded,
  disableUp,
  disableDown,
  onToggle,
  onMove,
  onRemove,
  onPatchService,
  onAddChar,
  onPatchChar,
  onRemoveChar,
  onMoveChar,
}: {
  row: ServiceRow;
  expanded: Set<string>;
  disableUp: boolean;
  disableDown: boolean;
  onToggle: (id: string) => void;
  onMove: (delta: MoveDelta) => void;
  onRemove: () => void;
  onPatchService: (patch: Record<string, unknown>) => void;
  onAddChar: () => void;
  onPatchChar: (charLocalId: string, patch: Record<string, unknown>) => void;
  onRemoveChar: (charLocalId: string) => void;
  onMoveChar: (serviceLocalId: string, charLocalId: string, delta: MoveDelta) => void;
}) {
  const id = serviceSortableId(row.localId);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({ id });
  const open = expanded.has(id);
  const suuid = String(row.serviceData.uuid ?? '');
  const sname = String(row.serviceData.name ?? '');
  const primary = Boolean(row.serviceData.primary ?? true);
  const charIds = row.characteristics.map((characteristic) => charSortableId(characteristic.localId));

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cardClassName(isOver, isDragging)}
    >
      <CardHeader
        title={serviceTitle(row)}
        subtitle={serviceSubtitle(row)}
        expanded={open}
        onToggle={() => onToggle(id)}
        disableUp={disableUp}
        disableDown={disableDown}
        onMoveUp={() => onMove(-1)}
        onMoveDown={() => onMove(1)}
        onRemove={onRemove}
        attributes={attributes}
        listeners={listeners}
      />
      {open && (
        <div className="builder-body">
          <div className="field">
            <label>Service UUID</label>
            <input
              value={suuid}
              onChange={(e) => onPatchService({ uuid: e.target.value })}
              spellCheck={false}
              className="code"
            />
          </div>
          <div className="field">
            <label>Service name</label>
            <input value={sname} onChange={(e) => onPatchService({ name: e.target.value })} />
          </div>
          <div className="field builder-inline">
            <label className="builder-check">
              <input
                type="checkbox"
                checked={primary}
                onChange={(e) => onPatchService({ primary: e.target.checked })}
              />
              Primary service
            </label>
          </div>
          <div className="builder-nested">
            <div className="row">
              <h2>Characteristics</h2>
              <button type="button" className="btn btn-ghost" onClick={onAddChar}>
                + Add characteristic
              </button>
            </div>
            <SortableContext items={charIds} strategy={verticalListSortingStrategy}>
              {row.characteristics.map((characteristic, index) => (
                <SortableCharCard
                  key={characteristic.localId}
                  row={characteristic}
                  expanded={expanded.has(charSortableId(characteristic.localId))}
                  disableUp={index === 0}
                  disableDown={index === row.characteristics.length - 1}
                  onToggle={() => onToggle(charSortableId(characteristic.localId))}
                  onMove={(delta) => onMoveChar(row.localId, characteristic.localId, delta)}
                  onRemove={() => onRemoveChar(characteristic.localId)}
                  onPatch={(patch) => onPatchChar(characteristic.localId, patch)}
                />
              ))}
            </SortableContext>
            {row.characteristics.length === 0 && (
              <DropHint id={serviceDropId(row.localId)} label="Drop a characteristic here" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SortableTransitionCard({
  row,
  states,
  expanded,
  disableUp,
  disableDown,
  onToggle,
  onMove,
  onRemove,
  onPatch,
}: {
  row: TransitionRow;
  states: StateMachineStateRow[];
  expanded: boolean;
  disableUp: boolean;
  disableDown: boolean;
  onToggle: () => void;
  onMove: (delta: MoveDelta) => void;
  onRemove: () => void;
  onPatch: (data: Record<string, unknown>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({
    id: transitionSortableId(row.localId),
    animateLayoutChanges: () => false,
  });
  const toState = String(row.data.to ?? '');
  const label = String(row.data.label ?? '');
  const trig = readTrigger(row.data);
  const tType = displayedTriggerType(row.data);
  const charUuid = String(trig.characteristicUUID ?? '');
  const delayMs = typeof trig.delayMs === 'number' ? trig.delayMs : 5000;
  const writeVal = trig.value;
  const knownTarget = states.some((state) => state.stateKey === toState);
  const title = transitionTitle(row);

  function setTriggerType(nextType: string) {
    const base = defaultTrigger(nextType);
    if (
      (nextType === 'onSubscribe' || nextType === 'onUnsubscribe' || nextType === 'onWrite') &&
      charUuid
    ) {
      base.characteristicUUID = charUuid;
    }
    onPatch({ ...row.data, trigger: base });
  }

  function patchTrigger(patch: Record<string, unknown>) {
    onPatch({ ...row.data, trigger: { ...trig, ...patch } });
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cardClassName(isOver, isDragging)}
    >
      <CardHeader
        title={title}
        subtitle={triggerPlain(row.data)}
        expanded={expanded}
        onToggle={onToggle}
        disableUp={disableUp}
        disableDown={disableDown}
        onMoveUp={() => onMove(-1)}
        onMoveDown={() => onMove(1)}
        onRemove={onRemove}
        attributes={attributes}
        listeners={listeners}
      />
      {expanded && (
        <div className="builder-body">
          <div className="field">
            <label>To state</label>
            <select value={toState} onChange={(e) => onPatch({ ...row.data, to: e.target.value })}>
              {states.map((state) => (
                <option key={state.localId} value={state.stateKey}>
                  {stateOptionLabel(state)}
                </option>
              ))}
              {!knownTarget && <option value={toState}>{toState === '' ? '(empty)' : toState}</option>}
            </select>
          </div>
          <div className="field">
            <label>Label (optional)</label>
            <input value={label} onChange={(e) => onPatch({ ...row.data, label: e.target.value })} />
          </div>
          <div className="field">
            <label>Trigger</label>
            <select value={tType} onChange={(e) => setTriggerType(e.target.value)}>
              {TRIGGER_TYPES.map((type) => (
                <option key={type} value={type}>
                  {TRIGGER_LABEL[type]}
                </option>
              ))}
            </select>
          </div>
          {(tType === 'onSubscribe' || tType === 'onUnsubscribe' || tType === 'onWrite') && (
            <div className="field">
              <label>Characteristic UUID (optional)</label>
              <input
                className="code"
                value={charUuid}
                onChange={(e) => patchTrigger({ characteristicUUID: e.target.value || undefined })}
                spellCheck={false}
              />
            </div>
          )}
          {tType === 'onWrite' && (
            <div className="field">
              <label>Write value (optional uint)</label>
              <input
                type="number"
                value={writeVal === undefined || writeVal === null ? '' : Number(writeVal)}
                onChange={(e) => {
                  const v = e.target.value;
                  patchTrigger({ value: v === '' ? undefined : Number(v) });
                }}
              />
            </div>
          )}
          {tType === 'timer' && (
            <div className="field">
              <label>Delay (ms)</label>
              <input
                type="number"
                value={delayMs}
                onChange={(e) => patchTrigger({ delayMs: Number(e.target.value) || 0 })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SortableStateCard({
  row,
  states,
  isInitial,
  duplicateId,
  expanded,
  disableUp,
  disableDown,
  onToggle,
  onMove,
  onRemove,
  onPatchStateKey,
  onPatchStateData,
  onAddTransition,
  onPatchTransition,
  onRemoveTransition,
  onMoveTransition,
}: {
  row: StateMachineStateRow;
  states: StateMachineStateRow[];
  isInitial: boolean;
  duplicateId: boolean;
  expanded: Set<string>;
  disableUp: boolean;
  disableDown: boolean;
  onToggle: (id: string) => void;
  onMove: (delta: MoveDelta) => void;
  onRemove: () => void;
  onPatchStateKey: (key: string) => void;
  onPatchStateData: (patch: Record<string, unknown>) => void;
  onAddTransition: () => void;
  onPatchTransition: (transLocalId: string, data: Record<string, unknown>) => void;
  onRemoveTransition: (transLocalId: string) => void;
  onMoveTransition: (stateLocalId: string, transLocalId: string, delta: MoveDelta) => void;
}) {
  const id = stateSortableId(row.localId);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({ id });
  const open = expanded.has(id);
  const name = String(row.stateData.name ?? '');
  const desc = String(row.stateData.description ?? '');
  const transIds = row.transitions.map((item) => transitionSortableId(item.localId));

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cardClassName(isOver, isDragging)}
    >
      <CardHeader
        title={stateTitle(row)}
        subtitle={stateSubtitle(row)}
        expanded={open}
        onToggle={() => onToggle(id)}
        badge={isInitial ? 'Start' : undefined}
        disableUp={disableUp}
        disableDown={disableDown}
        onMoveUp={() => onMove(-1)}
        onMoveDown={() => onMove(1)}
        onRemove={onRemove}
        attributes={attributes}
        listeners={listeners}
      />
      {open && (
        <div className="builder-body">
          <div className="field">
            <label>State id (JSON key)</label>
            <input
              className="code"
              value={row.stateKey}
              onChange={(e) => onPatchStateKey(e.target.value)}
              spellCheck={false}
            />
            {duplicateId && <p className="builder-warn">Another state already uses this id.</p>}
          </div>
          <div className="field">
            <label>Display name</label>
            <input value={name} onChange={(e) => onPatchStateData({ name: e.target.value })} />
          </div>
          <div className="field">
            <label>Description</label>
            <textarea
              rows={2}
              value={desc}
              onChange={(e) => onPatchStateData({ description: e.target.value })}
            />
          </div>
          <div className="builder-nested">
            <div className="row">
              <h2>Transitions</h2>
              <button type="button" className="btn btn-ghost" onClick={onAddTransition}>
                + Add transition
              </button>
            </div>
            <SortableContext items={transIds} strategy={verticalListSortingStrategy}>
              {row.transitions.map((item, index) => (
                <SortableTransitionCard
                  key={item.localId}
                  row={item}
                  states={states}
                  expanded={expanded.has(transitionSortableId(item.localId))}
                  disableUp={index === 0}
                  disableDown={index === row.transitions.length - 1}
                  onToggle={() => onToggle(transitionSortableId(item.localId))}
                  onMove={(delta) => onMoveTransition(row.localId, item.localId, delta)}
                  onRemove={() => onRemoveTransition(item.localId)}
                  onPatch={(data) => onPatchTransition(item.localId, data)}
                />
              ))}
            </SortableContext>
            {row.transitions.length === 0 && (
              <DropHint id={stateDropId(row.localId)} label="Drop a transition here" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type Props = {
  docJson: string;
  onDocJsonChange: (next: string) => void;
};

export default function ProfileDragDropBuilder({ docJson, onDocJsonChange }: Props) {
  const initial = useMemo(() => {
    const doc = safeParseDoc(docJson);
    const adv = doc.advertising;
    let localName = '';
    let deviceName = '';
    if (adv && typeof adv === 'object' && !Array.isArray(adv)) {
      const a = adv as Record<string, unknown>;
      localName = String(a.localName ?? '');
      deviceName = String(a.deviceName ?? '');
    }
    return {
      doc,
      advertising: { localName, deviceName },
      rows: rowsFromDoc(doc),
    };
  }, [docJson]);

  const smParsed = useMemo(() => parseStateMachine(initial.doc.stateMachine), [initial.doc.stateMachine]);

  const [root, setRoot] = useState<Record<string, unknown>>(() => {
    const { services: _r, advertising: _a, stateMachine: _sm, ...rest } = initial.doc;
    return rest;
  });
  const [advertising, setAdvertising] = useState(initial.advertising);
  const [serviceRows, setServiceRows] = useState<ServiceRow[]>(initial.rows);
  const [smInitial, setSmInitial] = useState(smParsed.initial);
  const [smRows, setSmRows] = useState<StateMachineStateRow[]>(smParsed.rows);
  const [expanded, setExpanded] = useState<Set<string>>(() => initialExpanded(initial.rows, smParsed.rows));
  const [activeId, setActiveId] = useState<string | null>(null);
  const advertisingSeedRef = useRef(initial.doc.advertising);
  const serviceRowsRef = useRef(serviceRows);
  const smRowsRef = useRef(smRows);
  const rootRef = useRef(root);
  const advertisingRef = useRef(advertising);
  const smInitialRef = useRef(smInitial);
  const dragSnapshotRef = useRef<DragSnapshot | null>(null);
  const appliedOverRef = useRef<string | null>(null);
  serviceRowsRef.current = serviceRows;
  smRowsRef.current = smRows;
  rootRef.current = root;
  advertisingRef.current = advertising;
  smInitialRef.current = smInitial;

  const pushDoc = useCallback(
    (
      nextRoot: Record<string, unknown>,
      nextRows: ServiceRow[],
      nextAdv: typeof advertising,
      nextSmInitial: string,
      nextSmRows: StateMachineStateRow[]
    ) => {
      onDocJsonChange(
        emitDoc(nextRoot, nextRows, nextAdv, advertisingSeedRef.current, nextSmInitial, nextSmRows)
      );
    },
    [onDocJsonChange]
  );
  const pushDocRef = useRef(pushDoc);
  pushDocRef.current = pushDoc;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const duplicateKeys = duplicateStateKeySet(smRows);
  const serviceIds = serviceRows.map((row) => serviceSortableId(row.localId));
  const stateIds = smRows.map((row) => stateSortableId(row.localId));
  const overlay = activeId ? overlayCopy(activeId, serviceRows, smRows) : null;
  const initialKnown = smRows.some((row) => row.stateKey === smInitial);

  function pushServices(rows: ServiceRow[]) {
    pushDocRef.current(rootRef.current, rows, advertisingRef.current, smInitialRef.current, smRowsRef.current);
  }

  function pushStates(rows: StateMachineStateRow[]) {
    pushDocRef.current(rootRef.current, serviceRowsRef.current, advertisingRef.current, smInitialRef.current, rows);
  }

  function restore(snap: DragSnapshot) {
    serviceRowsRef.current = snap.services;
    smRowsRef.current = snap.states;
    setServiceRows(snap.services);
    setSmRows(snap.states);
  }

  function reveal(id: string) {
    setExpanded((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAllServices() {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const service of serviceRows) {
        next.add(serviceSortableId(service.localId));
        for (const characteristic of service.characteristics) next.add(charSortableId(characteristic.localId));
      }
      return next;
    });
  }

  function collapseAllServices() {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const service of serviceRows) {
        next.delete(serviceSortableId(service.localId));
        for (const characteristic of service.characteristics) next.delete(charSortableId(characteristic.localId));
      }
      return next;
    });
  }

  function expandAllStates() {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const state of smRows) {
        next.add(stateSortableId(state.localId));
        for (const transition of state.transitions) next.add(transitionSortableId(transition.localId));
      }
      return next;
    });
  }

  function collapseAllStates() {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const state of smRows) {
        next.delete(stateSortableId(state.localId));
        for (const transition of state.transitions) next.delete(transitionSortableId(transition.localId));
      }
      return next;
    });
  }

  function relocateChar(activeDragId: string, overId: string) {
    const snap = dragSnapshotRef.current;
    if (!snap) return;
    const live = serviceRowsRef.current;
    const charLocal = charLocalIdFromId(live, activeDragId) ?? charLocalIdFromId(snap.services, activeDragId);
    if (!charLocal) return;
    const origin = normalizeServiceLocalId(snap.services, findServiceIdForChar(snap.services, charLocal));
    const current = normalizeServiceLocalId(live, findServiceIdForChar(live, charLocal));
    const dest = destinationServiceId(live, overId);
    if (!origin || !current || !dest) return;
    // Inside the list where the drag started, sortable transforms show the preview.
    // After the item leaves that list, keep the data index in sync with the pointer.
    if (current === origin && dest === origin) return;
    const next = moveCharacteristic(live, activeDragId, overId);
    if (!serviceOrderChanged(live, next)) return;
    serviceRowsRef.current = next;
    setServiceRows(next);
    appliedOverRef.current = overId;
  }

  function relocateTransition(activeDragId: string, overId: string) {
    const snap = dragSnapshotRef.current;
    if (!snap) return;
    const live = smRowsRef.current;
    const transLocal =
      transitionLocalIdFromId(live, activeDragId) ?? transitionLocalIdFromId(snap.states, activeDragId);
    if (!transLocal) return;
    const origin = normalizeStateLocalId(snap.states, findStateIdForTransition(snap.states, transLocal));
    const current = normalizeStateLocalId(live, findStateIdForTransition(live, transLocal));
    const dest = destinationStateId(live, overId);
    if (!origin || !current || !dest) return;
    if (current === origin && dest === origin) return;
    const next = moveTransition(live, activeDragId, overId);
    if (!stateOrderChanged(live, next)) return;
    smRowsRef.current = next;
    setSmRows(next);
    appliedOverRef.current = overId;
  }

  function finishCharDrag(snap: DragSnapshot, activeDragId: string, overId: string) {
    const live = serviceRowsRef.current;
    const charLocal = charLocalIdFromId(live, activeDragId) ?? charLocalIdFromId(snap.services, activeDragId);
    if (!charLocal) {
      restore(snap);
      return;
    }
    const origin = normalizeServiceLocalId(snap.services, findServiceIdForChar(snap.services, charLocal));
    const dest = destinationServiceId(live, overId);
    if (!origin || !dest) {
      restore(snap);
      return;
    }
    if (appliedOverRef.current === overId) {
      if (!serviceOrderChanged(snap.services, live)) return;
      if (dest !== origin) reveal(serviceSortableId(dest));
      pushServices(live);
      return;
    }
    const next = moveCharacteristic(live, activeDragId, overId);
    if (serviceOrderChanged(live, next)) {
      serviceRowsRef.current = next;
      setServiceRows(next);
    }
    if (!serviceOrderChanged(snap.services, serviceRowsRef.current)) return;
    if (dest !== origin) reveal(serviceSortableId(dest));
    pushServices(serviceRowsRef.current);
  }

  function finishTransitionDrag(snap: DragSnapshot, activeDragId: string, overId: string) {
    const live = smRowsRef.current;
    const transLocal =
      transitionLocalIdFromId(live, activeDragId) ?? transitionLocalIdFromId(snap.states, activeDragId);
    if (!transLocal) {
      restore(snap);
      return;
    }
    const origin = normalizeStateLocalId(snap.states, findStateIdForTransition(snap.states, transLocal));
    const dest = destinationStateId(live, overId);
    if (!origin || !dest) {
      restore(snap);
      return;
    }
    if (appliedOverRef.current === overId) {
      if (!stateOrderChanged(snap.states, live)) return;
      if (dest !== origin) reveal(stateSortableId(dest));
      pushStates(live);
      return;
    }
    const next = moveTransition(live, activeDragId, overId);
    if (stateOrderChanged(live, next)) {
      smRowsRef.current = next;
      setSmRows(next);
    }
    if (!stateOrderChanged(snap.states, smRowsRef.current)) return;
    if (dest !== origin) reveal(stateSortableId(dest));
    pushStates(smRowsRef.current);
  }

  function onDragStart(event: DragStartEvent) {
    dragSnapshotRef.current = {
      services: serviceRowsRef.current,
      states: smRowsRef.current,
    };
    appliedOverRef.current = null;
    setActiveId(String(event.active.id));
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeDragId = String(active.id);
    const overId = String(over.id);
    const kind = dragKind(activeDragId);
    if (kind === 'char') relocateChar(activeDragId, overId);
    else if (kind === 'transition') relocateTransition(activeDragId, overId);
  }

  function onDragCancel() {
    const snap = dragSnapshotRef.current;
    dragSnapshotRef.current = null;
    setActiveId(null);
    if (snap) restore(snap);
  }

  function onDragEnd(event: DragEndEvent) {
    const snap = dragSnapshotRef.current;
    dragSnapshotRef.current = null;
    setActiveId(null);
    if (!snap) return;
    const activeDragId = String(event.active.id);
    const kind = dragKind(activeDragId);
    if (!event.over) {
      restore(snap);
      return;
    }
    const overId = String(event.over.id);
    if (kind === 'char') {
      finishCharDrag(snap, activeDragId, overId);
      return;
    }
    if (kind === 'transition') {
      finishTransitionDrag(snap, activeDragId, overId);
      return;
    }
    if (kind === 'service') {
      const live = serviceRowsRef.current;
      if (!isServiceTreeId(overId)) return;
      const next = reorderServices(live, activeDragId, overId);
      if (!serviceOrderChanged(snap.services, next)) return;
      serviceRowsRef.current = next;
      setServiceRows(next);
      pushServices(next);
      return;
    }
    if (kind === 'state') {
      const live = smRowsRef.current;
      if (!isStateTreeId(overId)) return;
      const next = reorderStates(live, activeDragId, overId);
      if (!stateOrderChanged(snap.states, next)) return;
      smRowsRef.current = next;
      setSmRows(next);
      pushStates(next);
    }
  }

  function patchRoot(patch: Record<string, unknown>) {
    const next = { ...root, ...patch };
    setRoot(next);
    pushDoc(next, serviceRows, advertising, smInitial, smRows);
  }

  function patchAdvertising(patch: Partial<typeof advertising>) {
    const next = { ...advertising, ...patch };
    setAdvertising(next);
    pushDoc(root, serviceRows, next, smInitial, smRows);
  }

  function patchService(localId: string, patch: Record<string, unknown>) {
    const next = serviceRows.map((row) =>
      row.localId === localId ? { ...row, serviceData: { ...row.serviceData, ...patch } } : row
    );
    serviceRowsRef.current = next;
    setServiceRows(next);
    pushDoc(root, next, advertising, smInitial, smRows);
  }

  function removeService(localId: string) {
    const row = serviceRows.find((item) => item.localId === localId);
    if (!row) return;
    if (
      row.characteristics.length > 0 &&
      !confirmRemove(serviceTitle(row), row.characteristics.length, 'characteristic', 'characteristics')
    ) {
      return;
    }
    const next = serviceRows.filter((item) => item.localId !== localId);
    serviceRowsRef.current = next;
    setServiceRows(next);
    pushDoc(root, next, advertising, smInitial, smRows);
  }

  function addService() {
    const localId = genLocalId();
    const row: ServiceRow = {
      localId,
      serviceData: { uuid: '', name: 'New service', primary: true },
      characteristics: [],
    };
    const next = [...serviceRows, row];
    serviceRowsRef.current = next;
    setServiceRows(next);
    reveal(serviceSortableId(localId));
    pushDoc(root, next, advertising, smInitial, smRows);
  }

  function addChar(serviceLocalId: string) {
    const localId = genLocalId();
    const next = serviceRows.map((row) =>
      row.localId === serviceLocalId
        ? {
            ...row,
            characteristics: [
              ...row.characteristics,
              {
                localId,
                data: { uuid: '', name: 'New characteristic', properties: ['read'] },
              },
            ],
          }
        : row
    );
    serviceRowsRef.current = next;
    setServiceRows(next);
    reveal(serviceSortableId(serviceLocalId));
    reveal(charSortableId(localId));
    pushDoc(root, next, advertising, smInitial, smRows);
  }

  function patchChar(serviceLocalId: string, charLocalId: string, patch: Record<string, unknown>) {
    const next = serviceRows.map((row) => {
      if (row.localId !== serviceLocalId) return row;
      return {
        ...row,
        characteristics: row.characteristics.map((characteristic) =>
          characteristic.localId === charLocalId
            ? { ...characteristic, data: { ...characteristic.data, ...patch } }
            : characteristic
        ),
      };
    });
    serviceRowsRef.current = next;
    setServiceRows(next);
    pushDoc(root, next, advertising, smInitial, smRows);
  }

  function removeChar(serviceLocalId: string, charLocalId: string) {
    const next = serviceRows.map((row) =>
      row.localId === serviceLocalId
        ? { ...row, characteristics: row.characteristics.filter((characteristic) => characteristic.localId !== charLocalId) }
        : row
    );
    serviceRowsRef.current = next;
    setServiceRows(next);
    pushDoc(root, next, advertising, smInitial, smRows);
  }

  function moveService(localId: string, delta: MoveDelta) {
    const next = moveServiceBy(serviceRows, localId, delta);
    serviceRowsRef.current = next;
    setServiceRows(next);
    pushDoc(root, next, advertising, smInitial, smRows);
  }

  function moveChar(serviceLocalId: string, charLocalId: string, delta: MoveDelta) {
    const next = moveCharBy(serviceRows, serviceLocalId, charLocalId, delta);
    serviceRowsRef.current = next;
    setServiceRows(next);
    pushDoc(root, next, advertising, smInitial, smRows);
  }

  function addSmState() {
    const localId = genLocalId();
    const row: StateMachineStateRow = {
      localId,
      stateKey: `state_${smRows.length + 1}`,
      stateData: { name: 'New state', description: '' },
      transitions: [],
    };
    const next = [...smRows, row];
    smRowsRef.current = next;
    setSmRows(next);
    let nextInitial = smInitial;
    if (smRows.length === 0) {
      nextInitial = row.stateKey;
      smInitialRef.current = nextInitial;
      setSmInitial(nextInitial);
    }
    reveal(stateSortableId(localId));
    pushDoc(root, serviceRows, advertising, nextInitial, next);
  }

  function removeSmState(localId: string) {
    const removed = smRows.find((row) => row.localId === localId);
    if (!removed) return;
    if (
      removed.transitions.length > 0 &&
      !confirmRemove(stateTitle(removed), removed.transitions.length, 'transition', 'transitions')
    ) {
      return;
    }
    const next = smRows.filter((row) => row.localId !== localId);
    smRowsRef.current = next;
    setSmRows(next);
    let nextInitial = smInitial;
    if (removed && smInitial === removed.stateKey && next[0]) {
      nextInitial = next[0].stateKey;
      smInitialRef.current = nextInitial;
      setSmInitial(nextInitial);
    }
    if (next.length === 0) {
      nextInitial = 'idle';
      smInitialRef.current = nextInitial;
      setSmInitial(nextInitial);
    }
    pushDoc(root, serviceRows, advertising, nextInitial, next);
  }

  function patchSmStateKey(localId: string, key: string) {
    const prev = smRows.find((row) => row.localId === localId);
    const next = smRows.map((row) => (row.localId === localId ? { ...row, stateKey: key } : row));
    smRowsRef.current = next;
    setSmRows(next);
    let nextInitial = smInitial;
    if (prev && smInitial === prev.stateKey) {
      nextInitial = key;
      smInitialRef.current = nextInitial;
      setSmInitial(nextInitial);
    }
    pushDoc(root, serviceRows, advertising, nextInitial, next);
  }

  function patchSmStateData(localId: string, patch: Record<string, unknown>) {
    const next = smRows.map((row) =>
      row.localId === localId ? { ...row, stateData: { ...row.stateData, ...patch } } : row
    );
    smRowsRef.current = next;
    setSmRows(next);
    pushDoc(root, serviceRows, advertising, smInitial, next);
  }

  function addSmTransition(stateLocalId: string) {
    const localId = genLocalId();
    const next = smRows.map((row) =>
      row.localId === stateLocalId
        ? {
            ...row,
            transitions: [
              ...row.transitions,
              {
                localId,
                data: {
                  to: smRows.find((item) => item.localId !== stateLocalId)?.stateKey ?? '',
                  trigger: { type: 'manual' },
                  label: '',
                },
              },
            ],
          }
        : row
    );
    smRowsRef.current = next;
    setSmRows(next);
    reveal(stateSortableId(stateLocalId));
    reveal(transitionSortableId(localId));
    pushDoc(root, serviceRows, advertising, smInitial, next);
  }

  function patchSmTransition(stateLocalId: string, transLocalId: string, data: Record<string, unknown>) {
    const next = smRows.map((row) => {
      if (row.localId !== stateLocalId) return row;
      return {
        ...row,
        transitions: row.transitions.map((item) =>
          item.localId === transLocalId ? { ...item, data: { ...data } } : item
        ),
      };
    });
    smRowsRef.current = next;
    setSmRows(next);
    pushDoc(root, serviceRows, advertising, smInitial, next);
  }

  function removeSmTransition(stateLocalId: string, transLocalId: string) {
    const next = smRows.map((row) =>
      row.localId === stateLocalId
        ? { ...row, transitions: row.transitions.filter((item) => item.localId !== transLocalId) }
        : row
    );
    smRowsRef.current = next;
    setSmRows(next);
    pushDoc(root, serviceRows, advertising, smInitial, next);
  }

  function moveState(localId: string, delta: MoveDelta) {
    const next = moveStateBy(smRows, localId, delta);
    smRowsRef.current = next;
    setSmRows(next);
    pushDoc(root, serviceRows, advertising, smInitial, next);
  }

  function moveTransitionRow(stateLocalId: string, transLocalId: string, delta: MoveDelta) {
    const next = moveTransitionBy(smRows, stateLocalId, transLocalId, delta);
    smRowsRef.current = next;
    setSmRows(next);
    pushDoc(root, serviceRows, advertising, smInitial, next);
  }

  function setInitialState(value: string) {
    smInitialRef.current = value;
    setSmInitial(value);
    pushDoc(root, serviceRows, advertising, value, smRows);
  }

  return (
    <div className="profile-builder">
      <p className="builder-help">
        Open a card to edit it. Drag the grip to reorder, or drop a characteristic on another service to move
        it — transitions move between states the same way. Up and Down work too. Advanced fields stay in the JSON tab.
      </p>
      <div className="card">
        <h2>Device</h2>
        <div className="field">
          <label htmlFor="bd-id">Profile id</label>
          <input id="bd-id" value={String(root.id ?? '')} onChange={(e) => patchRoot({ id: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="bd-name">Name</label>
          <input
            id="bd-name"
            value={String(root.name ?? '')}
            onChange={(e) => patchRoot({ name: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="bd-ver">Version</label>
          <input
            id="bd-ver"
            value={String(root.version ?? '')}
            onChange={(e) => patchRoot({ version: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="bd-desc">Description</label>
          <textarea
            id="bd-desc"
            rows={2}
            value={String(root.description ?? '')}
            onChange={(e) => patchRoot({ description: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="bd-adv-name">Advertising local name</label>
          <input
            id="bd-adv-name"
            value={advertising.localName}
            onChange={(e) => patchAdvertising({ localName: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="bd-adv-dev">Advertising device name (optional)</label>
          <input
            id="bd-adv-dev"
            value={advertising.deviceName}
            onChange={(e) => patchAdvertising({ deviceName: e.target.value })}
          />
        </div>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={builderCollision}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div className="builder-section-head">
          <h2>State machine</h2>
          <button type="button" className="btn btn-primary" onClick={addSmState}>
            + Add state
          </button>
          <button type="button" className="btn btn-ghost" onClick={expandAllStates} disabled={smRows.length === 0}>
            Expand all
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={collapseAllStates}
            disabled={smRows.length === 0}
          >
            Collapse all
          </button>
        </div>
        {smRows.length === 0 ? (
          <p className="muted">No states yet. Add a state to include a state machine in this profile.</p>
        ) : (
          <>
            <div className="card">
              <div className="field">
                <label htmlFor="bd-sm-initial">Initial state id</label>
                <select id="bd-sm-initial" value={smInitial} onChange={(e) => setInitialState(e.target.value)}>
                  {smRows.map((row) => (
                    <option key={row.localId} value={row.stateKey}>
                      {stateOptionLabel(row)}
                    </option>
                  ))}
                  {!initialKnown && <option value={smInitial}>{smInitial || '(empty)'}</option>}
                </select>
              </div>
            </div>
            <SortableContext items={stateIds} strategy={verticalListSortingStrategy}>
              {smRows.map((row, index) => (
                <SortableStateCard
                  key={row.localId}
                  row={row}
                  states={smRows}
                  isInitial={row.stateKey === smInitial}
                  duplicateId={duplicateKeys.has(row.stateKey.trim())}
                  expanded={expanded}
                  disableUp={index === 0}
                  disableDown={index === smRows.length - 1}
                  onToggle={toggleExpanded}
                  onMove={(delta) => moveState(row.localId, delta)}
                  onRemove={() => removeSmState(row.localId)}
                  onPatchStateKey={(key) => patchSmStateKey(row.localId, key)}
                  onPatchStateData={(patch) => patchSmStateData(row.localId, patch)}
                  onAddTransition={() => addSmTransition(row.localId)}
                  onPatchTransition={(transLocalId, data) => patchSmTransition(row.localId, transLocalId, data)}
                  onRemoveTransition={(transLocalId) => removeSmTransition(row.localId, transLocalId)}
                  onMoveTransition={moveTransitionRow}
                />
              ))}
            </SortableContext>
          </>
        )}
        <div className="builder-section-head">
          <h2>Services</h2>
          <button type="button" className="btn btn-primary" onClick={addService}>
            + Add service
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={expandAllServices}
            disabled={serviceRows.length === 0}
          >
            Expand all
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={collapseAllServices}
            disabled={serviceRows.length === 0}
          >
            Collapse all
          </button>
        </div>
        {serviceRows.length === 0 ? (
          <p className="muted">No services yet. Add a service to define GATT characteristics.</p>
        ) : (
          <SortableContext items={serviceIds} strategy={verticalListSortingStrategy}>
            {serviceRows.map((row, index) => (
              <SortableServiceCard
                key={row.localId}
                row={row}
                expanded={expanded}
                disableUp={index === 0}
                disableDown={index === serviceRows.length - 1}
                onToggle={toggleExpanded}
                onMove={(delta) => moveService(row.localId, delta)}
                onRemove={() => removeService(row.localId)}
                onPatchService={(patch) => patchService(row.localId, patch)}
                onAddChar={() => addChar(row.localId)}
                onPatchChar={(charLocalId, patch) => patchChar(row.localId, charLocalId, patch)}
                onRemoveChar={(charLocalId) => removeChar(row.localId, charLocalId)}
                onMoveChar={moveChar}
              />
            ))}
          </SortableContext>
        )}
        <DragOverlay>
          {overlay ? (
            <div className="builder-overlay">
              <span className="builder-badge">{overlay.kind}</span>
              <span className="builder-overlay-name">{overlay.name}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
