export type CharRow = { localId: string; data: Record<string, unknown> };
export type ServiceRow = {
  localId: string;
  serviceData: Record<string, unknown>;
  characteristics: CharRow[];
};
export type TransitionRow = { localId: string; data: Record<string, unknown> };
export type StateMachineStateRow = {
  localId: string;
  stateKey: string;
  stateData: Record<string, unknown>;
  transitions: TransitionRow[];
};

const SERVICE_PREFIX = 'svc:';
const CHAR_PREFIX = 'chr:';
const SERVICE_DROP_PREFIX = 'svc-drop:';
const STATE_PREFIX = 'stm:';
const TRANSITION_PREFIX = 'trn:';
const STATE_DROP_PREFIX = 'stm-drop:';

export function serviceSortableId(localId: string): string {
  return `${SERVICE_PREFIX}${localId}`;
}

export function charSortableId(localId: string): string {
  return `${CHAR_PREFIX}${localId}`;
}

export function serviceDropId(localId: string): string {
  return `${SERVICE_DROP_PREFIX}${localId}`;
}

export function stateSortableId(localId: string): string {
  return `${STATE_PREFIX}${localId}`;
}

export function transitionSortableId(localId: string): string {
  return `${TRANSITION_PREFIX}${localId}`;
}

export function stateDropId(localId: string): string {
  return `${STATE_DROP_PREFIX}${localId}`;
}

export type DragKind =
  | 'service'
  | 'char'
  | 'state'
  | 'transition'
  | 'service-drop'
  | 'state-drop'
  | 'unknown';

export function dragKind(id: string): DragKind {
  if (id.startsWith(SERVICE_DROP_PREFIX)) return 'service-drop';
  if (id.startsWith(STATE_DROP_PREFIX)) return 'state-drop';
  if (id.startsWith(SERVICE_PREFIX)) return 'service';
  if (id.startsWith(CHAR_PREFIX)) return 'char';
  if (id.startsWith(STATE_PREFIX)) return 'state';
  if (id.startsWith(TRANSITION_PREFIX)) return 'transition';
  return 'unknown';
}

function arrayMove<T>(items: readonly T[], from: number, to: number): T[] {
  const next = items.slice();
  const [removed] = next.splice(from, 1);
  next.splice(to, 0, removed);
  return next;
}

function findParentId<P extends { localId: string }, C extends { localId: string }>(
  rows: readonly P[],
  childLocalId: string,
  childrenOf: (row: P) => readonly C[],
): string | null {
  for (const row of rows) {
    if (childrenOf(row).some((child) => child.localId === childLocalId)) {
      return row.localId;
    }
  }
  return null;
}

export function findServiceIdForChar(rows: ServiceRow[], charLocalId: string): string | null {
  return findParentId(rows, charLocalId, (row) => row.characteristics);
}

export function findStateIdForTransition(
  rows: StateMachineStateRow[],
  transLocalId: string,
): string | null {
  return findParentId(rows, transLocalId, (row) => row.transitions);
}

export function serviceIdFromDropTarget(rows: ServiceRow[], overId: string): string | null {
  const kind = dragKind(overId);
  if (kind === 'service') return overId.slice(SERVICE_PREFIX.length);
  if (kind === 'service-drop') return overId.slice(SERVICE_DROP_PREFIX.length);
  if (kind === 'char') return findServiceIdForChar(rows, overId.slice(CHAR_PREFIX.length));
  return null;
}

export function stateIdFromDropTarget(rows: StateMachineStateRow[], overId: string): string | null {
  const kind = dragKind(overId);
  if (kind === 'state') return overId.slice(STATE_PREFIX.length);
  if (kind === 'state-drop') return overId.slice(STATE_DROP_PREFIX.length);
  if (kind === 'transition') {
    return findStateIdForTransition(rows, overId.slice(TRANSITION_PREFIX.length));
  }
  return null;
}

function reorderTop<T extends { localId: string }>(
  rows: T[],
  activeLocalId: string | null,
  overLocalId: string | null,
): T[] {
  if (activeLocalId == null || overLocalId == null) return rows;
  const from = rows.findIndex((row) => row.localId === activeLocalId);
  const to = rows.findIndex((row) => row.localId === overLocalId);
  if (from < 0 || to < 0 || from === to) return rows;
  return arrayMove(rows, from, to);
}

export function reorderServices(rows: ServiceRow[], activeId: string, overId: string): ServiceRow[] {
  const activeLocalId = dragKind(activeId) === 'service' ? activeId.slice(SERVICE_PREFIX.length) : null;
  return reorderTop(rows, activeLocalId, serviceIdFromDropTarget(rows, overId));
}

export function reorderStates(
  rows: StateMachineStateRow[],
  activeId: string,
  overId: string,
): StateMachineStateRow[] {
  const activeLocalId = dragKind(activeId) === 'state' ? activeId.slice(STATE_PREFIX.length) : null;
  return reorderTop(rows, activeLocalId, stateIdFromDropTarget(rows, overId));
}

