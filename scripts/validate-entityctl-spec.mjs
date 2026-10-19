#!/usr/bin/env node
// Offline integrity checks for the entityctl planning bundle. No provider calls.
// This checks planned coverage; it does not execute application acceptance tests.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--root')) {
  console.error('Usage: node scripts/validate-entityctl-spec.mjs [--root <repository>]');
  process.exit(2);
}
const root = args.length ? resolve(args[1]) : defaultRoot;
const change = 'add-entityctl-formation-simplefin';
const base = resolve(root, 'openspec/changes', change);
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };
const read = path => {
  if (!existsSync(path)) { failures.push(`Missing file: ${relative(root, path)}`); return ''; }
  return readFileSync(path, 'utf8');
};
const withoutFences = text => text.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
const unique = (values, label) => check(new Set(values).size === values.length, `Duplicate ${label}`);
const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));
const walkMarkdown = dir => !existsSync(dir) ? [] : readdirSync(dir, { withFileTypes: true })
  .flatMap(entry => entry.isDirectory() ? walkMarkdown(resolve(dir, entry.name))
    : entry.name.endsWith('.md') ? [resolve(dir, entry.name)] : []);

try {
  const trace = JSON.parse(read(resolve(base, 'traceability.json')) || '{}');
  check(trace.change === change && trace.prd_id === '0001', 'Traceability points to the wrong change/PRD');
  check(trace.schema_version === '1.0', 'Unknown local traceability schema version');
  check(typeof trace.prd === 'string' && /^prd\/0001-[a-z0-9-]+\.md$/.test(trace.prd), 'Invalid PRD reference');
  const prdPath = resolve(root, trace.prd || 'missing-prd');
  const prd = read(prdPath);
  check(/^openprd: ['"]0\.3['"]$/m.test(prd), 'PRD must declare OpenPRD 0.3');
  check(/^id: ['"]0001['"]$/m.test(prd), 'PRD ID does not match traceability/filename');
  check(/^repo: profullstack\/sh1pt$/m.test(prd), 'PRD repository is unresolved');
  const status = prd.match(/^status: (\w+)$/m)?.[1];
  check(trace.status === status, 'Traceability lifecycle differs from PRD');
  const requiredSections = ['Problem', 'Goals', 'Non-Goals', 'Users', 'Requirements', 'UX Notes', 'Tech Stack', 'Monetization', 'Success Metrics', 'Risks & Open Questions'];
  const sections = [...withoutFences(prd).matchAll(/^## (.+)$/gm)].map(m => m[1]);
  check(JSON.stringify(sections) === JSON.stringify(requiredSections), 'PRD must contain the ten ordered OpenPRD 0.3 sections');
  const requirements = [...prd.matchAll(/^- (R\d+) \[(P[01])\] \*\*(.*?)\*\* (.+)$/gm)];
  const ids = requirements.map(m => m[1]);
  const expected = Array.from({ length: 56 }, (_, i) => `R${i + 1}`);
  check(JSON.stringify(ids) === JSON.stringify(expected), 'PRD requirements must be R1–R56 in order, exactly once');
  unique(ids, 'PRD requirements');
  const reqMap = new Map(requirements.map(m => [m[1], { priority: m[2], title: m[3], body: m[4] }]));

  const footnotes = [...prd.matchAll(/^\[\^([^\]]+)\]:/gm)].map(m => m[1]);
  unique(footnotes, 'source definitions');
  for (const match of prd.matchAll(/\[\^([^\]]+)\]/g)) {
    check(footnotes.includes(match[1]), `Undefined PRD source: ${match[1]}`);
  }
  for (const block of prd.matchAll(/^```json\n([\s\S]*?)^```/gm)) JSON.parse(block[1]);

  const tasksText = read(resolve(base, 'tasks.md'));
  const tasks = [...tasksText.matchAll(/^- \[([ x])\] (\d+\.\d+) (.+)$/gm)];
  const taskMap = new Map(tasks.map(m => [m[2], { checked: m[1] === 'x', text: m[3] }]));
  unique(tasks.map(m => m[2]), 'task IDs');
  check(tasks.length > 0, 'No implementation tasks');
  const taskLines = tasksText.split('\n').filter(line => /^- \[[^\]]*\]/.test(line));
  check(taskLines.length === tasks.length, 'Malformed OpenSpec task checkbox or ID');
  for (const task of tasks) check(/\bverify\b/i.test(task[3]), `Task ${task[2]} lacks explicit verification`);

  const specFiles = walkMarkdown(resolve(base, 'specs'));
  check(specFiles.length === 12, 'Expected twelve capability specs');
  const specRequirements = new Map();
  const allScenarios = [];
  for (const path of specFiles) {
    const content = read(path);
    check(content.startsWith('## ADDED Requirements\n'), `${relative(base, path)} must be an ADDED delta for the discovered empty inventory`);
    const blocks = [...content.matchAll(/^### Requirement: (R\d+) (.+)\n([\s\S]*?)(?=^### Requirement: |$(?![\s\S]))/gm)];
    check(blocks.length > 0, `No requirements in ${relative(base, path)}`);
    for (const [, id, title, block] of blocks) {
      check(!specRequirements.has(id), `Duplicate spec requirement ${id}`);
      const scenarioBlocks = [...block.matchAll(/^#### Scenario: (R\d+-S\d+) (.+)\n([\s\S]*?)(?=^#### Scenario: |$(?![\s\S]))/gm)];
      check(scenarioBlocks.length >= 1, `${id} lacks scenarios`);
      for (const [, sid, , scenario] of scenarioBlocks) {
        check(sid.startsWith(`${id}-S`), `${sid} is under the wrong requirement`);
        check(/^- \*\*WHEN\*\* .+/m.test(scenario) && /^- \*\*THEN\*\* .+/m.test(scenario), `${sid} lacks WHEN/THEN`);
        allScenarios.push(sid);
      }
      const req = reqMap.get(id);
      check(Boolean(req), `Spec has unknown requirement ${id}`);
      if (req) {
        check(title === req.title.replace(/\.$/, ''), `${id} title differs from PRD`);
        check(block.includes(`Priority: ${req.priority}.`), `${id} priority differs from PRD`);
        const normative = req.body.replace(/\s*\[\^[^\]]+\]/g, '');
        check(block.includes(normative), `${id} normative text differs from PRD`);
        check(/\bSHALL\b/.test(normative), `${id} lacks normative SHALL`);
      }
      specRequirements.set(id, { path: relative(base, path), scenarios: scenarioBlocks.map(m => m[1]) });
    }
  }
  unique(allScenarios, 'scenario IDs');
  check(sameSet([...specRequirements.keys()], expected), 'Spec requirements do not match R1–R56');

  const entries = trace.requirements || [];
  unique(entries.map(e => e.requirement_id), 'traceability requirements');
  check(sameSet(entries.map(e => e.requirement_id), expected), 'Traceability does not cover R1–R56');
  const referencedTasks = new Set();
  for (const entry of entries) {
    const id = entry.requirement_id;
    const req = reqMap.get(id);
    const spec = specRequirements.get(id);
    check(req && entry.priority === req.priority && entry.requirement_title === req.title, `${id} traceability differs from PRD`);
    check(entry.priority === (id === 'R29' ? 'P1' : 'P0'), `${id} has unexpected release priority`);
    check(spec && entry.spec === spec.path && entry.spec === `specs/${entry.capability}/spec.md`, `${id} spec path mismatch`);
    check(spec && sameSet(entry.scenario_ids || [], spec.scenarios), `${id} scenario mapping is incomplete`);
    check(Array.isArray(entry.task_ids) && entry.task_ids.length > 0, `${id} has no task coverage`);
    for (const tid of entry.task_ids || []) {
      referencedTasks.add(tid);
      const task = taskMap.get(tid);
      check(Boolean(task), `${id} references missing task ${tid}`);
      check(task && new RegExp(`\\b${id}\\b`).test(task.text), `${id} task ${tid} lacks requirement reference`);
    }
    for (const kind of ['software', 'production']) {
      const evidence = entry[`${kind}_evidence_refs`];
      check(Array.isArray(evidence), `${id} lacks ${kind} evidence slots`);
    }
    check(['not_run', 'passed', 'failed'].includes(entry.software_test_status), `${id} has unknown test status`);
    if (entry.software_test_status === 'passed') check(entry.software_evidence_refs?.length > 0, `${id} claims passing tests without evidence`);
    if (entry.production_evidence_status !== 'not_collected') check(entry.production_evidence_refs?.length > 0, `${id} claims production evidence without references`);
  }
  for (const tid of taskMap.keys()) check(referencedTasks.has(tid), `Task ${tid} has no traceability mapping`);

  const journeys = trace.launch_journeys || [];
  check(journeys.length === 9, 'Expected nine launch-critical journeys');
  unique(journeys.map(j => j.id), 'journey IDs');
  for (const j of journeys) {
    check(taskMap.has(j.task_id), `Journey ${j.id} lacks an acceptance task`);
    check(j.requirements?.length > 0 && j.requirements.every(id => ids.includes(id)), `Journey ${j.id} has invalid requirements`);
    for (const id of j.requirements || []) check(entries.find(e => e.requirement_id === id)?.task_ids.includes(j.task_id), `Journey ${j.id} is missing from ${id} task coverage`);
  }
  const matrix = read(resolve(base, 'traceability.md'));
  for (const id of ids) check(matrix.includes(`| ${id} |`), `${id} missing from human-readable traceability`);
  for (const file of ['proposal.md', 'design.md', 'tasks.md', 'discovery.md', 'sources.md', 'validation.md', '.openspec.yaml']) read(resolve(base, file));
  read(resolve(root, 'openspec/config.yaml'));

  // Local Markdown targets only: availability of external URLs is a separate check.
  const documents = [...walkMarkdown(base), ...walkMarkdown(resolve(root, 'prd')), resolve(root, 'docs/openprd.md')];
  for (const path of documents) {
    const content = withoutFences(read(path));
    for (const [, target] of content.matchAll(/\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const pathname = target.split('#')[0];
      check(existsSync(resolve(dirname(path), decodeURIComponent(pathname))), `Broken local link in ${relative(root, path)}: ${target}`);
    }
  }

  if (failures.length) {
    failures.forEach(message => console.error(`FAIL: ${message}`));
    process.exitCode = 1;
  } else {
    console.log(`Valid planning bundle: ${ids.length} requirements, ${specFiles.length} capabilities, ${allScenarios.length} scenarios, ${tasks.length} tasks, ${journeys.length} launch journeys.`);
    console.log('Normative text, priorities, sources, local links and traceability agree. Application tests and live provider qualification are not executed by this check.');
  }
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
}
