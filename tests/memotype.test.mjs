import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

function extractFunction(src, name) {
  const needle = "function " + name + "(";
  const start = src.indexOf(needle);
  if (start < 0) throw new Error("missing function " + name);
  let depth = 0;
  let begun = false;
  let inStr = null;
  let escape = false;
  for (let i = start; i < src.length; i += 1) {
    const ch = src[i];
    if (inStr) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      inStr = ch;
      continue;
    }
    if (ch === "{") {
      depth += 1;
      begun = true;
    } else if (ch === "}") {
      depth -= 1;
      if (begun && depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("unclosed function " + name);
}

function loadLogic() {
  const KEYWORDS = {
    c: new Set(["int", "void", "char", "if", "for", "while", "return", "typedef", "struct", "static"]),
    python: new Set(["def", "class", "return", "if", "for", "while"])
  };
  const bundle = [
    extractFunction(html, "isBuiltInId"),
    extractFunction(html, "isBuiltInSnippet"),
    extractFunction(html, "isTypedefLine"),
    extractFunction(html, "isDeclLine"),
    extractFunction(html, "identsIn"),
    extractFunction(html, "isSpotProtectedLine"),
    extractFunction(html, "spotLineExistsElsewhere"),
    extractFunction(html, "mutateForSpot")
  ].join("\n");
  const factory = new Function(
    "KEYWORDS",
    bundle + "; return { isBuiltInId, isBuiltInSnippet, isTypedefLine, isDeclLine, identsIn, isSpotProtectedLine, spotLineExistsElsewhere, mutateForSpot };"
  );
  return factory(KEYWORDS);
}

const logic = loadLogic();

test("HTML has game launch, pick, range, countdown, give-up", () => {
  assert.match(html, /id="gameLaunchBtn"/);
  assert.match(html, />게임</);
  assert.match(html, /data-game="recite"/);
  assert.match(html, /data-game="spot"/);
  assert.doesNotMatch(html, /data-game="mypage"/);
  assert.match(html, /id="mypageOpenBtn"/);
  assert.match(html, /id="countdown"/);
  assert.match(html, /id="gameGiveUpBtn"/);
  assert.match(html, /id="gameTimer"/);
  assert.match(html, /id="gameTitleHud"/);
  assert.match(html, /id="gameLeft"/);
});

test("range list checks user snippets and leaves presets unchecked", () => {
  const fn = extractFunction(html, "renderGameRangeList");
  assert.match(fn, /내 코드/);
  assert.match(fn, /기본 코드/);
  assert.match(fn, /packs\.mine[\s\S]*checkbox" checked/);
  assert.match(fn, /packs\.presets[\s\S]*checkbox" data-id=/);
  assert.doesNotMatch(fn.split("packs.presets")[1], /checkbox" checked/);
});

test("countdown uses 3-2-1 then a 1s title hold before unlock", () => {
  const fn = extractFunction(html, "startCountdown");
  assert.match(fn, /\["3", "2", "1"\]/);
  assert.match(fn, /cap.classList.add\("show"\);[\s\S]*?\}, 1000\)\)/);
  assert.match(fn, /setInputLocked\(true\)/);
  assert.match(fn, /setInputLocked\(false\)/);
});

test("typing is locked until countdown finishes", () => {
  assert.match(html, /if \(state\.inputLocked\)/);
  assert.match(extractFunction(html, "injectPracticeKey"), /state\.inputLocked/);
  assert.match(extractFunction(html, "focusPracticeInput"), /state\.inputLocked/);
  assert.match(extractFunction(html, "syncCatcherValue"), /state\.inputLocked/);
});

test("wrong recite line adds 3 seconds", () => {
  assert.match(html, /penaltyMs[\s\S]{0,80}\+ 3000/);
});

test("recite paints wrong chars instead of revealing the answer", () => {
  assert.match(html, /function paintTypedChars/);
  const render = extractFunction(html, "renderMode4");
  assert.match(render, /recite-paint/);
  assert.doesNotMatch(render, /오답 · 3초 추가/);
  const enter = extractFunction(html, "handleBlindLineKey");
  assert.match(enter, /if \(recitePlay\) \{[\s\S]*?state\.lineDiff = null/);
});

test("give up exits without saveRecord", () => {
  const fn = extractFunction(html, "giveUpGame");
  assert.match(fn, /exitGame\(\)/);
  assert.doesNotMatch(fn, /saveRecord/);
});

test("user snippet named test is not built-in", () => {
  assert.equal(logic.isBuiltInSnippet({ id: "snippet_1", title: "test", code: "int x;" }), false);
  assert.equal(logic.isBuiltInSnippet({ id: "preset:c:0", title: "배열 스택" }), true);
  assert.equal(logic.isBuiltInSnippet({ id: "preset:c:0", title: "test" }), true);
  assert.equal(logic.isBuiltInSnippet(null), false);
});

test("typedef and declaration lines are protected", () => {
  assert.equal(logic.isTypedefLine("typedef int Element;"), true);
  assert.equal(logic.isDeclLine("typedef int Element;", "c"), true);
  assert.equal(logic.isDeclLine("    int top;", "c"), true);
  assert.equal(logic.isDeclLine("Element *stack;", "c"), true);
  assert.equal(logic.isDeclLine("void push(Stack *s) {", "c"), false);
  assert.equal(logic.isDeclLine("    push(item);", "c"), false);
  assert.equal(logic.isDeclLine("apple = banana;", "python"), true);
});

test("spot mutations never rewrite protected lines or invent identifier typos", () => {
  const src = [
    "typedef int Element;",
    "int apple;",
    "int banana;",
    "void push(int x);",
    "void pop(int x);",
    "apple = 1;",
    "banana = 2;",
    "push(apple);",
    "pop(banana);"
  ].join("\n");

  for (let n = 0; n < 40; n += 1) {
    const out = logic.mutateForSpot(src, "c");
    const orig = out.original;
    const next = out.lines;
    const errors = out.errors;
    assert.equal(orig[0], next[0], "typedef must stay");
    assert.equal(orig[1], next[1], "declaration must stay");
    assert.equal(orig[2], next[2], "declaration must stay");
    const changed = [];
    for (let i = 0; i < orig.length; i += 1) {
      if (orig[i] !== next[i]) changed.push(i);
    }
    changed.forEach(function (i) {
      assert.ok(errors[i], "changed line must be marked");
    });
    Object.keys(errors).forEach(function (key) {
      const i = Number(key);
      const err = errors[i];
      if (err.type === "ident" || err.type === "func") {
        assert.notEqual(err.from, err.to);
        assert.equal(err.from.toLowerCase() === err.to.toLowerCase() && err.from !== err.to, false, "no case-only typo");
        assert.match(src, new RegExp("\\b" + err.to + "\\b"), "replacement must already exist");
        assert.doesNotMatch(err.to, /pstack|Srack/);
      }
      if (err.type === "semi") {
        assert.match(orig[i], /;/);
        assert.equal(next[i].includes(";"), false);
      }
    });
  }
});

test("spot mutation always yields at least one real changed line", () => {
  const src = [
    "typedef int Element;",
    "int apple;",
    "int banana;",
    "void push(int x);",
    "void pop(int x);",
    "apple = banana;",
    "push(apple);"
  ].join("\n");
  const out = logic.mutateForSpot(src, "c");
  const n = Object.keys(out.errors).length;
  assert.ok(n >= 1);
  Object.keys(out.errors).forEach(function (key) {
    const i = Number(key);
    assert.notEqual(out.lines[i], out.original[i]);
  });
});

test("spot HUD tracks remaining errors and clear uses left count", () => {
  assert.match(html, /남은 오류/);
  assert.match(html, /id="gameLeft"/);
  const clickFn = extractFunction(html, "handleSpotClick");
  assert.match(clickFn, /counts\.left <= 0/);
  assert.match(clickFn, /CLEAR/);
});

test("spot allows at most one error per line", () => {
  const src = "int apple;\nint banana;\napple = banana;\n";
  const out = logic.mutateForSpot(src, "c");
  Object.keys(out.errors).forEach(function (key) {
    const i = Number(key);
    const a = out.original[i];
    const b = out.lines[i];
    if (out.errors[i].type === "ident") {
      const fromCount = (a.match(new RegExp("\\b" + out.errors[i].from + "\\b", "g")) || []).length;
      const still = (b.match(new RegExp("\\b" + out.errors[i].from + "\\b", "g")) || []).length;
      assert.ok(fromCount - still <= 1);
    }
  });
});

test("spot errors always differ and never camouflage as another original line", () => {
  const src = [
    "typedef int Element;",
    "int apple;",
    "int banana;",
    "void push(int x);",
    "void pop(int x);",
    "void ClearStack(Stack* p);",
    "void DestroyStack(Stack* p);",
    "apple = banana;",
    "push(apple);",
    "pop(banana);",
    "ClearStack(0);",
    "DestroyStack(0);"
  ].join("\n");

  for (let n = 0; n < 80; n += 1) {
    const out = logic.mutateForSpot(src, "c");
    const errKeys = Object.keys(out.errors).map(Number).sort((a, b) => a - b);
    const changed = [];
    for (let i = 0; i < out.original.length; i += 1) {
      if (out.original[i] !== out.lines[i]) changed.push(i);
    }
    assert.deepEqual(changed, errKeys);
    errKeys.forEach(function (i) {
      assert.notEqual(out.lines[i], out.original[i]);
      assert.equal(
        out.original.some(function (line, j) { return j !== i && line === out.lines[i]; }),
        false,
        "mutated line must not duplicate another original line"
      );
    });
  }
});

test("practice complete saves a record; give-up path does not", () => {
  const completeFn = extractFunction(html, "complete");
  assert.match(completeFn, /saveRecord/);
  assert.match(completeFn, /type: "practice"/);
  assert.match(completeFn, /type: "game_recite"/);
  assert.equal(extractFunction(html, "giveUpGame").includes("saveRecord"), false);
});
