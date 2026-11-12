import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    JSON,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Job(Base):
    """招聘岗位实体"""
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    department: Mapped[str] = mapped_column(String(255), nullable=False)
    jd_text: Mapped[str] = mapped_column(Text, nullable=False)
    current_criteria_version_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    # 关联
    criteria_versions: Mapped[List["CriteriaVersion"]] = relationship(
        "CriteriaVersion", back_populates="job", cascade="all, delete-orphan", lazy="selectin"
    )
    batches: Mapped[List["Batch"]] = relationship("Batch", back_populates="job")


class CriteriaVersion(Base):
    """岗位标准版本快照：已确认版本不可变，作为评估和历史审计依据"""
    __tablename__ = "criteria_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    job_id: Mapped[str] = mapped_column(String(36), ForeignKey("jobs.id"), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft", index=True)  # draft / confirmed
    recommendation_rule: Mapped[Dict[str, Any]] = mapped_column(
        JSON,
        default=lambda: {"min_match_score": 70, "min_coverage_rate": 60, "is_calibrated": False},
    )
    confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    # 复合索引与部分唯一索引：保障单岗位最多只能有一份草稿
    __table_args__ = (
        Index(
            "uq_job_active_draft",
            "job_id",
            unique=True,
            postgresql_where=text("status = 'draft'"),
            sqlite_where=text("status = 'draft'"),
        ),
    )

    # 关联
    job: Mapped["Job"] = relationship("Job", back_populates="criteria_versions")
    criteria: Mapped[List["Criterion"]] = relationship(
        "Criterion",
        back_populates="version",
        cascade="all, delete-orphan",
        order_by="Criterion.order_num",
        lazy="selectin",
    )


class Criterion(Base):
    """单条标准判定项"""
    __tablename__ = "criteria"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    version_id: Mapped[str] = mapped_column(String(36), ForeignKey("criteria_versions.id"), nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # required / bonus
    importance: Mapped[str] = mapped_column(String(20), nullable=False)  # high / medium / low
    constraint: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # strict / flexible / null
    order_num: Mapped[int] = mapped_column(Integer, default=0)

    # 关联
    version: Mapped["CriteriaVersion"] = relationship("CriteriaVersion", back_populates="criteria")


class Batch(Base):
    """简历导入批次（单批最多 50 份，绑定确认的标准版本）"""
    __tablename__ = "batches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    job_id: Mapped[str] = mapped_column(String(36), ForeignKey("jobs.id"), nullable=False, index=True)
    criteria_version_id: Mapped[str] = mapped_column(String(36), ForeignKey("criteria_versions.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)

    # 关联
    job: Mapped["Job"] = relationship("Job", back_populates="batches")
    screening_items: Mapped[List["ScreeningItem"]] = relationship(
        "ScreeningItem", back_populates="batch", cascade="all, delete-orphan"
    )


class ScreeningItem(Base):
    """候选人单份简历筛选项及处理状态"""
    __tablename__ = "screening_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    batch_id: Mapped[str] = mapped_column(String(36), ForeignKey("batches.id"), nullable=False, index=True)
    candidate_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    
    # 状态机：queued -> parsing -> evaluating -> completed / failed
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)
    # 逐级解析阶段：text -> ocr -> multimodal
    parse_stage: Mapped[str] = mapped_column(String(20), default="text")
    error_info: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, index=True
    )

    # 关联
    batch: Mapped["Batch"] = relationship("Batch", back_populates="screening_items")
    evaluations: Mapped[List["EvaluationSnapshot"]] = relationship(
        "EvaluationSnapshot", back_populates="screening_item", cascade="all, delete-orphan"
    )
    decisions: Mapped[List["AuditDecision"]] = relationship(
        "AuditDecision", back_populates="screening_item", cascade="all, delete-orphan"
    )


class EvaluationSnapshot(Base):
    """评估快照：支持多次增量重评，版本递增，不可篡改"""
    __tablename__ = "evaluation_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    item_id: Mapped[str] = mapped_column(String(36), ForeignKey("screening_items.id"), nullable=False, index=True)
    criteria_version_id: Mapped[str] = mapped_column(String(36), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, index=True)
    
    # 确定性衍生分与分流
    match_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    coverage_rate: Mapped[int] = mapped_column(Integer, nullable=False, default=0, index=True)
    suggested_group: Mapped[str] = mapped_column(String(20), nullable=False, default="other", index=True)
    
    # 结构化判定详情（包含各项 verdict, reason, evidence 引用列表）
    findings: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list)
    bonus_summary: Mapped[Dict[str, int]] = mapped_column(JSON, default=lambda: {"met": 0, "total": 0})
    is_rule_calibrated: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    # 关联
    screening_item: Mapped["ScreeningItem"] = relationship("ScreeningItem", back_populates="evaluations")


class AuditDecision(Base):
    """HR 人工复核决策与审计追踪 (HITL Audit Trail)"""
    __tablename__ = "audit_decisions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    item_id: Mapped[str] = mapped_column(String(36), ForeignKey("screening_items.id"), nullable=False, index=True)
    
    # 决定类型：advance (推进沟通) / reject (暂不推进) / supplement (待补充信息)
    decision: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    tags: Mapped[List[str]] = mapped_column(JSON, default=list)
    notes: Mapped[str] = mapped_column(Text, default="")
    decided_by: Mapped[str] = mapped_column(String(100), default="HR")
    supersedes_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)

    # 关联
    screening_item: Mapped["ScreeningItem"] = relationship("ScreeningItem", back_populates="decisions")
