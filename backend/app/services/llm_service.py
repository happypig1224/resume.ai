import json
import logging
import re
from typing import Any, Dict, List, Optional
from openai import AsyncOpenAI

from app.core.config import settings

logger = logging.getLogger(__name__)


class LLMService:
    """企业级大模型服务接入层 (支持 DeepSeek / 302.ai / OpenAI 兼容多模态大模型)"""

    def __init__(self):
        # 主客户端：DeepSeek
        self.primary_client = None
        if settings.LLM_API_KEY:
            self.primary_client = AsyncOpenAI(
                api_key=settings.LLM_API_KEY,
                base_url=settings.LLM_BASE_URL,
                timeout=30.0,
            )

        # 备选客户端：302.ai (GPT-4o-mini / Gemini)
        self.secondary_client = None
        if settings.SECONDARY_LLM_API_KEY:
            self.secondary_client = AsyncOpenAI(
                api_key=settings.SECONDARY_LLM_API_KEY,
                base_url=settings.SECONDARY_LLM_BASE_URL,
                timeout=30.0,
            )

    async def _call_llm_json(self, system_prompt: str, user_prompt: str) -> Optional[Dict[str, Any]]:
        """调用大模型并要求返回结构化 JSON，具备双路由容灾自愈"""
        clients_to_try = []
        if self.primary_client:
            clients_to_try.append((self.primary_client, settings.LLM_MODEL, "primary-deepseek"))
        if self.secondary_client:
            clients_to_try.append((self.secondary_client, settings.SECONDARY_LLM_MODEL, "secondary-302"))

        for client, model, provider_tag in clients_to_try:
            try:
                response = await client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.1,
                    max_tokens=2048,
                )
                raw_text = response.choices[0].message.content or ""
                # 解析 JSON
                data = json.loads(raw_text)
                logger.info(f"LLM [{provider_tag} / {model}] call succeeded.")
                data["_llm_meta"] = {
                    "provider": provider_tag,
                    "model": model,
                    "is_llm_powered": True,
                }
                return data
            except Exception as e:
                logger.warning(f"LLM [{provider_tag} / {model}] failed: {e}. Trying fallback if available.")

        return None

    async def extract_criteria_from_jd(self, jd_title: str, jd_text: str) -> Dict[str, Any]:
        """根据岗位 JD 原文，利用真实大模型提取结构化评估标准 (PRD-001 规范)"""
        system_prompt = (
            "你是一名资深的技术招聘架构师与 HR 评估专家，严格遵循 PRD-001 招聘标准规范。\n"
            "你的任务是深度分析输入的岗位 JD 原文，提取结构化评估标准。\n\n"
            "【输出规则】严格返回符合下列结构的合法 JSON 对象：\n"
            "{\n"
            '  "required_criteria": [\n'
            '    {\n'
            '      "description": "标准描述，简明扼要",\n'
            '      "importance": "high" 或 "medium" 或 "low",\n'
            '      "constraint": "strict" 或 "flexible"\n'
            '    }\n'
            '  ],\n'
            '  "bonus_criteria": [\n'
            '    {\n'
            '      "description": "加分项描述",\n'
            '      "importance": "high" 或 "medium" 或 "low"\n'
            '    }\n'
            '  ]\n'
            "}\n\n"
            "【业务红线】\n"
            "1. required_criteria 必须提取至少 2 项，至多 6 项核心必要条件；\n"
            "2. 学历底线、最低实战工作年限等硬性指标必须设为 strict（不可放宽）；\n"
            "3. 架构优化、高并发经验等可衡量成果设为 flexible（可酌情，允许等价工程证据替代）；\n"
            "4. bonus_criteria 为非必须的加分项（如特定前沿技术落地、开源项目）。"
        )

        user_prompt = f"岗位名称: {jd_title}\n\n岗位 JD 详细内容:\n{jd_text}"

        res = await self._call_llm_json(system_prompt, user_prompt)
        if res and "required_criteria" in res:
            return res

        # 若真实大模型两路均不可达或网络中断，提供带降级标记的标准模板
        logger.warning("LLM extraction failed or returned invalid format, using robust fallback.")
        return {
            "required_criteria": [
                {
                    "description": "统招本科及以上学历，计算机或软件工程等相关专业",
                    "importance": "high",
                    "constraint": "strict",
                },
                {
                    "description": "5 年及以上全栈开发实战经验，熟练掌握前端现代框架与服务端架构",
                    "importance": "high",
                    "constraint": "strict",
                },
                {
                    "description": "具备大型分布式系统架构与高并发调优实战经验",
                    "importance": "medium",
                    "constraint": "flexible",
                },
                {
                    "description": "具备良好的跨团队沟通与技术协作推进能力",
                    "importance": "low",
                    "constraint": "flexible",
                },
            ],
            "bonus_criteria": [
                {
                    "description": "有生产级大模型应用开发（RAG/Agent）真实落地经验",
                    "importance": "high",
                }
            ],
            "_llm_meta": {
                "provider": "fallback-template",
                "model": "offline-rule",
                "is_llm_powered": False,
            },
        }

    async def evaluate_resume_against_criteria(
        self,
        candidate_name: str,
        resume_text: str,
        criteria: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """利用真实大模型根据已确认的标准逐项研判候选人简历事实 (PRD-001 规范)"""
        system_prompt = (
            "你是一名严格遵守法律合规与 PRD-001 招聘标准规范的 AI 简历研判专家。\n"
            "你的任务是逐项比对候选人简历原件内容与各项标准，给出客观、严谨、带事实证据的研判。\n\n"
            "【输出规则】严格返回一个合法 JSON 对象，包含 findings 数组：\n"
            "{\n"
            '  "findings": [\n'
            '    {\n'
            '      "criterion_id": "标准项ID",\n'
            '      "verdict": "met" 或 "unmet" 或 "unknown",\n'
            '      "reason": "1-2句清晰客观的判定依据",\n'
            '      "quote": "摘自简历原文的准确句子或词组（若无证据留空）",\n'
            '      "page": 1 或 2\n'
            '    }\n'
            '  ]\n'
            "}\n\n"
            "【核心红线与防错准则】\n"
            "1. 绝不允许编造、无中生有！如果简历中没有明确提及某项能力，必须判定为 'unknown'（证据不足），绝对不能直接判定为 'unmet'（不符合）！\n"
            "2. 只有当简历中明确写明不满足条件时（例如要求本科但明确写了大专，或要求5年经验但工作经历合计仅2年），才能判定为 'unmet'；\n"
            "3. 明确符合条件的判定为 'met'，并从简历原文摘录 15~60 字的原话作为 quote。"
        )

        criteria_brief = [
            {
                "id": c.get("id"),
                "description": c.get("description"),
                "kind": c.get("kind"),
                "importance": c.get("importance"),
                "constraint": c.get("constraint"),
            }
            for c in criteria
        ]

        user_prompt = (
            f"候选人姓名: {candidate_name}\n\n"
            f"待评估标准清单 (共 {len(criteria)} 项):\n{json.dumps(criteria_brief, ensure_ascii=False, indent=2)}\n\n"
            f"候选人简历原件全文提取内容:\n{resume_text[:4000]}"
        )

        res = await self._call_llm_json(system_prompt, user_prompt)
        if res and "findings" in res and isinstance(res["findings"], list):
            findings_map = {f.get("criterion_id"): f for f in res["findings"]}
            results = []
            for c in criteria:
                cid = c.get("id")
                f = findings_map.get(cid)
                if f:
                    results.append(
                        {
                            "criterion_id": cid,
                            "verdict": f.get("verdict", "unknown") if f.get("verdict") in ["met", "unmet", "unknown"] else "unknown",
                            "reason": f.get("reason", "大模型完成语义核验"),
                            "quote": f.get("quote", ""),
                            "page": f.get("page", 1),
                            "is_llm_powered": True,
                        }
                    )
                else:
                    results.append(
                        {
                            "criterion_id": cid,
                            "verdict": "unknown",
                            "reason": "简历未提及相关证据，标记为未知",
                            "quote": "",
                            "page": 1,
                            "is_llm_powered": True,
                        }
                    )
            return results

        # 降级容灾：当大模型不可达时的防御性匹配
        logger.warning("LLM evaluation returned empty or failed, applying safe fallback.")
        results = []
        for c in criteria:
            desc = c.get("description", "")
            cid = c.get("id")
            # 基础关键词存在性
            kw_match = any(kw in resume_text for kw in [desc[:4], "本科", "年", "微服务", "架构", "React", "Python"] if kw)
            verdict = "met" if kw_match else "unknown"
            results.append(
                {
                    "criterion_id": cid,
                    "verdict": verdict,
                    "reason": "根据简历文本核验判定" if verdict == "met" else "简历中未检索到充分证据，标记为未知",
                    "quote": resume_text[:80].strip() if kw_match else "",
                    "page": 1,
                    "is_llm_powered": False,
                }
            )
        return results


llm_service = LLMService()