function moveChild<P extends { localId: string }, C extends { localId: string }>(
  rows: P[],
  activeId: string,
  overId: string,
  childKind: DragKind,
  childPrefix: string,
  parentKind: DragKind,
  dropKind: DragKind,
  parentIdFromTarget: (rows: P[], overId: string) => string | null,
  childrenOf: (row: P) => readonly C[],
  replaceChildren: (row: P, children: C[]) => P,
): P[] {
  if (dragKind(activeId) !== childKind || activeId === overId) return rows;
  const activeLocalId = activeId.slice(childPrefix.length);
  const sourceIdx = rows.findIndex((row) =>
    childrenOf(row).some((child) => child.localId === activeLocalId),
  );
  if (sourceIdx < 0) return rows;

  const overKind = dragKind(overId);
  if (overKind !== childKind && overKind !== parentKind && overKind !== dropKind) return rows;
  const destParentId = parentIdFromTarget(rows, overId);
  if (destParentId == null) return rows;

  const source = rows[sourceIdx];
  const sourceChildren = childrenOf(source);
  const from = sourceChildren.findIndex((child) => child.localId === activeLocalId);
  if (from < 0) return rows;

  const sameParent = source.localId === destParentId;
  const destIdx = sameParent ? sourceIdx : rows.findIndex((row) => row.localId === destParentId);
  if (destIdx < 0) return rows;

  if (sameParent) {
    const to =
      overKind === childKind
        ? sourceChildren.findIndex((child) => child.localId === overId.slice(childPrefix.length))
        : sourceChildren.length - 1;
    if (to < 0 || to === from) return rows;
    const nextChildren = arrayMove(sourceChildren, from, to);
    return rows.map((row, index) => (index === sourceIdx ? replaceChildren(row, nextChildren) : row));
  }

  const moving = sourceChildren[from];
  const nextSource = sourceChildren.filter((_, index) => index !== from);
  const destChildren = childrenOf(rows[destIdx]);
  let insertAt = destChildren.length;
  if (overKind === childKind) {
    insertAt = destChildren.findIndex((child) => child.localId === overId.slice(childPrefix.length));
    if (insertAt < 0) return rows;
  }
  // Cross-list: remove from the source first. Destination indexes do not shift.
  const nextDest = destChildren.slice();
  nextDest.splice(insertAt, 0, moving);
  return rows.map((row, index) => {
    if (index === sourceIdx) return replaceChildren(row, nextSource);
    if (index === destIdx) return replaceChildren(row, nextDest);
    return row;
  });
}

export function moveCharacteristic(rows: ServiceRow[], activeId: string, overId: string): ServiceRow[] {
  return moveChild(
    rows,
    activeId,
    overId,
    'char',
    CHAR_PREFIX,
    'service',
    'service-drop',
    serviceIdFromDropTarget,
    (row) => row.characteristics,
    (row, characteristics) => ({ ...row, characteristics }),
  );
}

export function moveTransition(
  rows: StateMachineStateRow[],
  activeId: string,
  overId: string,
): StateMachineStateRow[] {
  return moveChild(
    rows,
    activeId,
    overId,
    'transition',
    TRANSITION_PREFIX,
    'state',
    'state-drop',
    stateIdFromDropTarget,
    (row) => row.transitions,
    (row, transitions) => ({ ...row, transitions }),
  );
}

function moveItemBy<T extends { localId: string }>(items: T[], localId: string, delta: -1 | 1): T[] {
  const from = items.findIndex((item) => item.localId === localId);
  if (from < 0) return items;
  const to = from + delta;
  if (to < 0 || to >= items.length) return items;
  return arrayMove(items, from, to);
}

function moveNestedBy<P extends { localId: string }, C extends { localId: string }>(
  rows: P[],
  parentLocalId: string,
  childLocalId: string,
  delta: -1 | 1,
  childrenOf: (row: P) => readonly C[],
  replaceChildren: (row: P, children: C[]) => P,
): P[] {
  const parentIdx = rows.findIndex((row) => row.localId === parentLocalId);
  if (parentIdx < 0) return rows;
  const children = childrenOf(rows[parentIdx]);
  const from = children.findIndex((child) => child.localId === childLocalId);
  if (from < 0) return rows;
  const to = from + delta;
  if (to < 0 || to >= children.length) return rows;
  const nextChildren = arrayMove(children, from, to);
  return rows.map((row, index) => (index === parentIdx ? replaceChildren(row, nextChildren) : row));
}

export function moveServiceBy(rows: ServiceRow[], localId: string, delta: -1 | 1): ServiceRow[] {
  return moveItemBy(rows, localId, delta);
}

export function moveCharBy(
  rows: ServiceRow[],
  serviceLocalId: string,
  charLocalId: string,
  delta: -1 | 1,
): ServiceRow[] {
  return moveNestedBy(
    rows,
    serviceLocalId,
    charLocalId,
    delta,
    (row) => row.characteristics,
    (row, characteristics) => ({ ...row, characteristics }),
  );
}

export function moveStateBy(
  rows: StateMachineStateRow[],
  localId: string,
  delta: -1 | 1,
): StateMachineStateRow[] {
  return moveItemBy(rows, localId, delta);
}

export function moveTransitionBy(
  rows: StateMachineStateRow[],
  stateLocalId: string,
  transLocalId: string,
  delta: -1 | 1,
): StateMachineStateRow[] {
  return moveNestedBy(
    rows,
    stateLocalId,
    transLocalId,
    delta,
    (row) => row.transitions,
    (row, transitions) => ({ ...row, transitions }),
  );
}
