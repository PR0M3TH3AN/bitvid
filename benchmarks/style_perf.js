
import { JSDOM } from "jsdom";
import { performance } from "perf_hooks";

const dom = new JSDOM(`<!DOCTYPE html>`);
global.window = dom.window;
global.document = dom.window.document;
global.CSSStyleSheet = dom.window.CSSStyleSheet;

function setupSheet(ruleCount) {
  const sheet = new global.CSSStyleSheet();
  document.adoptedStyleSheets = [sheet];
  for (let i = 0; i < ruleCount; i++) {
    sheet.insertRule(`.rule-${i} { color: red; }`, i);
  }
  return sheet;
}

function findRuleIndex(sheet, rule) {
  if (!sheet || !rule) {
    return -1;
  }
  const { cssRules } = sheet;
  for (let index = 0; index < cssRules.length; index += 1) {
    if (cssRules[index] === rule) {
      return index;
    }
  }
  return -1;
}

function baselineDelete(sheet, rulesToDelete) {
  for (const rule of rulesToDelete) {
    const index = findRuleIndex(sheet, rule);
    if (index >= 0) {
      sheet.deleteRule(index);
    }
  }
}

// Lazy Map Implementation
class LazyManager {
  constructor(sheet) {
    this.sheet = sheet;
    this.ruleIndices = null; // Map<Rule, number> | null
  }

  getRuleIndex(rule) {
      if (!this.ruleIndices) {
          this.rebuildMap();
      }
      return this.ruleIndices.has(rule) ? this.ruleIndices.get(rule) : -1;
  }

  rebuildMap() {
      this.ruleIndices = new Map();
      const rules = this.sheet.cssRules;
      for (let i = 0; i < rules.length; i++) {
          this.ruleIndices.set(rules[i], i);
      }
  }

  deleteRules(rulesToDelete) {
      // 1. Collect indices
      const toDelete = [];
      for (const rule of rulesToDelete) {
          const idx = this.getRuleIndex(rule);
          if (idx >= 0) {
              toDelete.push(idx);
          }
      }

      // 2. Sort descending
      toDelete.sort((a, b) => b - a);

      // 3. Delete
      for (const idx of toDelete) {
          this.sheet.deleteRule(idx);
      }

      // 4. Invalidate
      this.ruleIndices = null;
  }
}

async function runBenchmark() {
  const RULE_COUNT = 10000;
  const DELETE_COUNT = 2000;

  console.log(`Setup: ${RULE_COUNT} rules, deleting ${DELETE_COUNT}...`);

  {
      const sheet = setupSheet(RULE_COUNT);
      const allRules = Array.from(sheet.cssRules);
      const rulesToDelete = [];
      for(let i=0; i<DELETE_COUNT; i++) {
          const r = allRules[Math.floor(Math.random() * allRules.length)];
          if(!rulesToDelete.includes(r)) rulesToDelete.push(r);
      }

      const start = performance.now();
      baselineDelete(sheet, rulesToDelete);
      const end = performance.now();
      console.log(`Baseline Time: ${(end - start).toFixed(2)}ms`);
  }

  {
      const sheet = setupSheet(RULE_COUNT);
      const allRules = Array.from(sheet.cssRules);
      const rulesToDelete = [];
      for(let i=0; i<DELETE_COUNT; i++) {
          const r = allRules[Math.floor(Math.random() * allRules.length)];
          if(!rulesToDelete.includes(r)) rulesToDelete.push(r);
      }

      const manager = new LazyManager(sheet);

      const start = performance.now();
      manager.deleteRules(rulesToDelete);
      const end = performance.now();
      console.log(`Lazy Map Time: ${(end - start).toFixed(2)}ms`);
  }
}

runBenchmark().catch(console.error);
