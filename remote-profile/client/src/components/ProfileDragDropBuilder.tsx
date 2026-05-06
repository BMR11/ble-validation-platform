import { useCallback, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type CharRow = { localId: string; data: Record<string, unknown> };
type ServiceRow = { localId: string; serviceData: Record<string, unknown>; characteristics: CharRow[] };
type TransitionRow = { localId: string; data: Record<string, unknown> };
type StateMachineStateRow = {
  localId: string;
  stateKey: string;
  stateData: Record<string, unknown>;
  transitions: TransitionRow[];
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

function SortableTransitionRow({
  id,
  row,
  stateKeys,
  onPatch,
  onRemove,
}: {
  id: string;
  row: TransitionRow;
  stateKeys: string[];
  onPatch: (data: Record<string, unknown>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
  };
  const toState = String(row.data.to ?? '');
  const label = String(row.data.label ?? '');
  const trig = readTrigger(row.data);
  const tType = TRIGGER_TYPES.includes(trig.type as (typeof TRIGGER_TYPES)[number])
    ? (trig.type as string)
    : 'manual';
  const charUuid = String(trig.characteristicUUID ?? '');
  const delayMs = typeof trig.delayMs === 'number' ? trig.delayMs : 5000;
  const writeVal = trig.value;

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
    <div ref={setNodeRef} style={style} className="builder-transition card">
      <div className="builder-char-head row">
        <button
          type="button"
          className="builder-drag btn btn-ghost"
          aria-label="Drag to reorder transition"
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>
        <span className="muted" style={{ fontSize: '0.8rem' }}>
          Transition
        </span>
        <button type="button" className="btn btn-ghost" onClick={onRemove}>
          Remove
        </button>
      </div>
      <div className="field">
        <label>To state id</label>
        <input
          className="code"
          list={`sm-to-${row.localId}`}
          value={toState}
          onChange={(e) => onPatch({ ...row.data, to: e.target.value })}
          spellCheck={false}
        />
        <datalist id={`sm-to-${row.localId}`}>
          {stateKeys.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
      </div>
      <div className="field">
        <label>Label (optional)</label>
        <input value={label} onChange={(e) => onPatch({ ...row.data, label: e.target.value })} />
      </div>
      <div className="field">
        <label>Trigger</label>
        <select value={tType} onChange={(e) => setTriggerType(e.target.value)}>
          {TRIGGER_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
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
  );
}

function SortableStateMachineBlock({
  id,
  row,
  allStateKeys,
  onPatchStateKey,
  onPatchStateData,
  onRemoveState,
  onAddTransition,
  onPatchTransition,
  onRemoveTransition,
}: {
  id: string;
  row: StateMachineStateRow;
  allStateKeys: string[];
  onPatchStateKey: (key: string) => void;
  onPatchStateData: (patch: Record<string, unknown>) => void;
  onRemoveState: () => void;
  onAddTransition: () => void;
  onPatchTransition: (transLocalId: string, data: Record<string, unknown>) => void;
  onRemoveTransition: (transLocalId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.92 : 1,
  };
  const name = String(row.stateData.name ?? '');
  const desc = String(row.stateData.description ?? '');
  const transIds = row.transitions.map((t) => `trn__${row.localId}__${t.localId}`);

  return (
    <div ref={setNodeRef} style={style} className="builder-state card">
      <div className="builder-service-head row">
        <button
          type="button"
          className="builder-drag btn btn-ghost"
          aria-label="Drag to reorder state"
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>
        <span className="muted" style={{ fontSize: '0.85rem' }}>
          State
        </span>
        <button type="button" className="btn btn-ghost" onClick={onRemoveState}>
          Remove state
        </button>
      </div>
      <div className="field">
        <label>State id (JSON key)</label>
        <input
          className="code"
          value={row.stateKey}
          onChange={(e) => onPatchStateKey(e.target.value)}
          spellCheck={false}
        />
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
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Transitions</h2>
          <button type="button" className="btn btn-ghost" onClick={onAddTransition}>
            + Add transition
          </button>
        </div>
        <SortableContext items={transIds} strategy={verticalListSortingStrategy}>
          {row.transitions.map((t) => (
            <SortableTransitionRow
              key={t.localId}
              id={`trn__${row.localId}__${t.localId}`}
              row={t}
              stateKeys={allStateKeys}
              onPatch={(data) => onPatchTransition(t.localId, data)}
              onRemove={() => onRemoveTransition(t.localId)}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

function SortableCharRow({
  id,
  row,
  onPatch,
  onRemove,
}: {
  id: string;
  row: CharRow;
  onPatch: (patch: Record<string, unknown>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
  };
  const uuid = String(row.data.uuid ?? '');
  const name = String(row.data.name ?? '');
  const propsArr = Array.isArray(row.data.properties)
    ? (row.data.properties as unknown[]).filter((p): p is string => typeof p === 'string')
    : [];

  return (
    <div ref={setNodeRef} style={style} className="builder-char card">
      <div className="builder-char-head row">
        <button
          type="button"
          className="builder-drag btn btn-ghost"
          aria-label="Drag to reorder characteristic"
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>
        <span className="muted" style={{ fontSize: '0.8rem' }}>
          Characteristic
        </span>
        <button type="button" className="btn btn-ghost" onClick={onRemove}>
          Remove
        </button>
      </div>
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
          {PROP_OPTIONS.map((p) => (
            <label key={p} className="builder-check">
              <input
                type="checkbox"
                checked={propsArr.includes(p)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...propsArr, p]
                    : propsArr.filter((x) => x !== p);
                  onPatch({ properties: next });
                }}
              />
              {p}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function SortableServiceBlock({
  id,
  row,
  onPatchService,
  onRemoveService,
  onAddChar,
  onPatchChar,
  onRemoveChar,
}: {
  id: string;
  row: ServiceRow;
  onPatchService: (patch: Record<string, unknown>) => void;
  onRemoveService: () => void;
  onAddChar: () => void;
  onPatchChar: (charLocalId: string, patch: Record<string, unknown>) => void;
  onRemoveChar: (charLocalId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.92 : 1,
  };
  const suuid = String(row.serviceData.uuid ?? '');
  const sname = String(row.serviceData.name ?? '');
  const primary = Boolean(row.serviceData.primary ?? true);
  const charIds = row.characteristics.map((c) => `chr__${row.localId}__${c.localId}`);

  return (
    <div ref={setNodeRef} style={style} className="builder-service card">
      <div className="builder-service-head row">
        <button
          type="button"
          className="builder-drag btn btn-ghost"
          aria-label="Drag to reorder service"
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>
        <span className="muted" style={{ fontSize: '0.85rem' }}>
          GATT service
        </span>
        <button type="button" className="btn btn-ghost" onClick={onRemoveService}>
          Remove service
        </button>
      </div>
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
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <h2 style={{ margin: 0 }}>Characteristics</h2>
          <button type="button" className="btn btn-ghost" onClick={onAddChar}>
            + Add characteristic
          </button>
        </div>
        <SortableContext items={charIds} strategy={verticalListSortingStrategy}>
          {row.characteristics.map((c) => (
            <SortableCharRow
              key={c.localId}
              id={`chr__${row.localId}__${c.localId}`}
              row={c}
              onPatch={(patch) => onPatchChar(c.localId, patch)}
              onRemove={() => onRemoveChar(c.localId)}
            />
          ))}
        </SortableContext>
      </div>
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
  const advertisingSeedRef = useRef(initial.doc.advertising);

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const serviceIds = serviceRows.map((r) => `svc__${r.localId}`);
  const smStateIds = smRows.map((r) => `stm__${r.localId}`);
  const allSmStateKeys = smRows.map((r) => r.stateKey.trim()).filter(Boolean);

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const aid = String(active.id);
    const oid = String(over.id);
    if (aid.startsWith('svc__')) {
      const oldIndex = serviceIds.indexOf(aid);
      const newIndex = serviceIds.indexOf(oid);
      if (oldIndex < 0 || newIndex < 0) {
        return;
      }
      const next = arrayMove(serviceRows, oldIndex, newIndex);
      setServiceRows(next);
      pushDoc(root, next, advertising, smInitial, smRows);
      return;
    }
    if (aid.startsWith('chr__')) {
      const parseChr = (s: string): { svc: string; chr: string } | null => {
        const m = /^chr__(.+?)__(.+)$/.exec(s);
        return m ? { svc: m[1], chr: m[2] } : null;
      };
      const a = parseChr(aid);
      const b = parseChr(oid);
      if (!a || !b || a.svc !== b.svc) {
        return;
      }
      reorderChars(a.svc, aid, oid);
      return;
    }
    if (aid.startsWith('stm__')) {
      const oldIndex = smStateIds.indexOf(aid);
      const newIndex = smStateIds.indexOf(oid);
      if (oldIndex < 0 || newIndex < 0) {
        return;
      }
      const next = arrayMove(smRows, oldIndex, newIndex);
      setSmRows(next);
      pushDoc(root, serviceRows, advertising, smInitial, next);
      return;
    }
    if (aid.startsWith('trn__')) {
      const parseTrn = (s: string): { st: string; tr: string } | null => {
        const m = /^trn__(.+?)__(.+)$/.exec(s);
        return m ? { st: m[1], tr: m[2] } : null;
      };
      const a = parseTrn(aid);
      const b = parseTrn(oid);
      if (!a || !b || a.st !== b.st) {
        return;
      }
      reorderTransitions(a.st, aid, oid);
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
    const next = serviceRows.map((r) =>
      r.localId === localId ? { ...r, serviceData: { ...r.serviceData, ...patch } } : r
    );
    setServiceRows(next);
    pushDoc(root, next, advertising, smInitial, smRows);
  }

  function removeService(localId: string) {
    const next = serviceRows.filter((r) => r.localId !== localId);
    setServiceRows(next);
    pushDoc(root, next, advertising, smInitial, smRows);
  }

  function addService() {
    const row: ServiceRow = {
      localId: genLocalId(),
      serviceData: { uuid: '', name: 'New service', primary: true },
      characteristics: [],
    };
    const next = [...serviceRows, row];
    setServiceRows(next);
    pushDoc(root, next, advertising, smInitial, smRows);
  }

  function addChar(serviceLocalId: string) {
    const next = serviceRows.map((r) =>
      r.localId === serviceLocalId
        ? {
            ...r,
            characteristics: [
              ...r.characteristics,
              {
                localId: genLocalId(),
                data: { uuid: '', name: 'New characteristic', properties: ['read'] },
              },
            ],
          }
        : r
    );
    setServiceRows(next);
    pushDoc(root, next, advertising, smInitial, smRows);
  }

  function patchChar(serviceLocalId: string, charLocalId: string, patch: Record<string, unknown>) {
    const next = serviceRows.map((r) => {
      if (r.localId !== serviceLocalId) {
        return r;
      }
      return {
        ...r,
        characteristics: r.characteristics.map((c) =>
          c.localId === charLocalId ? { ...c, data: { ...c.data, ...patch } } : c
        ),
      };
    });
    setServiceRows(next);
    pushDoc(root, next, advertising, smInitial, smRows);
  }

  function removeChar(serviceLocalId: string, charLocalId: string) {
    const next = serviceRows.map((r) =>
      r.localId === serviceLocalId
        ? { ...r, characteristics: r.characteristics.filter((c) => c.localId !== charLocalId) }
        : r
    );
    setServiceRows(next);
    pushDoc(root, next, advertising, smInitial, smRows);
  }

  function reorderChars(serviceLocalId: string, activeId: string, overId: string) {
    const row = serviceRows.find((r) => r.localId === serviceLocalId);
    if (!row) {
      return;
    }
    const ids = row.characteristics.map((c) => `chr__${serviceLocalId}__${c.localId}`);
    const oldIndex = ids.indexOf(activeId);
    const newIndex = ids.indexOf(overId);
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }
    const nextChars = arrayMove(row.characteristics, oldIndex, newIndex);
    const next = serviceRows.map((r) =>
      r.localId === serviceLocalId ? { ...r, characteristics: nextChars } : r
    );
    setServiceRows(next);
    pushDoc(root, next, advertising, smInitial, smRows);
  }

  function addSmState() {
    const row: StateMachineStateRow = {
      localId: genLocalId(),
      stateKey: `state_${smRows.length + 1}`,
      stateData: { name: 'New state', description: '' },
      transitions: [],
    };
    const next = [...smRows, row];
    setSmRows(next);
    let nextInitial = smInitial;
    if (smRows.length === 0) {
      nextInitial = row.stateKey;
      setSmInitial(nextInitial);
    }
    pushDoc(root, serviceRows, advertising, nextInitial, next);
  }

  function removeSmState(localId: string) {
    const removed = smRows.find((r) => r.localId === localId);
    const next = smRows.filter((r) => r.localId !== localId);
    setSmRows(next);
    let nextInitial = smInitial;
    if (removed && smInitial === removed.stateKey && next[0]) {
      nextInitial = next[0].stateKey;
      setSmInitial(nextInitial);
    }
    if (next.length === 0) {
      nextInitial = 'idle';
      setSmInitial(nextInitial);
    }
    pushDoc(root, serviceRows, advertising, nextInitial, next);
  }

  function patchSmStateKey(localId: string, key: string) {
    const prev = smRows.find((r) => r.localId === localId);
    const next = smRows.map((r) => (r.localId === localId ? { ...r, stateKey: key } : r));
    setSmRows(next);
    let nextInitial = smInitial;
    if (prev && smInitial === prev.stateKey) {
      nextInitial = key;
      setSmInitial(nextInitial);
    }
    pushDoc(root, serviceRows, advertising, nextInitial, next);
  }

  function patchSmStateData(localId: string, patch: Record<string, unknown>) {
    const next = smRows.map((r) =>
      r.localId === localId ? { ...r, stateData: { ...r.stateData, ...patch } } : r
    );
    setSmRows(next);
    pushDoc(root, serviceRows, advertising, smInitial, next);
  }

  function addSmTransition(stateLocalId: string) {
    const next = smRows.map((r) =>
      r.localId === stateLocalId
        ? {
            ...r,
            transitions: [
              ...r.transitions,
              {
                localId: genLocalId(),
                data: {
                  to: smRows.find((x) => x.localId !== stateLocalId)?.stateKey ?? '',
                  trigger: { type: 'manual' },
                  label: '',
                },
              },
            ],
          }
        : r
    );
    setSmRows(next);
    pushDoc(root, serviceRows, advertising, smInitial, next);
  }

  function patchSmTransition(stateLocalId: string, transLocalId: string, data: Record<string, unknown>) {
    const next = smRows.map((r) => {
      if (r.localId !== stateLocalId) {
        return r;
      }
      return {
        ...r,
        transitions: r.transitions.map((t) =>
          t.localId === transLocalId ? { ...t, data: { ...data } } : t
        ),
      };
    });
    setSmRows(next);
    pushDoc(root, serviceRows, advertising, smInitial, next);
  }

  function removeSmTransition(stateLocalId: string, transLocalId: string) {
    const next = smRows.map((r) =>
      r.localId === stateLocalId
        ? { ...r, transitions: r.transitions.filter((t) => t.localId !== transLocalId) }
        : r
    );
    setSmRows(next);
    pushDoc(root, serviceRows, advertising, smInitial, next);
  }

  function reorderTransitions(stateLocalId: string, activeId: string, overId: string) {
    const row = smRows.find((r) => r.localId === stateLocalId);
    if (!row) {
      return;
    }
    const ids = row.transitions.map((t) => `trn__${stateLocalId}__${t.localId}`);
    const oldIndex = ids.indexOf(activeId);
    const newIndex = ids.indexOf(overId);
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }
    const nextTr = arrayMove(row.transitions, oldIndex, newIndex);
    const next = smRows.map((r) =>
      r.localId === stateLocalId ? { ...r, transitions: nextTr } : r
    );
    setSmRows(next);
    pushDoc(root, serviceRows, advertising, smInitial, next);
  }

  return (
    <div className="profile-builder">
      <p className="muted" style={{ marginTop: 0 }}>
        Drag the handle (⠿) to reorder states, transitions, services, and characteristics. Deeper schema
        (state overrides, simulations, etc.) stays in the JSON tab.
      </p>
      <div className="card">
        <h2>Device</h2>
        <div className="field">
          <label htmlFor="bd-id">Profile id</label>
          <input
            id="bd-id"
            value={String(root.id ?? '')}
            onChange={(e) => patchRoot({ id: e.target.value })}
          />
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
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <div className="row" style={{ justifyContent: 'space-between', margin: '0.75rem 0' }}>
          <h2 style={{ margin: 0 }}>State machine</h2>
          <button type="button" className="btn btn-primary" onClick={addSmState}>
            + Add state
          </button>
        </div>
        {smRows.length > 0 && (
          <div className="card" style={{ marginBottom: '0.75rem' }}>
            <div className="field">
              <label htmlFor="bd-sm-initial">Initial state id</label>
              <select
                id="bd-sm-initial"
                value={
                  smRows.some((r) => r.stateKey === smInitial)
                    ? smInitial
                    : (smRows[0]?.stateKey ?? '')
                }
                onChange={(e) => {
                  const v = e.target.value;
                  setSmInitial(v);
                  pushDoc(root, serviceRows, advertising, v, smRows);
                }}
              >
                {smRows.map((r) => (
                  <option key={r.localId} value={r.stateKey}>
                    {r.stateKey || '(unnamed id)'}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        {smRows.length === 0 && (
          <p className="muted" style={{ marginBottom: '0.75rem' }}>
            No state machine in this profile yet. Add states to emit a stateMachine block; remove all states to
            omit it.
          </p>
        )}
        <SortableContext items={smStateIds} strategy={verticalListSortingStrategy}>
          {smRows.map((row) => (
            <SortableStateMachineBlock
              key={row.localId}
              id={`stm__${row.localId}`}
              row={row}
              allStateKeys={allSmStateKeys}
              onPatchStateKey={(key) => patchSmStateKey(row.localId, key)}
              onPatchStateData={(p) => patchSmStateData(row.localId, p)}
              onRemoveState={() => removeSmState(row.localId)}
              onAddTransition={() => addSmTransition(row.localId)}
              onPatchTransition={(tid, data) => patchSmTransition(row.localId, tid, data)}
              onRemoveTransition={(tid) => removeSmTransition(row.localId, tid)}
            />
          ))}
        </SortableContext>
        <div className="row" style={{ justifyContent: 'space-between', margin: '0.75rem 0' }}>
          <h2 style={{ margin: 0 }}>Services</h2>
          <button type="button" className="btn btn-primary" onClick={addService}>
            + Add service
          </button>
        </div>
        <SortableContext items={serviceIds} strategy={verticalListSortingStrategy}>
          {serviceRows.map((row) => (
            <SortableServiceBlock
              key={row.localId}
              id={`svc__${row.localId}`}
              row={row}
              onPatchService={(p) => patchService(row.localId, p)}
              onRemoveService={() => removeService(row.localId)}
              onAddChar={() => addChar(row.localId)}
              onPatchChar={(cid, p) => patchChar(row.localId, cid, p)}
              onRemoveChar={(cid) => removeChar(row.localId, cid)}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}
