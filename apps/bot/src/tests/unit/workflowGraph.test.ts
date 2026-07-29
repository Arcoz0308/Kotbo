import { describe, expect, test } from 'bun:test';
import {
  canConnect,
  needsCoercion,
  getNodeDef,
  isTriggerNode,
  resolveExecOutputs,
  triggerEventNames,
  validateGraph,
  hasBlockingIssue,
  NODE_CATALOG,
  DEFAULT_BUDGET,
  type WorkflowGraph,
} from '@kotbo/shared';

// ── Fabriques de graphes ────────────────────────────────────────────────────
let idCounter = 0;
function node(type: string, config?: Record<string, unknown>, id?: string) {
  return { id: id ?? `n${++idCounter}`, type, position: { x: 0, y: 0 }, config };
}
function edge(source: string, sourceHandle: string, target: string, targetHandle: string) {
  return { id: `${source}.${sourceHandle}->${target}.${targetHandle}`, source, sourceHandle, target, targetHandle };
}
function graph(nodes: WorkflowGraph['nodes'], edges: WorkflowGraph['edges'] = []): WorkflowGraph {
  return { nodes, edges };
}

function codes(issues: { code: string }[]): string[] {
  return issues.map((i) => i.code);
}

describe('canConnect', () => {
  test('accepte deux ports de même type', () => {
    expect(canConnect('Member', 'Member')).toBe(true);
    expect(canConnect('Exec', 'Exec')).toBe(true);
  });

  test('convertit implicitement tout type métier en texte', () => {
    expect(canConnect('Member', 'String')).toBe(true);
    expect(canConnect('Role', 'String')).toBe(true);
    expect(canConnect('Number', 'String')).toBe(true);
  });

  test('refuse les conversions dans l\'autre sens', () => {
    expect(canConnect('String', 'Number')).toBe(false);
    expect(canConnect('String', 'Member')).toBe(false);
    expect(canConnect('Member', 'Role')).toBe(false);
  });

  test('isole complètement le flux d\'exécution des données', () => {
    expect(canConnect('Exec', 'String')).toBe(false);
    expect(canConnect('String', 'Exec')).toBe(false);
    expect(canConnect('Member', 'Exec')).toBe(false);
  });
});

describe('needsCoercion', () => {
  test('signale une conversion vers du texte', () => {
    expect(needsCoercion('Member', 'String')).toBe(true);
  });

  test('ne signale rien entre types identiques', () => {
    expect(needsCoercion('String', 'String')).toBe(false);
  });
});

describe('catalogue', () => {
  test('chaque type de nœud est unique', () => {
    const types = NODE_CATALOG.map((def) => def.type);
    expect(new Set(types).size).toBe(types.length);
  });

  test('tout déclencheur déclare un événement de bus et n\'a pas d\'entrée d\'exécution', () => {
    for (const def of NODE_CATALOG.filter((d) => d.category === 'trigger')) {
      expect(def.event).toBeTruthy();
      expect(def.inputs.some((port) => port.type === 'Exec')).toBe(false);
    }
  });

  test('tout nœud d\'action possède une entrée et une sortie d\'exécution', () => {
    for (const def of NODE_CATALOG.filter((d) => d.category === 'action')) {
      expect(def.inputs.some((port) => port.type === 'Exec')).toBe(true);
      expect(def.outputs.some((port) => port.type === 'Exec')).toBe(true);
    }
  });

  test('les nœuds de données et de logique ne touchent jamais au flux d\'exécution', () => {
    for (const def of NODE_CATALOG.filter((d) => d.category === 'data' || d.category === 'logic')) {
      expect([...def.inputs, ...def.outputs].some((port) => port.type === 'Exec')).toBe(false);
    }
  });

  test('les identifiants de ports sont uniques au sein d\'un nœud', () => {
    for (const def of NODE_CATALOG) {
      const inputIds = def.inputs.map((p) => p.id);
      const outputIds = def.outputs.map((p) => p.id);
      expect(new Set(inputIds).size).toBe(inputIds.length);
      expect(new Set(outputIds).size).toBe(outputIds.length);
    }
  });

  test('expose les événements de bus sans doublon', () => {
    const events = triggerEventNames();
    expect(new Set(events).size).toBe(events.length);
    expect(events).toContain('member:join');
    expect(events).toContain('ticket:created');
  });

  test('reconnaît les déclencheurs', () => {
    expect(isTriggerNode('OnMemberJoin')).toBe(true);
    expect(isTriggerNode('SendDM')).toBe(false);
    expect(getNodeDef('TypeInconnu')).toBeUndefined();
  });
});

