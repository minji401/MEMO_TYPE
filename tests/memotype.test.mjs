import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "url";

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
    extractFunction(html, "findFunctionRanges"),
    extractFunction(html, "mutateReturnLine"),
    extractFunction(html, "mutateIncludeLine"),
    extractFunction(html, "mutatePointerLine"),
    extractFunction(html, "mutateTypeLine"),
    extractFunction(html, "mutateAddSemi"),
    extractFunction(html, "enforceSpotBodyHints"),
    extractFunction(html, "mutateForSpot"),
    extractFunction(html, "gradeKeywordSet"),
    extractFunction(html, "tokenizeForGrade"),
    extractFunction(html, "compareCodesFlexible")
  ].join("\n");
  const factory = new Function(
    "KEYWORDS",
    bundle + "; return { isBuiltInId, isBuiltInSnippet, isTypedefLine, isDeclLine, identsIn, isSpotProtectedLine, spotLineExistsElsewhere, findFunctionRanges, mutateReturnLine, mutateIncludeLine, mutatePointerLine, mutateTypeLine, mutateAddSemi, enforceSpotBodyHints, mutateForSpot, gradeKeywordSet, tokenizeForGrade, compareCodesFlexible };"
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
  assert.match(html, /id="mypageView"/);
  assert.match(html, /id="mypageBackBtn"/);
  assert.match(html, /id="finishPracticeBtn"/);
  assert.match(html, /id="finishEditBtn"/);
  assert.match(extractFunction(html, "setFinishActions"), /practiceBtn\.hidden = true/);
  assert.match(extractFunction(html, "setFinishActions"), /editBtn\.hidden = false/);
  assert.match(html, /랜덤 백지 테스트/);
  assert.doesNotMatch(html, /랜덤 백지 연습/);
  assert.match(html, /id="countdown"/);
  assert.match(html, /id="gameGiveUpBtn"/);
  assert.match(html, /id="gameTimer"/);
  assert.match(html, /id="gameTitleHud"/);
  assert.match(html, /id="gameLeft"/);
  assert.match(html, /mypage-tabs/);
  assert.doesNotMatch(html, /id="mypageOverlay"/);
});

