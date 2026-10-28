import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  normalize,
  axis,
  money,
  percent,
} from "../templates/company-analysis/model.mjs";
const samples = JSON.parse(
  fs.readFileSync(
    new URL("../templates/company-analysis/demo.json", import.meta.url),
    "utf8",
  ),
);
test("financial periods sort chronologically and nulls/negative values are retained", () => {
  const value = normalize(samples[1].snapshot);
  assert.deepEqual(
    value.years.map((x) => x.fiscalPeriod),
    ["2024-03", "2025-03", "2026-03"],
  );
  assert.equal(value.years[0].operatingIncome, -420000000);
  assert.equal(value.years[1].operatingIncome, null);
  assert.equal(value.quote.priceDate, "2026-10-23");
  assert.equal(value.years[2].provenance.source, "synthetic");
});
test("wrong symbol, duplicate fiscal periods and quarterly records do not become annual charts", () => {
  for (const change of [
    (s) => (s.annualFinancials[0].period = "Q3"),
    (s) => (s.annualFinancials[0].symbol = "OTHER"),
    (s) => s.annualFinancials.push(s.annualFinancials[0]),
    (s) => (s.latestClose[0].symbol = "OTHER"),
    (s) => (s.annualFinancials[0].fiscalPeriod = "2026-19"),
  ]) {
    const s = structuredClone(samples[0].snapshot);
    change(s);
    assert.throws(() => normalize(s));
  }
});
test("empty financials and missing quotes remain empty", () => {
  const result = normalize({
    symbol: "7203",
    annualFinancials: [],
    latestClose: [],
  });
  assert.deepEqual(result.years, []);
  assert.equal(result.quote, null);
});
test("chart axis includes zero and losses without turning missing values into zero", () => {
  const bounds = axis([-4.2, null, 6.1]);
  assert.ok(bounds.min < -4.2);
  assert.ok(bounds.max > 6.1);
  assert.deepEqual(axis([null]), { min: 0, max: 1 });
  assert.ok(axis([-4, -2]).max === 0);
});
test("units, percentages and missing values render consistently", () => {
  assert.equal(money(15800000000, "en", true), "158");
  assert.equal(percent(0.125, "en"), "12.5%");
  for (const v of [null, undefined, NaN, Infinity, "0"]) {
    assert.equal(money(v), "—");
    assert.equal(percent(v), "—");
  }
  assert.equal(money(0), "0");
});

import { comparisonConditions, changeRate } from '../templates/company-analysis/model.mjs';
test('comparison flags unknown or incompatible reporting metadata', () => {
  const a=normalize(samples[0].snapshot).years.at(-1),b=normalize(samples[1].snapshot).years.at(-1);
  assert.equal(comparisonConditions(a,b),true);
  for(const patch of [{fiscalPeriod:'2025-03'},{accountingStandard:'IFRS'},{accountingStandard:null},{fiscalPeriodDays:180},{fiscalPeriodDays:null},{period:'Q4'}])assert.equal(comparisonConditions(a,{...b,...patch}),false);
});
test('growth does not invent rates for missing, zero, negative or incomparable bases', () => {
  const rows=normalize(samples[0].snapshot).years;
  assert.ok(Math.abs(changeRate(rows[2],rows[1],'revenue')-0.1791044776119403)<1e-9);
  for(const patch of [{revenue:0},{revenue:-1},{revenue:null},{fiscalPeriod:'2023-03'},{fiscalPeriod:'2025-12'},{accountingStandard:'IFRS'},{fiscalPeriodDays:180}])assert.equal(changeRate(rows[2],{...rows[1],...patch},'revenue'),null);
  assert.equal(changeRate(rows[2],null,'revenue'),null);
  assert.equal(changeRate({...rows[2],operatingMargin:.1},{...rows[1],operatingMargin:-.1},'operatingMargin'),.2);
});
import { chartAxis } from '../templates/company-analysis/model.mjs';
test('chart uses readable ticks and retains zero, losses and headroom',()=>{
  assert.deepEqual(chartAxis([116,134,158]).ticks,[0,100,200]);
  for(const values of [[-4.2,null,6.1],[0,0],[null],[-9,-4]]){
    const result=chartAxis(values);
    assert.ok(result.max>result.min);
    assert.ok(result.ticks.includes(0));
    for(const n of values.filter(v=>v!==null))assert.ok(n>=result.min&&n<=result.max);
  }
});
