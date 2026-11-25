import os
from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# 注册 Windows 系统黑体/微软雅黑
font_path = "C:/Windows/Fonts/simhei.ttf"
if not os.path.exists(font_path):
    font_path = "C:/Windows/Fonts/msyh.ttc"
pdfmetrics.registerFont(TTFont("ChineseFont", font_path))

OUT_DIRS = [
    Path("c:/Users/33046/Desktop/resume.ai/demo/e2e/fixtures/resumes"),
    Path("c:/Users/33046/Desktop/resume.ai/backend/storage/sample_resumes"),
]

for d in OUT_DIRS:
    d.mkdir(parents=True, exist_ok=True)

RESUMES = [
    {
        "filename": "张明哲_资深全栈架构师_8年.pdf",
        "lines": [
            "【个人简历】张明哲 - 资深全栈架构师",
            "联系电话: 13800138001 | 电子邮箱: zhangmingzhe@example.com | 现居: 北京市海淀区",
            "--------------------------------------------------------------------------------",
            "【教育背景】",
            "• 2015.09 - 2018.06  清华大学  计算机科学与技术专业  工学硕士（统招双一流）",
            "• 2011.09 - 2015.06  华中科技大学  软件工程专业  工学学士",
            "",
            "【专业技能】",
            "• 后端技术：精通 Java、Spring Boot 3、Spring Cloud 微服务体系，精通 Python、FastAPI 异步高并发架构",
            "• 前端技术：精通 React 18、Next.js、TypeScript、Tailwind CSS，具备大型复杂 Web 应用全链路架构经验",
            "• 数据与中间件：深入理解 MySQL 索引与事务优化、分库分表实践；熟练掌握 Redis 缓存与分布式锁机制",
            "• 云原生与 AI：熟练掌握 Docker、Kubernetes 容器编排，主导落地生产级大模型 RAG/Agent 知识库检索系统",
            "",
            "【工作经历】",
            "• 2021.07 - 至今  字节跳动  资深全栈架构专家（8年从业经验）",
            "  - 负责千万级日活创作者中心与中台微服务架构设计，基于 Spring Boot 与 FastAPI 重构核心数据流，",
            "    支撑日均 1.2 亿次请求，系统可用性达到 99.99%，P99 耗时降低 35%。",
            "  - 主导企业级知识库与智能简历助手项目，基于大模型 Agent 与向量检索技术，实现毫秒级事实证据链溯源。",
            "  - 深度治理 MySQL 慢查询与 Redis 缓存击穿隐患，主导全链路高并发与短事务改造。",
            "• 2018.07 - 2021.06  美团  高级研发工程师",
            "  - 核心参与外卖商家端订单流水线研发，高并发事务处理与分布式消息可靠性投递。",
            "",
            "【自我评价】",
            "8年全栈架构经验，具备优秀的抗压能力与技术攻关能力，热爱前沿大模型工程化落地与高性能系统建设。"
        ]
    },
    {
        "filename": "李沐阳_初级前端工程师_2年.pdf",
        "lines": [
            "【个人简历】李沐阳 - Web前端工程师",
            "联系电话: 13900139002 | 电子邮箱: limuyang@example.com | 现居: 北京市朝阳区",
            "--------------------------------------------------------------------------------",
            "【教育背景】",
            "• 2019.09 - 2023.06  北京邮电大学  软件工程专业  工学学士（统招本科）",
            "",
            "【专业技能】",
            "• 熟练掌握 HTML5、CSS3、JavaScript (ES6+)、TypeScript",
            "• 熟练掌握 Vue 3 与 React 框架，熟练使用 Vite 进行前端工程化构建与打包调优",
            "• 了解 Node.js 后端开发基础与 Express 框架，协同后端团队完成接口对接",
            "• 缺乏大型分布式系统架构与高并发后端微服务设计实战经验，渴望全面学习全栈技术",
            "",
            "【工作经历】",
            "• 2023.07 - 至今  某创新科技有限责任公司  前端开发工程师（2年工作经验）",
            "  - 负责公司官网、运营活动 H5 页面及内部后台管理系统的模块开发与维护。",
            "  - 使用 Vue 3 + Pinia + Element Plus 搭建中后台表单页面，提升页面复用率。",
            "  - 与后端工程师配合联调 RESTful API 契约接口，编写单元测试与前端异常埋点。",
            "",
            "【自我评价】",
            "年轻有活力，学习能力强，工作认真踏实。目前主要深耕前端交互领域，正在积极拓展后端与系统架构能力。"
        ]
    },
    {
        "filename": "王浩然_资深产品总监_10年.pdf",
        "lines": [
            "【个人简历】王浩然 - 资深产品总监",
            "联系电话: 13700137003 | 电子邮箱: wanghaoran@example.com | 现居: 上海市浦东新区",
            "--------------------------------------------------------------------------------",
            "【教育背景】",
            "• 2012.09 - 2016.06  中国人民大学  工商管理专业  管理学学士",
            "",
            "【核心特长】",
            "• 10年互联网 C端与B端产品规划、商业化变现与团队管理经验，无软件编码与系统研发背景",
            "• 精通用户需求分析、竞品调研、PRD 文档撰写、Axure 原型绘制与敏捷项目管理",
            "• 擅长业务增长策略制定、跨部门协调沟通与商业数据分析",
            "",
            "【工作经历】",
            "• 2020.03 - 至今  某知名电商集团  高级产品总监",
            "  - 全面负责用户增长与会员商业化产品线，带领 15 人产品与运营团队。",
            "  - 主导全站会员权益体系升级，提升年度付费转化率 28%，贡献数千万业务增量。",
            "• 2016.07 - 2020.02  腾讯科技  高级产品经理",
            "  - 负责企微生态产品规划与商业化功能设计，跨部门协同运营与市场推广。",
            "",
            "【自我评价】",
            "具备宏观战略视野与严密的商业敏锐度，擅长将业务战略拆解为产品落地路径。"
        ]
    },
    {
        "filename": "陈梓墨_全栈研发_扫描件降级样本.pdf",
        "lines": [
            "【样本简历】陈梓墨",
            "简述: 全栈开发者，扫描版纯文本识别字符较少，用于测试多模态 OCR 自动降级与状态流转机制。"
        ]
    }
]

def generate_pdf(filepath: Path, lines: list):
    c = canvas.Canvas(str(filepath), pagesize=letter)
    width, height = letter
    y = height - 50
    c.setFont("ChineseFont", 11)
    for line in lines:
        if line.startswith("【个人简历】") or line.startswith("【样本简历】"):
            c.setFont("ChineseFont", 16)
            c.drawString(50, y, line)
            c.setFont("ChineseFont", 10)
            y -= 25
        elif line.startswith("【"):
            c.setFont("ChineseFont", 12)
            y -= 8
            c.drawString(50, y, line)
            c.setFont("ChineseFont", 10)
            y -= 18
        else:
            c.drawString(50, y, line)
            y -= 16
        if y < 50:
            c.showPage()
            c.setFont("ChineseFont", 10)
            y = height - 50
    c.save()
    print(f"Generated: {filepath}")

if __name__ == "__main__":
    for item in RESUMES:
        for out_dir in OUT_DIRS:
            out_file = out_dir / item["filename"]
            generate_pdf(out_file, item["lines"])
    print("All test resumes generated successfully!")
