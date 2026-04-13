import fs from "node:fs";
import path from "node:path";

const summaryPath = path.resolve(process.cwd(), "coverage", "coverage-summary.json");

if (!fs.existsSync(summaryPath)) {
  console.log("Coverage summary file not found; skipping step summary.");
  process.exit(0);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
const metrics = [
  ["Lines", summary.total.lines],
  ["Statements", summary.total.statements],
  ["Functions", summary.total.functions],
  ["Branches", summary.total.branches],
];

const markdown = [
  "## Coverage Summary",
  "",
  "| Metric | Coverage | Covered / Total |",
  "| --- | ---: | ---: |",
  ...metrics.map(([label, metric]) => (
    `| ${label} | ${metric.pct.toFixed(2)}% | ${metric.covered}/${metric.total} |`
  )),
  "",
  "The full HTML report is uploaded as the `coverage-report` artifact.",
  "",
].join("\n");

process.stdout.write(`${markdown}\n`);

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}
