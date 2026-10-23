/**
 * verify-think-stream-abort.mjs — /think 流式中断契约。
 *
 * 背景：四个 tab 的 AI 反馈都是流式的，而「换一题 / 删掉当前 AI 题」会换掉
 * 当前上下文。旧实现只在卸载时 abort，换题后上一题的流仍会把内容写进新题结果框
 * （docs/modules/think-in-english.md §3.2）。修复不是只加一行 abort，而是四条一起成立：
 *   1. 新提交先 abort 上一代请求，再创建 controller；
 *   2. 流循环第一件事就是查 signal.aborted，中止后不再 setState；
 *   3. catch 对 abort 静默返回（否则换题会误报“AI 服务暂不可用”）；
 *   4. finally 只在 ref 仍指向自己这一代时才清 loading/ref（否则旧流的收尾会把
 *      新请求的 loading 清掉，用户能连点重复提交）。
 * 另外六条「离开当前题」的路径（三个 next* + 三个删除）和卸载清理也必须 abort。
 *
 * 本守卫用 TypeScript AST 检查真实页面源码，并内置 9 条变异：
 * 每条变异单独施加后必须恰好红一条断言，防止守卫自己变成恒真。
 *
 * 用法：node scripts/verify-think-stream-abort.mjs
 */
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'src/pages/ThinkInEnglishPage/ThinkInEnglishPage.tsx';

let pass = 0;
let fail = 0;
const failures = [];
const check = (cond, label, detail) => {
  if (cond) pass++;
  else {
    fail++;
    failures.push(label + (detail ? ` — ${detail}` : ''));
  }
};

const SUBMITS = [
  { name: 'handleDetectorSubmit', ref: 'detectorAbortRef', loading: 'setDetectorLoading', result: 'setDetectorResult' },
  { name: 'handleTranslationSubmit', ref: 'translationAbortRef', loading: 'setTranslationLoading', result: 'setTranslationResult' },
  { name: 'handleBackSubmit', ref: 'backAbortRef', loading: 'setBackLoading', result: 'setBackResult' },
  { name: 'handleNativeSubmit', ref: 'nativeAbortRef', loading: 'setNativeLoading', result: 'setNativeResult' },
];

const LEAVES = [
  { name: 'nextExercise', ref: 'translationAbortRef', loading: 'setTranslationLoading' },
  { name: 'nextBackExercise', ref: 'backAbortRef', loading: 'setBackLoading' },
  { name: 'nextNativeExercise', ref: 'nativeAbortRef', loading: 'setNativeLoading' },
  { name: 'handleDeleteTranslation', ref: 'translationAbortRef', loading: 'setTranslationLoading' },
  { name: 'handleDeleteBack', ref: 'backAbortRef', loading: 'setBackLoading' },
  { name: 'handleDeleteNative', ref: 'nativeAbortRef', loading: 'setNativeLoading' },
];

function collect(node, pred) {
  const out = [];
  const visit = (n) => {
    if (pred(n)) out.push(n);
    ts.forEachChild(n, visit);
  };
  visit(node);
  return out;
}

