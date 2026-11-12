"""Offline source-level reproductions. No browser, network, model or real candidate data.

Extracts original AST definitions to avoid importing application startup/dependencies.
This is NOT an integration test of either application.
"""
import ast
import asyncio
import copy
import json
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]


class SilentLogger:
    def __getattr__(self, name):
        return lambda *a, **kw: None


def definitions(relative, names, extra=None):
    path = ROOT / relative
    tree = ast.parse(path.read_text(encoding="utf-8-sig"))
    nodes = [n for n in tree.body if isinstance(n, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in names]
    assert len(nodes) == len(names), (relative, names)
    for n in nodes:
        n.decorator_list = []
    module = ast.Module(body=[ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0)] + nodes, type_ignores=[])
    scope = {"logger": SilentLogger(), "json": json, **(extra or {})}
    exec(compile(ast.fix_missing_locations(module), str(path), "exec"), scope)
    return scope


coerce = definitions("LLM-Agent-Resume/app/core/metadata_utils.py", ["coerce_to_list"])["coerce_to_list"]
f = definitions("LLM-Agent-Resume/app/core/filter.py", ["HardFilter"], {"coerce_to_list": coerce})["HardFilter"]()
s = definitions("LLM-Agent-Resume/app/core/scorer.py", ["Scorer"], {"coerce_to_list": coerce})["Scorer"]()
e = definitions("boss-zhipin-mcp/evaluator.py", ["CandidateEvaluator"])["CandidateEvaluator"]()
results = []


def record(name, actual, expected):
    assert actual == expected, (name, actual, expected)
    results.append({"check": name, "observed": actual, "reproduced": True})


record("JavaScript accepted as required Java", f._matches("Java", ["JavaScript"], ""), True)
record("Negative skill statement accepted", f._matches("Python", [], f._resume_text({"text": "未使用过 Python"})), True)
r = {"metadata": {"work_experience": [{"start_date": "2024-12", "end_date": "2025-01"}]}}
record("One month counted as one year", len(f._filter_by_experience([r], 1)), 1)
r = {"metadata": {"work_experience": [{"start_date": "2020", "end_date": "2021"}]}}
record("Year-only dates pass 20-year threshold", len(f._filter_by_experience([r], 20)), 1)
r = {"metadata": {"work_experience": [{"start_date": "2024-01", "end_date": "至今"}]}}
record("Present date remains fixed at 2025, fails 2-year threshold", len(f._filter_by_experience([r], 2)), 0)
record("Missing location scored zero", s._calculate_location_score({"metadata": {}}, SimpleNamespace(locations=["北京"])), 0.0)
record("Missing salary scored full marks", s._calculate_salary_score({"metadata": {}}, SimpleNamespace(salary_range={"min": 20000, "max": 30000})), 1.0)
resume = {"skills": ["Python"]}
record("Evaluator ignores different job requirements", e.evaluate(resume, "Python developer") == e.evaluate(resume, "Legal counsel"), True)


class FakeDB:
    def __init__(self, rows):
        self.rows = copy.deepcopy(rows)

    def query(self, **kwargs):
        return self.rows[:kwargs.get("limit", 50)]

    def update(self, eid, **fields):
        next(r for r in self.rows if r["expectId"] == eid).update(fields)


db = FakeDB([{"expectId": "missing-age", "status": "new", "salary": "20-25K"}])
scope = definitions("boss-zhipin-mcp/server.py", ["boss_filter_and_score"], {"PROFILE": {}, "_db": db})
out = asyncio.run(scope["boss_filter_and_score"]())
record("Missing age automatically filtered", out[0]["filtered_out"]["age"], 1)
db = FakeDB([{"expectId": "greeted", "status": "greeted", "age": "28岁", "salary": "20-25K"}])
scope["_db"] = db
asyncio.run(scope["boss_filter_and_score"]())
record("Scoring overwrites greeted state", db.rows[0]["status"], "shortlisted")
scope["PROFILE"] = {"scoring": {"domain_keywords": ["教育", "学术", "科研"], "tech_keywords": ["llm", "rag", "agent"], "bonus_keywords": ["0-1"]}}
db = FakeDB([{"expectId": "high", "status": "new", "age": "28岁", "salary": "20-25K", "education": "博士", "experience": "5年", "jobStatus": "离职", "fullText": "教育 学术 科研 llm rag agent 0-1"}])
scope["_db"] = db
out = asyncio.run(scope["boss_filter_and_score"]())
record("Score exceeds 100", out[1]["score"] > 100, True)
results[-1]["actual_score"] = out[1]["score"]
db = FakeDB([{"expectId": "salary", "status": "new", "age": "28岁", "salary": "2-3万"}])
scope["PROFILE"] = {"filter": {"max_salary_k": 25}}
scope["_db"] = db
out = asyncio.run(scope["boss_filter_and_score"]())
record("30K upper salary passes 25K limit when written in wan", out[0]["passed_filter"], 1)

syntax_errors = []
source_count = 0
for folder in ["LLM-Agent-Resume", "boss-zhipin-mcp"]:
    for path in (ROOT / folder).rglob("*.py"):
        if ".git" in path.parts:
            continue
        source_count += 1
        try:
            ast.parse(path.read_text(encoding="utf-8-sig"))
        except SyntaxError as error:
            syntax_errors.append({"file": str(path.relative_to(ROOT)), "line": error.lineno, "error": error.msg})

output = {"mode": "isolated AST execution, synthetic data only; not full application tests", "reproductions": results, "syntax": {"files": source_count, "errors": syntax_errors}}
target = Path(__file__).with_name("offline_checks_results.json")
target.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(output, ensure_ascii=True, indent=2))