test("mypage tracks per-key and finger stats for English/symbols", () => {
  assert.match(html, /KEY_STATS_KEY/);
  assert.match(html, /function isTrackableKey/);
  assert.match(html, /function fingerForChar/);
  assert.match(html, /function recordKeyStat/);
  assert.match(html, /function fingerSpeedEntries/);
  assert.match(extractFunction(html, "isTrackableKey"), /[0-9]/);
  assert.match(extractFunction(html, "isTrackableKey"), /가-힣/);
  assert.match(extractFunction(html, "myPagePanelHtml"), /keyHits/);
  assert.match(extractFunction(html, "myPagePanelHtml"), /keyAcc/);
  assert.match(extractFunction(html, "myPagePanelHtml"), /keySpeed/);
  assert.match(extractFunction(html, "myPagePanelHtml"), /finger/);
  assert.match(extractFunction(html, "myPagePanelHtml"), /renderKeyStatGrid/);
  assert.match(extractFunction(html, "myPagePanelHtml"), /renderMyPageChart\(fingerSpeedEntries/);
  assert.match(extractFunction(html, "renderMyPage"), /글쇠별타수/);
  assert.match(extractFunction(html, "renderMyPage"), /글쇠별정확도/);
  assert.match(extractFunction(html, "renderMyPage"), /글쇠별속도/);
  assert.match(extractFunction(html, "renderMyPage"), /손가락빠르기/);
  assert.match(extractFunction(html, "syncCatcherValue"), /recordKeyStat/);
  assert.match(html, /loadKeyStats\(\)/);
});

test("range list checks user snippets and leaves presets unchecked", () => {
  const fn = extractFunction(html, "renderGameRangeList");
  assert.match(fn, /내 코드/);
  assert.match(fn, /기본 코드/);
  assert.match(fn, /range-select-all/);
  assert.match(fn, /packs\.mine[\s\S]*checkbox" checked/);
  assert.match(fn, /packs\.presets[\s\S]*checkbox" data-id=/);
  assert.doesNotMatch(fn.split("packs.presets")[1], /checkbox" checked/);
});

test("records persist locally even when logged in", () => {
  const saveFn = extractFunction(html, "saveRecord");
  assert.match(saveFn, /persistRecords\(\)/);
  assert.match(extractFunction(html, "persistRecords"), /localStorage\.setItem\(RECORDS_KEY/);
  assert.doesNotMatch(extractFunction(html, "persistRecords"), /if \(state\.user\) return/);
  assert.match(html, /result-clear/);
  assert.match(html, /result-out/);
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

test("recite game uses free editor submit and large result modal", () => {
  assert.match(html, /id="reciteEditor"/);
  assert.match(html, /id="reciteSubmitBtn"/);
  assert.match(html, /id="reciteResultOverlay"/);
  assert.match(html, /recite-result-modal/);
  assert.match(html, /80vh/);
  assert.match(extractFunction(html, "submitReciteGame"), /compareCodesFlexible/);
  assert.match(extractFunction(html, "showReciteResult"), /buildReciteFeedbackHtml/);
  assert.doesNotMatch(extractFunction(html, "handleBlindLineKey"), /penaltyMs/);
});

test("flexible grader allows renamed idents and brace layout differences", () => {
  const expected = [
    "int add(int a, int b)",
    "{",
    "    return a + b;",
    "}"
  ].join("\n");
  const renamed = [
    "int add(int x, int y) {",
    "    return x + y;",
    "}"
  ].join("\n");
  const ok = logic.compareCodesFlexible(expected, renamed, "c");
  assert.equal(ok.ok, true);
  assert.equal(ok.wrongCount, 0);

  const wrong = [
    "int add(int x, int y) {",
    "    return x - y;",
    "}"
  ].join("\n");
  const bad = logic.compareCodesFlexible(expected, wrong, "c");
  assert.equal(bad.ok, false);
  assert.ok(bad.wrongCount >= 1);
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

test("include pointer type and semi mutators work", () => {
  assert.equal(logic.mutateIncludeLine("#include <stdio.h>"), "#include <stdbool.h>");
  assert.equal(logic.mutateIncludeLine("#include <stdbool.h>"), "#include <stdio.h>");
  assert.equal(logic.mutatePointerLine("    Stack* pStack = 0;").includes("Stack**"), true);
  assert.equal(logic.mutateAddSemi("    if (pStack->top < 0)"), "    if (pStack->top < 0);");
  assert.equal(logic.mutateTypeLine("void Push(Stack* p)", ["void", "Element"]).startsWith("Element "), true);
});

test("spot finish shows time and misses instead of WPM typos", () => {
  const clickFn = extractFunction(html, "handleSpotClick");
  assert.match(clickFn, /setFinishStats\("spot"/);
  assert.match(html, /id="finLabel1"/);
  assert.doesNotMatch(clickFn, /finErr\.textContent = "3"/);
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
      if (err.type === "ident" || err.type === "func" || err.type === "funcswap") {
        assert.notEqual(err.from, err.to);
        assert.equal(err.from.toLowerCase() === err.to.toLowerCase() && err.from !== err.to, false, "no case-only typo");
        assert.match(src, new RegExp("\\b" + err.to + "\\b"), "replacement must already exist");
        assert.doesNotMatch(err.to, /pstack|Srack/);
      }
      if (err.type === "semi") {
        assert.match(orig[i] || "", /;/);
        assert.equal(next[i].includes(";"), false);
      }
      if (err.type === "addsemi") {
        assert.match(next[i], /;/);
      }
      if (err.type === "include") {
        assert.match(orig[i] || next[i], /#\s*include/);
        assert.notEqual(orig[i] || "", next[i]);
      }
      if (err.type === "insert") {
        assert.ok(i >= orig.length || next[i] !== (orig[i] || ""));
      }
    });
  }
});

test("spot mutation always yields at least one real changed line", () => {
  const src = [
    "#include <stdio.h>",
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

test("spot errors always differ and non-swap mutations do not camouflage", () => {
  const src = [
    "#include <stdio.h>",
    "typedef int Element;",
    "int apple;",
    "int banana;",
    "void push(int x) {",
    "    apple = 1;",
    "    return apple;",
    "}",
    "void pop(int x) {",
    "    banana = 2;",
    "    return banana;",
    "}",
    "push(apple);",
    "pop(banana);"
  ].join("\n");

  for (let n = 0; n < 80; n += 1) {
    const out = logic.mutateForSpot(src, "c");
    const errKeys = Object.keys(out.errors).map(Number).sort((a, b) => a - b);
    assert.ok(errKeys.length >= 1);
    errKeys.forEach(function (i) {
      const err = out.errors[i];
      assert.ok(out.lines[i] != null);
      if (err.type === "insert") {
        assert.ok(out.lines.length > out.original.length);
        return;
      }
      if (i < out.original.length) assert.notEqual(out.lines[i], out.original[i]);
      if (err.type === "funcswap" || err.type === "insert" || err.type === "rettype") return;
      if (err.type === "ident" || err.type === "func" || err.type === "semi" || err.type === "include") {
        assert.equal(
          out.lines.some(function (line, j) { return j !== i && line === out.lines[i]; }),
          false,
          "mutated line must not duplicate another current line"
        );
      }
    });
  }
});

test("swapped function bodies keep enough original lines to infer", () => {
  const src = [
    "void ClearStack(Stack* p) {",
    "    p->top = -1;",
    "    p->count = 0;",
    "    return;",
    "}",
    "void DestroyStack(Stack* p) {",
    "    free(p->stack);",
    "    free(p);",
    "    return;",
    "}"
  ].join("\n");

  for (let n = 0; n < 40; n += 1) {
    const out = logic.mutateForSpot(src, "c");
    const ranges = logic.findFunctionRanges(out.original);
    ranges.forEach(function (range) {
      if (range.body.length < 2) return;
      const intact = range.body.filter(function (i) {
        return out.lines[i] === out.original[i];
      }).length;
      assert.ok(intact >= 1, "at least one body line must stay intact");
    });
  }
});

test("practice complete saves a record; give-up path does not", () => {
  const completeFn = extractFunction(html, "complete");
  assert.match(completeFn, /saveRecord/);
  assert.match(completeFn, /type: "practice"/);
  assert.match(completeFn, /submitReciteGame/);
  assert.match(extractFunction(html, "submitReciteGame"), /type: "game_recite"/);
  assert.equal(extractFunction(html, "giveUpGame").includes("saveRecord"), false);
});