function findFn(sf, name) {
  let found = null;
  const visit = (n) => {
    if (found) return;
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === name &&
      n.initializer &&
      (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))
    ) {
      found = n.initializer;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

const callsTo = (node, text) =>
  collect(node, (n) => ts.isCallExpression(n) && n.getText() === text);

const abortCallsTo = (node, ref) =>
  collect(node, (n) => ts.isCallExpression(n) && n.expression.getText() === `${ref}.current?.abort`);

const assignmentsOf = (node, ref) =>
  collect(
    node,
    (n) =>
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      n.left.getText() === `${ref}.current` &&
      n.right.getText() === 'null',
  );

const isIdentityCheck = (stmt, ref) => {
  if (!ts.isIfStatement(stmt) || !ts.isBinaryExpression(stmt.expression)) return false;
  const { left, right, operatorToken } = stmt.expression;
  if (operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken) return false;
  return (
    (left.getText() === `${ref}.current` && right.getText() === 'controller') ||
    (left.getText() === 'controller' && right.getText() === `${ref}.current`)
  );
};

function inspect(source) {
  const sf = ts.createSourceFile(FILE, source, ts.ScriptTarget.Latest, true);
  const failures = new Map();
  const stats = {
    handlers: 0,
    catchGuards: 0,
    finallyGuards: 0,
    loops: 0,
    loopSetters: 0,
    historyGuards: 0,
    paths: 0,
    cleanupRefs: 0,
  };
  const fail = (id, why) => {
    if (!failures.has(id)) failures.set(id, why);
  };

  for (const spec of SUBMITS) {
    const fn = findFn(sf, spec.name);
    if (!fn) {
      fail(`handler:${spec.name}`, '找不到提交函数');
      continue;
    }
    stats.handlers++;

    const abortCalls = abortCallsTo(fn.body, spec.ref);
    const newControllers = collect(
      fn.body,
      (n) => ts.isNewExpression(n) && n.expression.getText() === 'AbortController',
    );
    if (
      abortCalls.length !== 1 ||
      newControllers.length !== 1 ||
      abortCalls[0].getStart(sf) > newControllers[0].getStart(sf)
    ) {
      fail(
        `abort-before-new:${spec.name}`,
        `期望 1 次 ${spec.ref}.current?.abort() 且在 new AbortController() 之前，实际 abort=${abortCalls.length} new=${newControllers.length}`,
      );
    }

    const tries = collect(fn.body, ts.isTryStatement);
    if (tries.length !== 1 || !tries[0].catchClause || !tries[0].finallyBlock) {
      fail(`try-shape:${spec.name}`, `期望 1 个带 catch/finally 的 try，实际 ${tries.length}`);
      continue;
    }
    const tryStmt = tries[0];

    const firstCatch = tryStmt.catchClause.block.statements[0];
    const catchOk =
      !!firstCatch &&
      ts.isIfStatement(firstCatch) &&
      firstCatch.expression.getText() === 'controller.signal.aborted' &&
      ts.isReturnStatement(firstCatch.thenStatement) &&
      !firstCatch.elseStatement &&
      collect(
        tryStmt.catchClause.block,
        (n) => ts.isCallExpression(n) && n.expression.getText() === 'toast.error',
      ).length >= 1;
    if (catchOk) stats.catchGuards++;
    else {
      fail(
        `catch-abort:${spec.name}`,
        'catch 首个语句必须是 if (controller.signal.aborted) return;，且真实失败仍会 toast',
      );
    }

    const firstFinally = tryStmt.finallyBlock.statements[0];
    const finallyOk =
      isIdentityCheck(firstFinally, spec.ref) &&
      callsTo(firstFinally.thenStatement, `${spec.loading}(false)`).length >= 1 &&
      assignmentsOf(firstFinally.thenStatement, spec.ref).length >= 1;
    if (finallyOk) stats.finallyGuards++;
    else {
      fail(
        `finally-identity:${spec.name}`,
        `finally 首句必须是 if (${spec.ref}.current === controller) 且块内含 ${spec.loading}(false) 与 ref=null`,
      );
    }

    const loops = collect(fn.body, (n) => ts.isForOfStatement(n) && !!n.awaitModifier);
    if (loops.length !== 2) {
      fail(`loops:${spec.name}:count`, `期望主路径 + 回落路径共 2 个 for await，实际 ${loops.length}`);
    }

    if (spec.name === 'handleDetectorSubmit') {
      const record = collect(
        fn.body,
        (n) => ts.isCallExpression(n) && n.getText() === 'recordDetectorHistory(input)',
      )[0];
      const loopsEnd = loops.length ? Math.max(...loops.map((l) => l.getEnd())) : 0;
      const abortedReturns = collect(
        fn.body,
        (n) =>
          ts.isIfStatement(n) &&
          n.expression.getText() === 'controller.signal.aborted' &&
          ts.isReturnStatement(n.thenStatement) &&
          !n.elseStatement,
      );
      const historyGuard = abortedReturns.find(
        (n) => record && n.getStart(sf) > loopsEnd && n.getStart(sf) < record.getStart(sf),
      );
      if (historyGuard) stats.historyGuards++;
      else {
        fail(
          'history-abort:handleDetectorSubmit',
          '检测历史与纠偏收集必须在流循环结束后先判 aborted，再按内容留档',
        );
      }
    }
    const seenKinds = new Set();
    for (const loop of loops) {
      const kind = loop.expression.getText().includes('as AsyncIterable') ? 'fallback' : 'primary';
      const id = `loop:${spec.name}:${kind}`;
      if (seenKinds.has(kind)) {
        fail(id, '同一提交流出现了重复的同类循环');
        continue;
      }
      seenKinds.add(kind);
      stats.loops++;

      if (!ts.isBlock(loop.statement)) {
        fail(id, '循环体不是块语句，无法确认断流先于写状态');
        continue;
      }
      const first = loop.statement.statements[0];
      const guardOk =
        !!first &&
        ts.isIfStatement(first) &&
        first.expression.getText() === 'controller.signal.aborted' &&
        ts.isBreakStatement(first.thenStatement) &&
        !first.elseStatement;
      const setters = callsTo(loop.statement, `${spec.result}(full)`);
      if (setters.length >= 1) stats.loopSetters++;
      if (!guardOk) {
        fail(id, '循环第一条语句必须是 if (controller.signal.aborted) break;');
      } else if (setters.length === 0) {
        fail(id, `循环内找不到 ${spec.result}(full)，断流检查变成空锁`);
      } else if (first.getStart(sf) > setters[0].getStart(sf)) {
        fail(id, '断流检查必须排在写结果之前');
      }
    }
  }

  for (const spec of LEAVES) {
    const fn = findFn(sf, spec.name);
    if (!fn) {
      fail(`path:${spec.name}`, '找不到离开当前题的函数');
      continue;
    }
    const abort = abortCallsTo(fn.body, spec.ref);
    const clear = assignmentsOf(fn.body, spec.ref);
    const loading = callsTo(fn.body, `${spec.loading}(false)`);
    if (abort.length < 1 || clear.length < 1 || loading.length < 1) {
      fail(
        `path:${spec.name}`,
        `期望 abort/clear/loading 三件套，实际 abort=${abort.length} clear=${clear.length} loading=${loading.length}`,
      );
      continue;
    }
    if (!(abort[0].getStart(sf) < clear[0].getStart(sf) && clear[0].getStart(sf) < loading[0].getStart(sf))) {
      fail(`path:${spec.name}`, '顺序必须是先 abort、再 clear ref、最后清 loading');
      continue;
    }
    stats.paths++;
  }

  const cleanupRefs = new Set();
  const useEffects = collect(
    sf,
    (n) => ts.isCallExpression(n) && n.expression.getText() === 'useEffect',
  );
  for (const call of useEffects) {
    const cb = call.arguments[0];
    if (!cb || !(ts.isArrowFunction(cb) || ts.isFunctionExpression(cb)) || !cb.body) continue;
    for (const ret of collect(cb.body, ts.isReturnStatement)) {
      if (!ret.expression || !(ts.isArrowFunction(ret.expression) || ts.isFunctionExpression(ret.expression))) {
        continue;
      }
      for (const c of collect(ret.expression, (n) => ts.isCallExpression(n))) {
        const m = /^([A-Za-z]+AbortRef)\.current\?\.abort$/.exec(c.expression.getText());
        if (m) cleanupRefs.add(m[1]);
      }
    }
  }
  stats.cleanupRefs = cleanupRefs.size;
  const expectedRefs = SUBMITS.map((s) => s.ref);
  if (cleanupRefs.size !== expectedRefs.length || !expectedRefs.every((r) => cleanupRefs.has(r))) {
    fail(
      'cleanup:all',
      `卸载清理应中止 ${expectedRefs.join(', ')}，实际 [${[...cleanupRefs].join(', ')}]`,
    );
  }

  return { failures, stats };
}

const replaceOnce = (source, before, after) => {
  const hits = source.split(before).length - 1;
  return { hits, out: hits === 1 ? source.replace(before, after) : source };
};

const DETECTOR_LOOP = `        for await (const chunk of stream) {
          if (controller.signal.aborted) break;
          if (chunk.content) {
            full += chunk.content;
            setDetectorResult(full);
          }
        }`;

const MUTATIONS = [
  {
    id: 'M1',
    label: '检测主回路删掉 aborted break',
    before: DETECTOR_LOOP,
    after: `        for await (const chunk of stream) {
          if (chunk.content) {
            full += chunk.content;
            setDetectorResult(full);
          }
        }`,
    expected: 'loop:handleDetectorSubmit:primary',
  },
  {
    id: 'M2',
    label: '思维转译新提交不再 abort 上一代',
    before: `    translationAbortRef.current?.abort();
    const controller = new AbortController();
    translationAbortRef.current = controller;`,
    after: `    const controller = new AbortController();
    translationAbortRef.current = controller;`,
    expected: 'abort-before-new:handleTranslationSubmit',
  },
  {
    id: 'M3',
    label: '反翻译 catch 对 abort 不再静默',
    before: `    } catch (err) {
      if (controller.signal.aborted) return;
      toast.error('AI 服务暂不可用，请稍后重试');
      setBackResult('> ⚠️ AI 服务连接失败，请检查网络后重试。');`,
    after: `    } catch (err) {
      toast.error('AI 服务暂不可用，请稍后重试');
      setBackResult('> ⚠️ AI 服务连接失败，请检查网络后重试。');`,
    expected: 'catch-abort:handleBackSubmit',
  },
  {
    id: 'M4',
    label: '思维还原 finally 去掉身份锁',
    before: '      if (nativeAbortRef.current === controller) {',
    after: '      if (true) {',
    expected: 'finally-identity:handleNativeSubmit',
  },
  {
    id: 'M5',
    label: '换一题不再 abort 在途流',
    before: `  const nextExercise = () => {
    if (translationExercises.length === 0) return;
    translationAbortRef.current?.abort();`,
    after: `  const nextExercise = () => {
    if (translationExercises.length === 0) return;`,
    expected: 'path:nextExercise',
  },
  {
    id: 'M6',
    label: '删除反翻译 AI 题不再 abort',
    before: `    const ex = backExercises[currentBackIdx];
    if (ex.id.startsWith('ai_')) {
      backAbortRef.current?.abort();`,
    after: `    const ex = backExercises[currentBackIdx];
    if (ex.id.startsWith('ai_')) {`,
    expected: 'path:handleDeleteBack',
  },
  {
    id: 'M7',
    label: '卸载清理漏掉一个 ref',
    before: `    return () => {
      detectorAbortRef.current?.abort();
      translationAbortRef.current?.abort();`,
    after: `    return () => {
      detectorAbortRef.current?.abort();`,
    expected: 'cleanup:all',
  },
  {
    id: 'M8',
    label: '断流检查挪到写结果之后',
    before: DETECTOR_LOOP,
    after: `        for await (const chunk of stream) {
          if (chunk.content) {
            full += chunk.content;
            setDetectorResult(full);
          }
          if (controller.signal.aborted) break;
        }`,
    expected: 'loop:handleDetectorSubmit:primary',
  },
  {
    id: 'M9',
    label: '检测历史在 abort 后仍会留档',
    before: `      if (controller.signal.aborted) return;
      if (full.trim()) {
        recordDetectorHistory(input);`,
    after: `      if (full.trim()) {
        recordDetectorHistory(input);`,
    expected: 'history-abort:handleDetectorSubmit',
  },
];

const src = readFileSync(join(ROOT, FILE), 'utf8').replace(/\r\n/g, '\n');
const real = inspect(src);

const summarize = (map) => [...map.entries()].map(([id, why]) => `${id}（${why}）`).join(' | ');

check(real.failures.size === 0, '/think 流式中断契约全部成立', summarize(real.failures));
check(real.stats.handlers === 4, '检查到四个提交流（识别器没有空转）', `handlers=${real.stats.handlers}`);
check(real.stats.catchGuards === 4, '四个 catch 都在 abort 时静默返回', `catch=${real.stats.catchGuards}`);
check(real.stats.finallyGuards === 4, '四个 finally 都有 controller 身份锁', `finally=${real.stats.finallyGuards}`);
check(real.stats.loops === 8, '检查到八个流式循环（每 tab 主/回落各一）', `loops=${real.stats.loops}`);
check(real.stats.loopSetters === 8, '每个流式循环都有结果写入（断流断言不是空锁）', `setters=${real.stats.loopSetters}`);
check(real.stats.historyGuards === 1, '检测历史在 abort 后不落盘', `history=${real.stats.historyGuards}`);
check(real.stats.paths === 6, '检查到六条离开当前题的路径', `paths=${real.stats.paths}`);
check(real.stats.cleanupRefs === 4, '卸载清理中止四个 AbortController ref', `cleanup=${real.stats.cleanupRefs}`);

for (const m of MUTATIONS) {
  const { hits, out } = replaceOnce(src, m.before, m.after);
  check(hits === 1, `${m.id} 变异串恰好命中一次（防 CRLF/改形后假变异）`, `命中 ${hits} 次`);
  const mutated = inspect(out);
  check(
    mutated.failures.has(m.expected),
    `${m.id}：${m.label} → 必须让 ${m.expected} 变红`,
    summarize(mutated.failures),
  );
  check(
    mutated.failures.size === 1,
    `${m.id}：恰好命中一条断言，不误伤其它契约`,
    `红=${[...mutated.failures.keys()].join(', ') || '无'}`,
  );
}

console.log('');
console.log(`verify-think-stream-abort: ${pass} 通过, ${fail} 失败`);
failures.forEach((f) => console.log(`  ✗ ${f}`));
process.exit(fail ? 1 : 0);
