#!/usr/bin/env node
/**
 * PAC-MAN, as a Symbia dataflow graph.
 *
 * Sixteen components built to track the provenance of federal spending
 * aggregates, arranged into a maze game. Nothing was added. The jokes are
 * all load-bearing:
 *
 *   THE MAZE IS THE PORT LIST. symbia.logic.switch emits on the port named
 *   by a field's value, or "default" if no such port exists. Give it one
 *   port per open tile and walls become the default branch. The graph's
 *   topology *is* the level layout.
 *
 *   THE WIN CONDITION IS A ROLLUP. symbia.state.rollup exists to stop a
 *   partial total passing as the total. Declare the dots as its expected
 *   set and it refuses to call the board cleared while any remain — naming
 *   exactly which ones, on the apocryphal lane. "You have not won yet" is,
 *   precisely, lane: apocryphal.
 *
 *   POSITION IS ONE NUMBER. y*W+x, so movement is four arithmetic nodes
 *   (+/-1, +/-W) instead of eight, and every move carries a recipe receipt
 *   showing the tile it came from.
 */
import { writeFileSync } from 'node:fs';

const W = 7, H = 7;
const MAZE = [
  '#######',
  '#P....#',
  '#.#.#.#',
  '#.....#',
  '#.#.#.#',
  '#....G#',
  '#######',
].join('');

const tiles = [...MAZE];
const open = [], dots = [];
let pacStart = 0, ghostStart = 0;
tiles.forEach((c, i) => {
  if (c === '#') return;
  open.push(i);
  if (c === '.') dots.push(i);
  if (c === 'P') pacStart = i;
  if (c === 'G') { ghostStart = i; dots.push(i); }
});

const S = (n) => String(n);
const node = (id, component, config) => (config ? { id, component, config } : { id, component });
const edge = (id, s, sp, t, tp) => ({ id, source: { node: s, port: sp }, target: { node: t, port: tp } });

const nodes = [
  node('entry', 'symbia.io.passthrough'),
  node('dir', 'symbia.logic.switch', { field: 'dir', ports: ['up', 'down', 'left', 'right'] }),
  node('mv_up', 'symbia.compute.arithmetic', { expression: `{pos} - ${W}` }),
  node('mv_down', 'symbia.compute.arithmetic', { expression: `{pos} + ${W}` }),
  node('mv_left', 'symbia.compute.arithmetic', { expression: '{pos} - 1' }),
  node('mv_right', 'symbia.compute.arithmetic', { expression: '{pos} + 1' }),
  node('shape', 'symbia.transform.map', { mapping: { pos: 'result', key: 'result', value: 'exact' } }),
  node('maze', 'symbia.logic.switch', { field: 'pos', ports: open.map(S) }),
  node('board', 'symbia.state.rollup', {
    expected: dots.map(S), op: 'sum', keyField: 'key', valueField: 'value',
  }),
  node('moved', 'symbia.io.collect'),
  node('blocked', 'symbia.io.collect'),
  node('badmove', 'symbia.io.collect'),
];

const edges = [
  edge('e_in', 'entry', 'out', 'dir', 'in'),
  edge('e_up', 'dir', 'up', 'mv_up', 'in'),
  edge('e_dn', 'dir', 'down', 'mv_down', 'in'),
  edge('e_lf', 'dir', 'left', 'mv_left', 'in'),
  edge('e_rt', 'dir', 'right', 'mv_right', 'in'),
  edge('e_bad', 'dir', 'default', 'badmove', 'in'),
  ...['up', 'down', 'left', 'right'].map((d, i) => edge(`e_s${i}`, `mv_${d}`, 'out', 'shape', 'in')),
  ...['up', 'down', 'left', 'right'].map((d, i) => edge(`e_e${i}`, `mv_${d}`, 'error', 'badmove', 'in')),
  edge('e_maze', 'shape', 'out', 'maze', 'in'),
  ...open.map((t, i) => edge(`e_t${i}`, 'maze', S(t), 'board', 'in')),
  edge('e_wall', 'maze', 'default', 'blocked', 'in'),
  edge('e_board', 'board', 'out', 'moved', 'in'),
];

const graph = {
  symbia: 'graph/1.0',
  name: 'pacman',
  version: '1.0.0',
  author: 'imagine',
  description:
    'Pac-Man as a dataflow graph. The maze is the switch port list; walls are the default branch. ' +
    'The win condition is a rollup over the dots: while any remain the board is apocryphal and names them.',
  nodes, edges,
  metadata: {
    ingress: { node: 'entry', port: 'in' },
    game: { width: W, height: H, maze: MAZE, open, dots, pacStart, ghostStart },
    expects:
      'A move into a wall lands on blocked and the board is unchanged. A move onto a dot advances ' +
      'coverage. The board emits apocryphal until every dot in the expected set has been visited, ' +
      'then canonical — winning is a lane transition.',
  },
};

writeFileSync('/tmp/pacman/pacman.graph.json', JSON.stringify(graph, null, 2));
writeFileSync('/tmp/pacman/level.json', JSON.stringify({ W, H, MAZE, open, dots, pacStart, ghostStart }));
console.log(`maze ${W}x${H} — ${open.length} open tiles, ${dots.length} dots`);
console.log(`nodes ${nodes.length}, edges ${edges.length} (${open.length} of them are the level)`);
console.log(`pac starts ${pacStart}, ghost ${ghostStart}`);