describe('resolveExecOutputs', () => {
  test('génère une sortie par cas du Switch, plus Sinon', () => {
    const outputs = resolveExecOutputs('Switch', { cases: ['alpha', 'beta'] });
    expect(outputs.map((p) => p.id)).toEqual(['case-0', 'case-1', 'default']);
    expect(outputs[0].label).toBe('alpha');
  });

  test('ne garde que Sinon quand aucun cas n\'est saisi', () => {
    expect(resolveExecOutputs('Switch', {}).map((p) => p.id)).toEqual(['default']);
  });

  test('ignore les cas vides ou mal typés', () => {
    const outputs = resolveExecOutputs('Switch', { cases: ['ok', '', 42, null] });
    expect(outputs.map((p) => p.id)).toEqual(['case-0', 'default']);
  });

  test('retourne les deux branches du nœud Si', () => {
    expect(resolveExecOutputs('If').map((p) => p.id)).toEqual(['true', 'false']);
  });
});

describe('validateGraph', () => {
  test('refuse un graphe vide', () => {
    expect(codes(validateGraph(graph([])))).toContain('EMPTY_GRAPH');
  });

  test('refuse un graphe sans déclencheur', () => {
    const send = node('SendDM', {}, 'send');
    expect(codes(validateGraph(graph([send])))).toContain('NO_TRIGGER');
  });

  test('refuse deux déclencheurs', () => {
    const issues = validateGraph(graph([node('OnMemberJoin', {}, 'a'), node('OnMemberLeave', {}, 'b')]));
    expect(codes(issues)).toContain('MULTIPLE_TRIGGERS');
  });

  test('refuse un type de nœud inconnu', () => {
    const issues = validateGraph(graph([node('OnMemberJoin', {}, 't'), node('NImporteQuoi', {}, 'x')]));
    expect(codes(issues)).toContain('UNKNOWN_NODE_TYPE');
  });

  test('refuse un graphe au-delà de la limite de nœuds', () => {
    const nodes = [node('OnMemberJoin', {}, 't')];
    for (let i = 0; i < DEFAULT_BUDGET.maxNodes; i++) nodes.push(node('ConstText', { value: 'x' }, `c${i}`));
    expect(codes(validateGraph(graph(nodes)))).toContain('TOO_MANY_NODES');
  });

  test('accepte un workflow minimal valide', () => {
    const issues = validateGraph(graph(
      [
        node('OnMemberJoin', {}, 't'),
        node('SelectRole', { roleId: '123' }, 'r'),
        node('AddRole', {}, 'a'),
      ],
      [
        edge('t', 'next', 'a', 'exec'),
        edge('t', 'member', 'a', 'member'),
        edge('r', 'role', 'a', 'role'),
      ],
    ));
    expect(hasBlockingIssue(issues)).toBe(false);
  });

  test('refuse un fil entre types incompatibles', () => {
    const issues = validateGraph(graph(
      [node('OnMemberJoin', {}, 't'), node('AddRole', {}, 'a')],
      [edge('t', 'next', 'a', 'exec'), edge('t', 'member', 'a', 'role')],
    ));
    expect(codes(issues)).toContain('TYPE_MISMATCH');
  });

  test('accepte la conversion implicite d\'un membre en texte', () => {
    const issues = validateGraph(graph(
      [
        node('OnMemberJoin', {}, 't'),
        node('SelectChannel', { channelId: '9' }, 'c'),
        node('SendMessage', {}, 's'),
      ],
      [
        edge('t', 'next', 's', 'exec'),
        edge('c', 'channel', 's', 'channel'),
        edge('t', 'member', 's', 'text'),
      ],
    ));
    expect(codes(issues)).not.toContain('TYPE_MISMATCH');
  });

  test('refuse un fil vers un port inexistant', () => {
    const issues = validateGraph(graph(
      [node('OnMemberJoin', {}, 't'), node('SendDM', {}, 's')],
      [edge('t', 'next', 's', 'portFantome')],
    ));
    expect(codes(issues)).toContain('UNKNOWN_PORT');
  });

  test('refuse un fil rattaché à un nœud inexistant', () => {
    const issues = validateGraph(graph(
      [node('OnMemberJoin', {}, 't')],
      [edge('t', 'next', 'disparu', 'exec')],
    ));
    expect(codes(issues)).toContain('DANGLING_EDGE');
  });

  test('refuse qu\'une sortie d\'exécution alimente deux nœuds', () => {
    const issues = validateGraph(graph(
      [
        node('OnMemberJoin', {}, 't'),
        node('SelectRole', { roleId: '1' }, 'r'),
        node('AddRole', {}, 'a'),
        node('RemoveRole', {}, 'b'),
      ],
      [
        edge('t', 'next', 'a', 'exec'),
        edge('t', 'next', 'b', 'exec'),
        edge('t', 'member', 'a', 'member'),
        edge('t', 'member', 'b', 'member'),
        edge('r', 'role', 'a', 'role'),
        edge('r', 'role', 'b', 'role'),
      ],
    ));
    expect(codes(issues)).toContain('EXEC_FORK');
  });

  test('refuse deux fils sur une même entrée de données', () => {
    const issues = validateGraph(graph(
      [
        node('OnMemberJoin', {}, 't'),
        node('ConstText', { value: 'a' }, 'c1'),
        node('ConstText', { value: 'b' }, 'c2'),
        node('SendDM', {}, 's'),
      ],
      [
        edge('t', 'next', 's', 'exec'),
        edge('t', 'member', 's', 'member'),
        edge('c1', 'value', 's', 'text'),
        edge('c2', 'value', 's', 'text'),
      ],
    ));
    expect(codes(issues)).toContain('DATA_MERGE');
  });

  test('signale une entrée obligatoire non renseignée', () => {
    const issues = validateGraph(graph(
      [node('OnMemberJoin', {}, 't'), node('AddRole', {}, 'a')],
      [edge('t', 'next', 'a', 'exec'), edge('t', 'member', 'a', 'member')],
    ));
    // Le port « Rôle » n'est ni câblé ni configuré
    expect(codes(issues)).toContain('MISSING_INPUT');
  });

  test('accepte une entrée renseignée par la configuration plutôt qu\'un fil', () => {
    const issues = validateGraph(graph(
      [node('OnMemberJoin', {}, 't'), node('Delay', { seconds: 30 }, 'd')],
      [edge('t', 'next', 'd', 'exec')],
    ));
    expect(codes(issues)).not.toContain('MISSING_INPUT');
  });

  test('n\'exige pas les entrées marquées optionnelles', () => {
    const issues = validateGraph(graph(
      [node('OnMemberJoin', {}, 't'), node('KickMember', {}, 'k')],
      [edge('t', 'next', 'k', 'exec'), edge('t', 'member', 'k', 'member')],
    ));
    // « Motif » est optionnel
    expect(codes(issues)).not.toContain('MISSING_INPUT');
  });

  test('refuse un cycle dans le flux d\'exécution', () => {
    const issues = validateGraph(graph(
      [
        node('OnMemberJoin', {}, 't'),
        node('Delay', { seconds: 5 }, 'd1'),
        node('Delay', { seconds: 5 }, 'd2'),
      ],
      [
        edge('t', 'next', 'd1', 'exec'),
        edge('d1', 'next', 'd2', 'exec'),
        edge('d2', 'next', 'd1', 'exec'),
      ],
    ));
    expect(codes(issues)).toContain('EXEC_CYCLE');
  });

  test('refuse un cycle entre nœuds de données', () => {
    const issues = validateGraph(graph(
      [
        node('OnMemberJoin', {}, 't'),
        node('Concat', {}, 'c1'),
        node('Concat', {}, 'c2'),
      ],
      [
        edge('c1', 'result', 'c2', 'a'),
        edge('c2', 'result', 'c1', 'a'),
        edge('c1', 'result', 'c2', 'b'),
      ],
    ));
    expect(codes(issues)).toContain('DATA_CYCLE');
  });

  test('avertit sur une action jamais atteinte par le flux', () => {
    const issues = validateGraph(graph(
      [
        node('OnMemberJoin', {}, 't'),
        node('SelectRole', { roleId: '1' }, 'r'),
        node('AddRole', {}, 'orphelin'),
      ],
      [edge('t', 'member', 'orphelin', 'member'), edge('r', 'role', 'orphelin', 'role')],
    ));
    expect(codes(issues)).toContain('UNREACHABLE_NODE');
    // Un avertissement ne doit pas bloquer l'enregistrement
    expect(issues.find((i) => i.code === 'UNREACHABLE_NODE')?.severity).toBe('warning');
  });

  test('n\'avertit pas sur les nœuds de données non atteints par le flux', () => {
    const issues = validateGraph(graph(
      [
        node('OnMemberJoin', {}, 't'),
        node('SelectRole', { roleId: '1' }, 'r'),
        node('AddRole', {}, 'a'),
      ],
      [edge('t', 'next', 'a', 'exec'), edge('t', 'member', 'a', 'member'), edge('r', 'role', 'a', 'role')],
    ));
    expect(codes(issues)).not.toContain('UNREACHABLE_NODE');
  });

  test('valide un graphe utilisant Si et ForEach', () => {
    const issues = validateGraph(graph(
      [
        node('OnMemberJoin', {}, 't'),
        node('MemberInfo', {}, 'info'),
        node('SelectRole', { roleId: '1' }, 'r'),
        node('HasRole', {}, 'has'),
        node('If', {}, 'if'),
        node('ForEach', {}, 'loop'),
        node('RemoveRole', {}, 'rm'),
      ],
      [
        edge('t', 'next', 'if', 'exec'),
        edge('t', 'member', 'info', 'member'),
        edge('t', 'member', 'has', 'member'),
        edge('r', 'role', 'has', 'role'),
        edge('has', 'result', 'if', 'condition'),
        edge('if', 'true', 'loop', 'exec'),
        edge('info', 'roles', 'loop', 'list'),
        edge('loop', 'body', 'rm', 'exec'),
        edge('t', 'member', 'rm', 'member'),
        edge('r', 'role', 'rm', 'role'),
      ],
    ));
    expect(hasBlockingIssue(issues)).toBe(false);
  });
});
