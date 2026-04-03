import hashlib
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import string
from dataclasses import dataclass
from datetime import datetime, timedelta
from http.cookies import SimpleCookie
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, quote
from urllib.error import HTTPError, URLError
from urllib.request import Request as UrlRequest, urlopen
from wsgiref.simple_server import make_server

from jinja2 import Environment, FileSystemLoader, select_autoescape
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill

BASE_DIR = Path(__file__).resolve().parent
TEMPLATE_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "afe.db"

SESSION_COOKIE = "afe_session"
SESSION_HOURS = 12
PASSWORD_ITERATIONS = 120_000

ROUTES: list[tuple[str, re.Pattern[str], Any]] = []

SCHOOL_LEVEL_OPTIONS = ["중학교", "고등학교"]
SEMESTER_OPTIONS = ["1학기", "2학기"]
PROGRAM_STATUS_LABELS = {
    "collecting": "학생 입력 진행 중",
    "teacher_submitted": "강사 제출 완료",
    "completed": "관리자 마감 완료",
}
SUBMISSION_STATUS_LABELS = {
    "student_submitted": "학생 제출",
    "reviewed": "강사 검토 완료",
    "admin_updated": "관리자 검토 완료",
}

PDF_TEMPLATE_PRESETS = [
    {
        "name": "실험 탐구활동 결과질문지",
        "description": "화학실험 활동기록보고서와 연계되는 실험 탐구형 학생 질문지입니다.",
        "report_reference": "화학실험 활동기록보고서.pdf",
        "report_summary": "실험 보고서형 문장으로 정리될 수 있도록 교과 연계, 핵심 키워드, 탐구 확장 계획까지 단계적으로 입력받습니다.",
        "sections": [
            {
                "title": "교과 연계 및 진로 정보",
                "description": "보고서 상단에 들어갈 교과, 단원, 진로 기본 정보를 먼저 정리합니다.",
                "fields": [
                    {"id": "linked_subject_1", "label": "연계 교과 1", "type": "text", "placeholder": "예: 화학실험"},
                    {"id": "linked_unit_1", "label": "연계 단원 1", "type": "text", "placeholder": "예: 물질의 성질 탐구"},
                    {"id": "linked_subject_2", "label": "연계 교과 2", "type": "text", "placeholder": "예: 과학과제연구"},
                    {"id": "linked_unit_2", "label": "연계 단원 2", "type": "text", "placeholder": "예: 연구 설계"},
                    {"id": "career_goal", "label": "희망 진로", "type": "text", "placeholder": "예: 화학 공정 설계 및 시스템 구축 전문가"},
                    {"id": "career_major", "label": "희망 학과 또는 전공", "type": "text", "placeholder": "예: 화학공학과"},
                    {"id": "keywords", "label": "핵심 키워드", "type": "text", "placeholder": "예: 편광, 반응 속도, chirality, 광학 활성"},
                ],
            },
            {
                "title": "탐구 내용 정리",
                "description": "학생이 실제로 작성하는 실험 탐구 서술형 질문입니다.",
                "fields": [
                    {
                        "id": "curriculum_connection",
                        "label": "어떤 교과과정과 기초지식을 활용하여 탐구(실험)활동으로 연계하였습니까?",
                        "type": "textarea",
                        "rows": 5,
                        "placeholder": "교과와 단원을 어떻게 연결했고, 어떤 계기로 탐구를 시작했는지 적어 주세요.",
                    },
                    {
                        "id": "interest_focus",
                        "label": "탐구 과정에서 가장 큰 관심을 가진 개념 또는 활동은 무엇입니까?",
                        "type": "textarea",
                        "rows": 4,
                        "placeholder": "가장 흥미로웠던 개념, 실험 변수, 분석 포인트를 적어 주세요.",
                    },
                    {
                        "id": "research_process",
                        "label": "추가로 조사하거나 익힌 실험 기법, 분석 도구, 데이터 처리 과정은 무엇입니까?",
                        "type": "textarea",
                        "rows": 5,
                        "placeholder": "직접 익힌 기기 사용법, 추가 조사한 내용, 데이터 분석 과정을 구체적으로 적어 주세요.",
                    },
                    {
                        "id": "career_extension",
                        "label": "희망 진로와 연계하여 앞으로 확장하고 싶은 후속 탐구는 무엇입니까?",
                        "type": "textarea",
                        "rows": 4,
                        "placeholder": "앞으로 어떤 실험, 연구, 전공 탐구로 확장하고 싶은지 적어 주세요.",
                    },
                    {
                        "id": "highlight_point",
                        "label": "이번 탐구에서 특히 강조하고 싶은 성과나 강점은 무엇입니까?",
                        "type": "textarea",
                        "rows": 4,
                        "placeholder": "본인이 잘했다고 생각하는 점, 분석의 강점, 의미 있는 성과를 적어 주세요.",
                    },
                    {
                        "id": "future_plan",
                        "label": "이번 활동을 바탕으로 앞으로 어떤 역량과 방향을 키워나가고 싶습니까?",
                        "type": "textarea",
                        "rows": 4,
                        "placeholder": "후속 연구, 진로 확장, 장기적인 성장 계획을 적어 주세요.",
                    },
                ],
            },
        ],
    },
    {
        "name": "사회 탐구활동 결과질문지",
        "description": "미래산업 활동기록보고서와 연계되는 사회 탐구형 학생 질문지입니다.",
        "report_reference": "미래산업 활동기록보고서.pdf",
        "report_summary": "매체, 사회 문제, 미래산업 등 융합 탐구 결과를 보고서형 문장으로 정리할 수 있도록 설계된 템플릿입니다.",
        "sections": [
            {
                "title": "교과 연계 및 진로 정보",
                "description": "학생의 탐구 배경과 진로 방향을 먼저 정리합니다.",
                "fields": [
                    {"id": "linked_subject_1", "label": "연계 교과 1", "type": "text", "placeholder": "예: 언어와 매체"},
                    {"id": "linked_unit_1", "label": "연계 단원 1", "type": "text", "placeholder": "예: 매체의 표현과 활용"},
                    {"id": "linked_subject_2", "label": "연계 교과 2", "type": "text", "placeholder": "예: 사회문제탐구"},
                    {"id": "linked_unit_2", "label": "연계 단원 2", "type": "text", "placeholder": "예: 인공지능의 발전에 따른 예측과 대응 방안"},
                    {"id": "career_goal", "label": "희망 진로", "type": "text", "placeholder": "예: 통역사"},
                    {"id": "career_major", "label": "희망 학과 또는 전공", "type": "text", "placeholder": "예: 통번역학과"},
                    {"id": "keywords", "label": "핵심 키워드", "type": "text", "placeholder": "예: 미래산업, UX, 디자인, 검색엔진"},
                ],
            },
            {
                "title": "탐구 내용 정리",
                "description": "사회 탐구 결과를 보고서 문장으로 풀어낼 수 있도록 돕는 질문입니다.",
                "fields": [
                    {
                        "id": "curriculum_connection",
                        "label": "어떤 교과과정과 기초지식을 활용하여 탐구활동으로 연계하였습니까?",
                        "type": "textarea",
                        "rows": 5,
                        "placeholder": "교과 연계, 탐구 계기, 문제의식을 함께 적어 주세요.",
                    },
                    {
                        "id": "interest_focus",
                        "label": "탐구 과정에서 가장 깊은 관심을 가진 개념 또는 활동은 무엇입니까?",
                        "type": "textarea",
                        "rows": 4,
                        "placeholder": "특히 주목한 개념이나 사례, 사용자 관점 등을 적어 주세요.",
                    },
                    {
                        "id": "research_process",
                        "label": "구체적으로 조사하거나 분석한 사례, 자료, 비교 내용은 무엇입니까?",
                        "type": "textarea",
                        "rows": 5,
                        "placeholder": "기업 사례, 사회 현상, 문화 비교, 자료 조사 내용을 구체적으로 적어 주세요.",
                    },
                    {
                        "id": "career_extension",
                        "label": "희망 진로와 연계하여 앞으로 확장하고 싶은 실천적 탐구는 무엇입니까?",
                        "type": "textarea",
                        "rows": 4,
                        "placeholder": "앞으로 더 탐구하고 싶은 주제나 실제 적용 계획을 적어 주세요.",
                    },
                    {
                        "id": "highlight_point",
                        "label": "이번 탐구에서 특히 강조하고 싶은 관점이나 성과는 무엇입니까?",
                        "type": "textarea",
                        "rows": 4,
                        "placeholder": "탐구를 통해 얻은 통찰, 인간과 기술의 역할, 본인의 강점을 적어 주세요.",
                    },
                    {
                        "id": "future_plan",
                        "label": "이번 활동을 바탕으로 앞으로 어떤 전문 역량을 키워나가고 싶습니까?",
                        "type": "textarea",
                        "rows": 4,
                        "placeholder": "후속 탐구 계획과 진로 역량 성장 방향을 적어 주세요.",
                    },
                ],
            },
        ],
    },
]

EVALUATION_EXAMPLE_PROMPT = """
그룹 활동 보고서 개별 평가 프롬프트

고등학교 교과 세특 작성해 줘.
[작성 지침]
1. 금지 사항: 제공된 내용 외의 새로운 사실 생성 금지.
2. 서술 방식: 관찰자 시점에서 주관적 평가와 불필요한 수식어를 배제하고 객관적 사실을 서술.
3. 용어: 학교생활기록부 기재 요령에 적합한 용어 사용. ('논문' 언급이나 논문명은 '관련 자료' 등으로 대체.)
4. 동사: 수동적 동사(이해함, 정리함, 파악함, 학습함, 확인함 등)를 배제하고 주도적 동사(구조화함, 분석함, 도출함 등)를 사용. 단, 과장된 동사(규명함, 논증함, 정립함 등)는 금지.
5. 문장 연결: '또한', '아울러', '이어서', '나아가', '향후' 등의 적절한 접속어와 지시어를 반드시 활용하여 문장들을 유기적으로 연결.
[문단 구조 및 글자 수: 한 문단으로 출력할 것]
* 도입부(총 3문장): 교과 및 진로 연계를 탐구 초록 형식으로 서술. 첫 문장은 원문에 제시된 탐구 동기를 서술. 이어지는 2문장은 '[교과명]에서 학습한~' 또는 '[교과명]의~' 형태로 구체적인 교과 개념이나 원리가 탐구에 적용된 과정을 서술. 단원명 언급 금지.
* 전개부(총 4문장): 심화 탐구. 탐구 과정에서 활동한 내용을 구체적으로 풀어서 서술.
* 결론부(총 2문장): 후속 연구 및 종합 평가. 원문에 기재된 후속 연구계획이 있으면 미래 시제로 2문장 서술. 후속 연구계획이 기재되지 않았으면 탐구에 대한 종합 평가를 서술.

출력 규칙:
- 반드시 한국어 한 문단으로만 작성.
- 마크다운, 번호, 제목, 따옴표 없이 본문만 출력.
- 학생이 작성한 정보와 프로그램 정보만 사용.
""".strip()

# Local fallback key so the teacher AI suggestion works even when the server
# process is started without OPENAI_API_KEY in the environment.
OPENAI_EMBEDDED_API_KEY = "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"

env = Environment(
    loader=FileSystemLoader(str(TEMPLATE_DIR)),
    autoescape=select_autoescape(["html", "xml"]),
    trim_blocks=True,
    lstrip_blocks=True,
)


@dataclass
class Response:
    body: bytes
    status: str = "200 OK"
    headers: list[tuple[str, str]] | None = None

    def as_wsgi(self) -> tuple[str, list[tuple[str, str]], list[bytes]]:
        headers = self.headers[:] if self.headers else []
        if not any(name.lower() == "content-length" for name, _ in headers):
            headers.append(("Content-Length", str(len(self.body))))
        return self.status, headers, [self.body]


class Request:
    def __init__(self, environ: dict[str, Any], db: sqlite3.Connection):
        self.environ = environ
        self.db = db
        self.method = environ.get("REQUEST_METHOD", "GET").upper()
        self.path = environ.get("PATH_INFO", "/") or "/"
        self.query = self._parse_query(environ.get("QUERY_STRING", ""))
        self.form = self._parse_form()
        self.cookies = SimpleCookie(environ.get("HTTP_COOKIE", ""))
        session_cookie = self.cookies.get(SESSION_COOKIE)
        self.session = load_session(db, session_cookie.value if session_cookie else None)
        self.flash = pop_flash(db, self.session["id"]) if self.session else None

    @staticmethod
    def _parse_query(raw_query: str) -> dict[str, str]:
        parsed = parse_qs(raw_query, keep_blank_values=True)
        return {key: values[-1] if values else "" for key, values in parsed.items()}

    def _parse_form(self) -> dict[str, str]:
        if self.method != "POST":
            return {}
        try:
            length = int(self.environ.get("CONTENT_LENGTH") or 0)
        except ValueError:
            length = 0
        if length <= 0:
            return {}
        raw = self.environ["wsgi.input"].read(length).decode("utf-8")
        parsed = parse_qs(raw, keep_blank_values=True)
        return {key: values[-1] if values else "" for key, values in parsed.items()}


def route(method: str, pattern: str):
    regex = re.compile(f"^{pattern}$")

    def decorator(func):
        ROUTES.append((method.upper(), regex, func))
        return func

    return decorator


def now() -> datetime:
    return datetime.now().replace(microsecond=0)


def now_iso() -> str:
    return now().isoformat()


def iso_after_hours(hours: int) -> str:
    return (now() + timedelta(hours=hours)).isoformat()


def connect_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def password_hash(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), PASSWORD_ITERATIONS
    )
    return f"{salt}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt, digest = stored_hash.split("$", 1)
    except ValueError:
        return False
    candidate = password_hash(password, salt).split("$", 1)[1]
    return secrets.compare_digest(candidate, digest)


def json_dump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def parse_json(value: str | None, fallback: Any) -> Any:
    if not value:
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def parse_questions_from_text(raw_text: str) -> list[str]:
    return [line.strip() for line in raw_text.splitlines() if line.strip()]


def normalize_template_schema(raw_schema: Any, fallback_title: str = "") -> dict[str, Any]:
    if isinstance(raw_schema, dict) and isinstance(raw_schema.get("sections"), list):
        sections = []
        flat_fields = []
        field_counter = 0
        for section_index, section in enumerate(raw_schema["sections"], start=1):
            section_title = section.get("title") or f"섹션 {section_index}"
            normalized_section = {
                "title": section_title,
                "description": section.get("description", ""),
                "fields": [],
            }
            for field in section.get("fields", []):
                field_counter += 1
                field_id = field.get("id") or f"field_{field_counter}"
                field_type = field.get("type", "textarea")
                normalized_field = {
                    "id": field_id,
                    "label": field.get("label") or f"문항 {field_counter}",
                    "type": field_type if field_type in {"text", "textarea"} else "textarea",
                    "placeholder": field.get("placeholder", ""),
                    "rows": int(field.get("rows", 4)),
                    "required": field.get("required", True),
                    "hint": field.get("hint", ""),
                    "section_title": section_title,
                }
                normalized_section["fields"].append(normalized_field)
                flat_fields.append(normalized_field)
            sections.append(normalized_section)
        return {
            "title": raw_schema.get("title") or fallback_title,
            "description": raw_schema.get("description", ""),
            "report_reference": raw_schema.get("report_reference", ""),
            "report_summary": raw_schema.get("report_summary", ""),
            "sections": sections,
            "flat_fields": flat_fields,
        }

    questions = raw_schema if isinstance(raw_schema, list) else []
    flat_fields = []
    for index, question in enumerate(questions, start=1):
        if isinstance(question, dict) and question.get("label"):
            flat_fields.append(
                {
                    "id": question.get("id") or f"field_{index}",
                    "label": question["label"],
                    "type": question.get("type", "textarea"),
                    "placeholder": question.get("placeholder", ""),
                    "rows": int(question.get("rows", 4)),
                    "required": question.get("required", True),
                    "hint": question.get("hint", ""),
                    "section_title": "기본 질문",
                }
            )
        elif isinstance(question, str):
            flat_fields.append(
                {
                    "id": f"answer_{index - 1}",
                    "label": question,
                    "type": "textarea",
                    "placeholder": "답변을 입력해 주세요.",
                    "rows": 5,
                    "required": True,
                    "hint": "",
                    "section_title": "기본 질문",
                }
            )
    return {
        "title": fallback_title,
        "description": "",
        "report_reference": "",
        "report_summary": "",
        "sections": [
            {
                "title": "기본 질문",
                "description": "",
                "fields": flat_fields,
            }
        ],
        "flat_fields": flat_fields,
    }


def get_template_schema(record: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    raw_schema = parse_json(record["questions_json"], [])
    record_keys = set(record.keys()) if hasattr(record, "keys") else set(record)
    if "name" in record_keys:
        fallback_title = record["name"]
    elif "template_name" in record_keys:
        fallback_title = record["template_name"]
    else:
        fallback_title = ""
    return normalize_template_schema(raw_schema, fallback_title=fallback_title)


def get_template_card(record: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    item = dict(record)
    schema = get_template_schema(item)
    item["schema"] = schema
    item["field_count"] = len(schema["flat_fields"])
    item["preview_fields"] = [field["label"] for field in schema["flat_fields"][:4]]
    item["question_lines"] = "\n".join(field["label"] for field in schema["flat_fields"])
    item["prompt_text"] = (item.get("prompt_text") or EVALUATION_EXAMPLE_PROMPT).strip()
    item["prompt_preview"] = item["prompt_text"][:180]
    return item


def status_label(status: str, kind: str = "program") -> str:
    mapping = PROGRAM_STATUS_LABELS if kind == "program" else SUBMISSION_STATUS_LABELS
    return mapping.get(status, status)


def format_datetime(value: str | None) -> str:
    if not value:
        return "-"
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return value
    return parsed.strftime("%Y-%m-%d %H:%M")


def final_evaluation(submission: sqlite3.Row | dict[str, Any]) -> str:
    admin_feedback = (submission["admin_feedback"] or "").strip()
    if admin_feedback:
        return admin_feedback
    return (submission["teacher_evaluation"] or "").strip()


def init_db() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    with connect_db() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS admins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                display_name TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS teachers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT,
                access_code TEXT NOT NULL UNIQUE,
                university TEXT DEFAULT '',
                username TEXT DEFAULT '',
                password_hash TEXT DEFAULT '',
                temporary_password TEXT DEFAULT '',
                memo TEXT DEFAULT '',
                academic_info TEXT DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS program_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                description TEXT,
                prompt_text TEXT DEFAULT '',
                questions_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS programs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                school_name TEXT NOT NULL,
                school_level TEXT NOT NULL,
                year INTEGER NOT NULL,
                semester TEXT NOT NULL,
                template_id INTEGER,
                template_name TEXT NOT NULL,
                template_description TEXT,
                prompt_text TEXT DEFAULT '',
                questions_json TEXT NOT NULL,
                teacher_id INTEGER NOT NULL,
                program_code TEXT NOT NULL UNIQUE,
                status TEXT NOT NULL DEFAULT 'collecting',
                teacher_submitted_at TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (template_id) REFERENCES program_templates(id),
                FOREIGN KEY (teacher_id) REFERENCES teachers(id)
            );

            CREATE TABLE IF NOT EXISTS submissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                program_id INTEGER NOT NULL,
                student_number TEXT NOT NULL,
                student_name TEXT NOT NULL,
                desired_major TEXT NOT NULL,
                answers_json TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'student_submitted',
                student_submitted_at TEXT NOT NULL,
                teacher_summary TEXT DEFAULT '',
                teacher_evaluation TEXT DEFAULT '',
                teacher_updated_at TEXT,
                ai_suggestion TEXT DEFAULT '',
                ai_generated_at TEXT,
                ai_model TEXT DEFAULT '',
                admin_feedback TEXT DEFAULT '',
                admin_updated_at TEXT,
                UNIQUE (program_id, student_number),
                FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                role TEXT NOT NULL,
                admin_username TEXT,
                teacher_id INTEGER,
                program_id INTEGER,
                context_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS app_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            """
        )
        ensure_teacher_schema(db)
        ensure_template_schema_columns(db)
        ensure_program_schema_columns(db)
        ensure_submission_schema(db)
        ensure_bootstrap_data(db)
        ensure_pdf_template_presets(db)


def ensure_teacher_schema(db: sqlite3.Connection) -> None:
    columns = {
        row["name"] for row in db.execute("PRAGMA table_info(teachers)").fetchall()
    }
    if "university" not in columns:
        db.execute("ALTER TABLE teachers ADD COLUMN university TEXT DEFAULT ''")
    if "username" not in columns:
        db.execute("ALTER TABLE teachers ADD COLUMN username TEXT DEFAULT ''")
    if "password_hash" not in columns:
        db.execute("ALTER TABLE teachers ADD COLUMN password_hash TEXT DEFAULT ''")
    if "temporary_password" not in columns:
        db.execute("ALTER TABLE teachers ADD COLUMN temporary_password TEXT DEFAULT ''")
    if "memo" not in columns:
        db.execute("ALTER TABLE teachers ADD COLUMN memo TEXT DEFAULT ''")
    if "academic_info" not in columns:
        db.execute("ALTER TABLE teachers ADD COLUMN academic_info TEXT DEFAULT ''")
    db.commit()

    rows = db.execute("SELECT id, name, username, password_hash, temporary_password, access_code FROM teachers").fetchall()
    for row in rows:
        username = (row["username"] or "").strip()
        temp_password = (row["temporary_password"] or "").strip()
        password_value = (row["password_hash"] or "").strip()
        changed = False
        if not username:
            username = generate_teacher_username(db, row["name"], teacher_id=row["id"])
            changed = True
        if not temp_password:
            temp_password = generate_teacher_password(row["id"])
            changed = True
        if not password_value:
            password_value = password_hash(temp_password)
            changed = True
        if changed:
            db.execute(
                """
                UPDATE teachers
                SET username = ?, temporary_password = ?, password_hash = ?
                WHERE id = ?
                """,
                (username, temp_password, password_value, row["id"]),
            )
        db.commit()


def ensure_template_schema_columns(db: sqlite3.Connection) -> None:
    columns = {
        row["name"] for row in db.execute("PRAGMA table_info(program_templates)").fetchall()
    }
    if "prompt_text" not in columns:
        db.execute("ALTER TABLE program_templates ADD COLUMN prompt_text TEXT DEFAULT ''")
        db.commit()

    rows = db.execute("SELECT id, prompt_text FROM program_templates").fetchall()
    for row in rows:
        if not (row["prompt_text"] or "").strip():
            db.execute(
                "UPDATE program_templates SET prompt_text = ? WHERE id = ?",
                (EVALUATION_EXAMPLE_PROMPT, row["id"]),
            )
    db.commit()


def ensure_program_schema_columns(db: sqlite3.Connection) -> None:
    columns = {
        row["name"] for row in db.execute("PRAGMA table_info(programs)").fetchall()
    }
    if "prompt_text" not in columns:
        db.execute("ALTER TABLE programs ADD COLUMN prompt_text TEXT DEFAULT ''")
        db.commit()

    programs = db.execute("SELECT id, template_id, prompt_text, school_level FROM programs").fetchall()
    for program in programs:
        if program["school_level"] in {"1학년", "2학년", "3학년"}:
            db.execute("UPDATE programs SET school_level = '고등학교' WHERE id = ?", (program["id"],))
        if (program["prompt_text"] or "").strip():
            continue
        prompt_text = EVALUATION_EXAMPLE_PROMPT
        if program["template_id"]:
            template = db.execute(
                "SELECT prompt_text FROM program_templates WHERE id = ?",
                (program["template_id"],),
            ).fetchone()
            if template and (template["prompt_text"] or "").strip():
                prompt_text = template["prompt_text"]
        db.execute("UPDATE programs SET prompt_text = ? WHERE id = ?", (prompt_text, program["id"]))
    db.commit()


def ensure_submission_schema(db: sqlite3.Connection) -> None:
    columns = {
        row["name"] for row in db.execute("PRAGMA table_info(submissions)").fetchall()
    }
    if "ai_suggestion" not in columns:
        db.execute("ALTER TABLE submissions ADD COLUMN ai_suggestion TEXT DEFAULT ''")
    if "ai_generated_at" not in columns:
        db.execute("ALTER TABLE submissions ADD COLUMN ai_generated_at TEXT")
    if "ai_model" not in columns:
        db.execute("ALTER TABLE submissions ADD COLUMN ai_model TEXT DEFAULT ''")
    db.commit()


def ensure_bootstrap_data(db: sqlite3.Connection) -> None:
    bootstrap_done = db.execute(
        "SELECT value FROM app_meta WHERE key = ?",
        ("bootstrap_completed",),
    ).fetchone()
    if bootstrap_done:
        return

    has_existing_data = any(
        db.execute(f"SELECT 1 FROM {table_name} LIMIT 1").fetchone()
        for table_name in ("admins", "teachers", "program_templates", "programs", "submissions")
    )
    if not has_existing_data:
        seed_defaults(db)

    db.execute(
        "INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)",
        ("bootstrap_completed", now_iso()),
    )
    db.commit()


def ensure_pdf_template_presets(db: sqlite3.Connection) -> None:
    imported = db.execute(
        "SELECT value FROM app_meta WHERE key = ?",
        ("pdf_template_presets_v1",),
    ).fetchone()
    if imported:
        return

    for preset in PDF_TEMPLATE_PRESETS:
        exists = db.execute(
            "SELECT 1 FROM program_templates WHERE name = ?",
            (preset["name"],),
        ).fetchone()
        if exists:
            continue
        db.execute(
            """
            INSERT INTO program_templates (name, description, prompt_text, questions_json, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                preset["name"],
                preset["description"],
                EVALUATION_EXAMPLE_PROMPT,
                json_dump(preset),
                now_iso(),
            ),
        )

    db.execute(
        "INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)",
        ("pdf_template_presets_v1", now_iso()),
    )
    db.commit()


def seed_defaults(db: sqlite3.Connection) -> None:
    admin_exists = db.execute("SELECT 1 FROM admins LIMIT 1").fetchone()
    if not admin_exists:
        db.execute(
            """
            INSERT INTO admins (username, password_hash, display_name, created_at)
            VALUES (?, ?, ?, ?)
            """,
            ("admin", password_hash("afe1234!"), "AFE 관리자", now_iso()),
        )

    default_templates = [
        {
            "name": "일반 탐구",
            "description": "자기주도 탐구 활동을 바탕으로 작성하는 일반형 산출물 질문지입니다.",
            "questions": [
                "이번 프로젝트에서 다룬 주제와 선택한 이유를 설명해 주세요.",
                "탐구를 진행하면서 가장 중요하게 참고한 자료 또는 근거는 무엇인가요?",
                "이번 활동을 통해 배우거나 새롭게 알게 된 점을 적어 주세요.",
                "강사와의 면담에서 추가로 받고 싶은 피드백이 있다면 적어 주세요.",
            ],
        },
        {
            "name": "실험",
            "description": "가설, 실험 과정, 결과 해석 중심으로 작성하는 실험형 질문지입니다.",
            "questions": [
                "실험의 목적과 가설을 정리해 주세요.",
                "실험 절차와 사용한 도구 또는 재료를 설명해 주세요.",
                "관찰한 결과와 예상과 달랐던 점이 있었다면 적어 주세요.",
                "실험 결과를 바탕으로 어떤 결론을 내렸는지 설명해 주세요.",
            ],
        },
        {
            "name": "데이터",
            "description": "데이터 수집, 분석, 해석 과정을 정리하는 데이터형 질문지입니다.",
            "questions": [
                "수집한 데이터의 종류와 출처를 적어 주세요.",
                "데이터를 어떤 기준으로 정리하거나 전처리했는지 설명해 주세요.",
                "분석 과정에서 발견한 핵심 패턴이나 인사이트를 적어 주세요.",
                "이번 데이터 분석이 진로와 어떤 관련이 있었는지 적어 주세요.",
            ],
        },
    ]
    for template in default_templates:
        exists = db.execute(
            "SELECT 1 FROM program_templates WHERE name = ?",
            (template["name"],),
        ).fetchone()
        if not exists:
            db.execute(
                """
                INSERT INTO program_templates (name, description, prompt_text, questions_json, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    template["name"],
                    template["description"],
                    EVALUATION_EXAMPLE_PROMPT,
                    json_dump(template["questions"]),
                    now_iso(),
                ),
            )

    teacher_row = db.execute("SELECT * FROM teachers WHERE access_code = ?", ("TCHR2026",)).fetchone()
    if not teacher_row:
        default_teacher_password = "AFE!T0001"
        db.execute(
            """
            INSERT INTO teachers (
                name, email, access_code, university, username, password_hash,
                temporary_password, memo, academic_info, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "김강사",
                "teacher@example.com",
                "TCHR2026",
                "KAIST",
                "teacher001",
                password_hash(default_teacher_password),
                default_teacher_password,
                "샘플 강사 계정",
                "학교 신분\nKAIST 박사과정",
                now_iso(),
            ),
        )
        teacher_row = db.execute("SELECT * FROM teachers WHERE access_code = ?", ("TCHR2026",)).fetchone()

    if not db.execute("SELECT 1 FROM programs LIMIT 1").fetchone():
        template = db.execute(
            "SELECT * FROM program_templates WHERE name = ?",
            ("일반 탐구",),
        ).fetchone()
        db.execute(
            """
            INSERT INTO programs (
                title, school_name, school_level, year, semester,
                template_id, template_name, template_description, prompt_text, questions_json,
                teacher_id, program_code, status, teacher_submitted_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "2026 1학기 일반 탐구 시범 프로그램",
                "충주대원고등학교",
                "고등학교",
                2026,
                "1학기",
                template["id"],
                template["name"],
                template["description"],
                template["prompt_text"] or EVALUATION_EXAMPLE_PROMPT,
                template["questions_json"],
                teacher_row["id"],
                "20261001",
                "collecting",
                None,
                now_iso(),
            ),
        )
        program_row = db.execute(
            "SELECT * FROM programs WHERE program_code = ?",
            ("20261001",),
        ).fetchone()
        db.execute(
            """
            INSERT INTO submissions (
                program_id, student_number, student_name, desired_major,
                answers_json, status, student_submitted_at,
                teacher_summary, teacher_evaluation, teacher_updated_at,
                admin_feedback, admin_updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                program_row["id"],
                "30101",
                "홍길동",
                "컴퓨터공학과",
                json_dump(
                    [
                        {
                            "question": "이번 프로젝트에서 다룬 주제와 선택한 이유를 설명해 주세요.",
                            "answer": "AI를 활용한 교육 프로그램 기획 과정을 주제로 삼았습니다.",
                        },
                        {
                            "question": "탐구를 진행하면서 가장 중요하게 참고한 자료 또는 근거는 무엇인가요?",
                            "answer": "학교 수업 자료와 관련 교육 프로그램 운영 사례를 참고했습니다.",
                        },
                        {
                            "question": "이번 활동을 통해 배우거나 새롭게 알게 된 점을 적어 주세요.",
                            "answer": "서비스를 설계할 때 사용자 흐름을 먼저 정리하는 것이 중요하다는 점을 배웠습니다.",
                        },
                        {
                            "question": "강사와의 면담에서 추가로 받고 싶은 피드백이 있다면 적어 주세요.",
                            "answer": "산출물 정리 방식과 발표 구조에 대한 피드백을 받고 싶습니다.",
                        },
                    ]
                ),
                "student_submitted",
                now_iso(),
                "",
                "",
                None,
                "",
                None,
            ),
        )
    db.commit()


def load_session(db: sqlite3.Connection, session_id: str | None) -> dict[str, Any] | None:
    if not session_id:
        return None
    row = db.execute(
        "SELECT * FROM sessions WHERE id = ? AND expires_at > ?",
        (session_id, now_iso()),
    ).fetchone()
    if not row:
        return None
    session = dict(row)
    session["context"] = parse_json(row["context_json"], {})
    return session


def create_session(
    db: sqlite3.Connection,
    *,
    role: str,
    admin_username: str | None = None,
    teacher_id: int | None = None,
    program_id: int | None = None,
    context: dict[str, Any] | None = None,
) -> str:
    session_id = secrets.token_urlsafe(24)
    db.execute(
        """
        INSERT INTO sessions (id, role, admin_username, teacher_id, program_id, context_json, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            session_id,
            role,
            admin_username,
            teacher_id,
            program_id,
            json_dump(context or {}),
            now_iso(),
            iso_after_hours(SESSION_HOURS),
        ),
    )
    db.commit()
    return session_id


def destroy_session(db: sqlite3.Connection, session_id: str | None) -> None:
    if not session_id:
        return
    db.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
    db.commit()


def set_flash(db: sqlite3.Connection, session_id: str | None, message: str, tone: str = "info") -> None:
    if not session_id:
        return
    row = db.execute("SELECT context_json FROM sessions WHERE id = ?", (session_id,)).fetchone()
    if not row:
        return
    context = parse_json(row["context_json"], {})
    context["_flash"] = {"message": message, "tone": tone}
    db.execute(
        "UPDATE sessions SET context_json = ?, expires_at = ? WHERE id = ?",
        (json_dump(context), iso_after_hours(SESSION_HOURS), session_id),
    )
    db.commit()


def pop_flash(db: sqlite3.Connection, session_id: str) -> dict[str, str] | None:
    row = db.execute("SELECT context_json FROM sessions WHERE id = ?", (session_id,)).fetchone()
    if not row:
        return None
    context = parse_json(row["context_json"], {})
    flash = context.pop("_flash", None)
    db.execute(
        "UPDATE sessions SET context_json = ?, expires_at = ? WHERE id = ?",
        (json_dump(context), iso_after_hours(SESSION_HOURS), session_id),
    )
    db.commit()
    return flash


def generate_program_code(db: sqlite3.Connection) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    while True:
        code = "".join(secrets.choice(alphabet) for _ in range(10))
        exists = db.execute(
            "SELECT 1 FROM programs WHERE program_code = ?",
            (code,),
        ).fetchone()
        if not exists:
            return code


def generate_teacher_code(db: sqlite3.Connection) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    while True:
        code = "".join(secrets.choice(alphabet) for _ in range(8))
        exists = db.execute(
            "SELECT 1 FROM teachers WHERE access_code = ?",
            (code,),
        ).fetchone()
        if not exists:
            return code


def generate_teacher_username(db: sqlite3.Connection, name: str, *, teacher_id: int | None = None) -> str:
    base = re.sub(r"[^a-z0-9]", "", name.lower())
    if not base:
        base = "teacher"
    base = base[:10]
    if teacher_id is not None:
        candidate = f"{base}{teacher_id:03d}"[:16]
        exists = db.execute(
            "SELECT 1 FROM teachers WHERE username = ? AND id != ?",
            (candidate, teacher_id),
        ).fetchone()
        if not exists:
            return candidate
    while True:
        suffix = "".join(secrets.choice(string.digits) for _ in range(4))
        candidate = f"{base}{suffix}"[:16]
        exists = db.execute(
            "SELECT 1 FROM teachers WHERE username = ?",
            (candidate,),
        ).fetchone()
        if not exists:
            return candidate


def generate_teacher_password(teacher_id: int | None = None) -> str:
    if teacher_id is not None:
        return f"AFE!T{teacher_id:04d}"
    alphabet = string.ascii_letters + string.digits
    return "AFE!" + "".join(secrets.choice(alphabet) for _ in range(8))


def html_response(html: str, status: str = "200 OK", headers: list[tuple[str, str]] | None = None) -> Response:
    base_headers = [("Content-Type", "text/html; charset=utf-8")]
    if headers:
        base_headers.extend(headers)
    return Response(body=html.encode("utf-8"), status=status, headers=base_headers)


def redirect_response(location: str, headers: list[tuple[str, str]] | None = None) -> Response:
    base_headers = [("Location", location)]
    if headers:
        base_headers.extend(headers)
    return Response(body=b"", status="302 Found", headers=base_headers)


def text_response(text: str, status: str = "200 OK") -> Response:
    return Response(
        body=text.encode("utf-8"),
        status=status,
        headers=[("Content-Type", "text/plain; charset=utf-8")],
    )


def bytes_response(
    content: bytes,
    *,
    content_type: str,
    filename: str | None = None,
) -> Response:
    headers = [("Content-Type", content_type)]
    if filename:
        headers.append(
            (
                "Content-Disposition",
                f"attachment; filename*=UTF-8''{quote(filename)}",
            )
        )
    return Response(body=content, headers=headers)


def wants_ajax(request: Request) -> bool:
    return request.environ.get("HTTP_X_REQUESTED_WITH", "").lower() == "xmlhttprequest"


def session_cookie_header(session_id: str) -> tuple[str, str]:
    cookie = SimpleCookie()
    cookie[SESSION_COOKIE] = session_id
    cookie[SESSION_COOKIE]["path"] = "/"
    cookie[SESSION_COOKIE]["httponly"] = True
    cookie[SESSION_COOKIE]["max-age"] = str(SESSION_HOURS * 3600)
    return ("Set-Cookie", cookie.output(header="").strip())


def clear_session_cookie_header() -> tuple[str, str]:
    cookie = SimpleCookie()
    cookie[SESSION_COOKIE] = ""
    cookie[SESSION_COOKIE]["path"] = "/"
    cookie[SESSION_COOKIE]["httponly"] = True
    cookie[SESSION_COOKIE]["max-age"] = "0"
    return ("Set-Cookie", cookie.output(header="").strip())


def render_template(request: Request, template_name: str, **context: Any) -> Response:
    template = env.get_template(template_name)
    base_context = {
        "request": request,
        "flash": request.flash,
        "program_status_labels": PROGRAM_STATUS_LABELS,
        "submission_status_labels": SUBMISSION_STATUS_LABELS,
        "status_label": status_label,
        "format_datetime": format_datetime,
    }
    html = template.render(**base_context, **context)
    return html_response(html)


def require_role(request: Request, role: str) -> Response | None:
    if not request.session or request.session["role"] != role:
        if role == "admin":
            return redirect_response("/admin/login")
        return redirect_response(f"/?role={role}")
    return None


def get_current_admin(request: Request) -> sqlite3.Row | None:
    if not request.session or request.session["role"] != "admin":
        return None
    return request.db.execute(
        "SELECT * FROM admins WHERE username = ?",
        (request.session["admin_username"],),
    ).fetchone()


def get_current_teacher(request: Request) -> sqlite3.Row | None:
    if not request.session or request.session["role"] != "teacher":
        return None
    return request.db.execute(
        "SELECT * FROM teachers WHERE id = ?",
        (request.session["teacher_id"],),
    ).fetchone()


def get_program_with_teacher(db: sqlite3.Connection, program_id: int) -> sqlite3.Row | None:
    return db.execute(
        """
        SELECT
            p.*,
            t.name AS teacher_name,
            t.username AS teacher_username,
            t.university AS teacher_university,
            t.academic_info AS teacher_academic_info,
            t.access_code AS teacher_access_code,
            (
                SELECT COUNT(*) FROM submissions s
                WHERE s.program_id = p.id
            ) AS submission_count
        FROM programs p
        JOIN teachers t ON t.id = p.teacher_id
        WHERE p.id = ?
        """,
        (program_id,),
    ).fetchone()


def get_program_form_schema(program: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    raw_schema = parse_json(program["questions_json"], [])
    program_keys = set(program.keys()) if hasattr(program, "keys") else set(program)
    if "template_name" in program_keys:
        fallback_title = program["template_name"]
    elif "title" in program_keys:
        fallback_title = program["title"]
    else:
        fallback_title = ""
    return normalize_template_schema(raw_schema, fallback_title=fallback_title)


def get_program_questions(program: sqlite3.Row | dict[str, Any]) -> list[str]:
    return [field["label"] for field in get_program_form_schema(program)["flat_fields"]]


def get_submissions_for_program(db: sqlite3.Connection, program_id: int) -> list[dict[str, Any]]:
    rows = db.execute(
        """
        SELECT * FROM submissions
        WHERE program_id = ?
        ORDER BY student_number ASC, student_name ASC
        """,
        (program_id,),
    ).fetchall()
    submissions = []
    for row in rows:
        item = dict(row)
        answers = parse_json(row["answers_json"], [])
        normalized_answers = []
        for index, answer in enumerate(answers, start=1):
            if isinstance(answer, dict):
                normalized_answers.append(
                    {
                        "field_id": answer.get("field_id") or f"answer_{index - 1}",
                        "question": answer.get("question") or answer.get("label") or f"문항 {index}",
                        "answer": answer.get("answer", ""),
                        "section_title": answer.get("section_title", ""),
                    }
                )
            else:
                normalized_answers.append(
                    {
                        "field_id": f"answer_{index - 1}",
                        "question": f"문항 {index}",
                        "answer": str(answer),
                        "section_title": "",
                    }
                )
        item["answers"] = normalized_answers
        item["final_evaluation"] = final_evaluation(row)
        submissions.append(item)
    return submissions


def openai_api_key() -> str:
    return os.environ.get("OPENAI_API_KEY", "").strip() or OPENAI_EMBEDDED_API_KEY.strip()


def openai_is_configured() -> bool:
    return bool(openai_api_key())


def build_ai_example_input(program: sqlite3.Row | dict[str, Any], submission: dict[str, Any]) -> str:
    schema = get_program_form_schema(program)
    lines = [
        "다음 정보를 바탕으로 학교생활기록부용 개별 평가 문장을 작성해 주세요.",
        "",
        "[프로그램 정보]",
        f"- 프로그램명: {program['title']}",
        f"- 프로그램 유형: {program['template_name']}",
        f"- 학교: {program['school_name']}",
        f"- 교급: {program['school_level']}",
        f"- 연도/학기: {program['year']} / {program['semester']}",
        f"- 담당 강사: {program['teacher_name']}",
        "",
        "[학생 기본 정보]",
        f"- 학생명: {submission['student_name']}",
        f"- 학번: {submission['student_number']}",
        f"- 희망전공(학과): {submission['desired_major']}",
    ]
    if schema.get("report_reference"):
        lines.append(f"- 연계 보고서 양식: {schema['report_reference']}")
    lines.extend(["", "[학생 작성 답변]"])
    for answer in submission["answers"]:
        section_title = answer.get("section_title")
        if section_title:
            lines.append(f"- 섹션: {section_title}")
        lines.append(f"  질문: {answer['question']}")
        lines.append(f"  답변: {answer['answer']}")
    lines.extend(["", "위 정보만 사용해서 결과를 작성해 주세요."])
    return "\n".join(lines)


def extract_response_text(payload: dict[str, Any]) -> str:
    parts: list[str] = []
    for output in payload.get("output", []):
        for content in output.get("content", []):
            text_value = content.get("text")
            if isinstance(text_value, dict):
                text_value = text_value.get("value") or text_value.get("text")
            if text_value:
                parts.append(str(text_value))
    if parts:
        return "\n".join(part.strip() for part in parts if part.strip()).strip()
    if payload.get("output_text"):
        return str(payload["output_text"]).strip()
    return ""


def generate_ai_evaluation_example(program: sqlite3.Row | dict[str, Any], submission: dict[str, Any]) -> tuple[str, str]:
    api_key = openai_api_key()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not configured")

    model = os.environ.get("OPENAI_MODEL", "gpt-5-mini").strip() or "gpt-5-mini"
    endpoint = os.environ.get("OPENAI_RESPONSES_URL", "https://api.openai.com/v1/responses").strip()
    reasoning_effort = os.environ.get("OPENAI_REASONING_EFFORT", "low").strip() or "low"
    text_verbosity = os.environ.get("OPENAI_TEXT_VERBOSITY", "low").strip() or "low"
    max_output_tokens = int(os.environ.get("OPENAI_MAX_OUTPUT_TOKENS", "1600"))
    prompt_text = (program.get("prompt_text") if isinstance(program, dict) else program["prompt_text"]) or EVALUATION_EXAMPLE_PROMPT
    body = {
        "model": model,
        "reasoning": {"effort": reasoning_effort},
        "text": {
            "format": {"type": "text"},
            "verbosity": text_verbosity,
        },
        "input": [
            {
                "role": "developer",
                "content": [{"type": "input_text", "text": prompt_text}],
            },
            {
                "role": "user",
                "content": [{"type": "input_text", "text": build_ai_example_input(program, submission)}],
            },
        ],
        "max_output_tokens": max_output_tokens,
    }
    request = UrlRequest(
        endpoint,
        data=json_dump(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    timeout_seconds = float(os.environ.get("OPENAI_TIMEOUT_SECONDS", "60"))
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenAI API error: {detail}") from exc
    except URLError as exc:
        raise RuntimeError(f"OpenAI connection error: {exc}") from exc

    text = extract_response_text(payload)
    if not text:
        incomplete = payload.get("incomplete_details") or {}
        incomplete_reason = incomplete.get("reason")
        if incomplete_reason == "max_output_tokens":
            raise RuntimeError(
                "OpenAI 응답이 토큰 한도에서 중단되었습니다. OPENAI_MAX_OUTPUT_TOKENS 값을 더 크게 설정해 주세요."
            )
        status = payload.get("status") or "unknown"
        raise RuntimeError(f"OpenAI response did not include text output (status={status})")
    return text, model


def ensure_ai_suggestion_for_submission(
    db: sqlite3.Connection,
    program: sqlite3.Row | dict[str, Any],
    submission: dict[str, Any],
    *,
    force: bool = False,
) -> dict[str, Any]:
    existing = (submission.get("ai_suggestion") or "").strip()
    if existing and not force:
        return submission
    if not openai_is_configured():
        submission["ai_error"] = "OPENAI_API_KEY가 설정되지 않아 평가 예시를 생성할 수 없습니다."
        return submission

    try:
        suggestion, model = generate_ai_evaluation_example(program, submission)
    except Exception as exc:
        submission["ai_error"] = str(exc)
        return submission

    generated_at = now_iso()
    db.execute(
        """
        UPDATE submissions
        SET ai_suggestion = ?, ai_generated_at = ?, ai_model = ?
        WHERE id = ?
        """,
        (suggestion, generated_at, model, submission["id"]),
    )
    db.commit()
    submission["ai_suggestion"] = suggestion
    submission["ai_generated_at"] = generated_at
    submission["ai_model"] = model
    submission["ai_error"] = ""
    return submission


def admin_filters_from_request(request: Request) -> dict[str, str]:
    return {
        "year": request.query.get("year", "").strip(),
        "semester": request.query.get("semester", "").strip(),
        "school_name": request.query.get("school_name", "").strip(),
        "teacher_id": request.query.get("teacher_id", "").strip(),
        "status": request.query.get("status", "").strip(),
        "keyword": request.query.get("keyword", "").strip(),
    }


def query_teacher_assignments(db: sqlite3.Connection) -> list[sqlite3.Row]:
    return db.execute(
        """
        SELECT
            t.id AS teacher_id,
            t.name AS teacher_name,
            t.username AS teacher_username,
            t.university AS teacher_university,
            t.academic_info AS teacher_academic_info,
            p.id AS program_id,
            p.title AS program_title,
            p.year,
            p.semester,
            p.school_name,
            p.school_level,
            p.program_code,
            p.status,
            (
                SELECT COUNT(*) FROM submissions s WHERE s.program_id = p.id
            ) AS submission_count
        FROM teachers t
        LEFT JOIN programs p ON p.teacher_id = t.id
        ORDER BY t.created_at DESC, p.year DESC, p.semester DESC, p.created_at DESC
        """
    ).fetchall()


def query_programs(db: sqlite3.Connection, filters: dict[str, str]) -> list[sqlite3.Row]:
    sql = """
        SELECT
            p.*,
            t.name AS teacher_name,
            (
                SELECT COUNT(*) FROM submissions s WHERE s.program_id = p.id
            ) AS submission_count,
            (
                SELECT COUNT(*) FROM submissions s
                WHERE s.program_id = p.id
                AND TRIM(COALESCE(s.teacher_evaluation, '')) <> ''
            ) AS reviewed_count
        FROM programs p
        JOIN teachers t ON t.id = p.teacher_id
        WHERE 1 = 1
    """
    params: list[Any] = []
    if filters["year"]:
        sql += " AND p.year = ?"
        params.append(filters["year"])
    if filters["semester"]:
        sql += " AND p.semester = ?"
        params.append(filters["semester"])
    if filters["school_name"]:
        sql += " AND p.school_name LIKE ?"
        params.append(f"%{filters['school_name']}%")
    if filters["teacher_id"]:
        sql += " AND p.teacher_id = ?"
        params.append(filters["teacher_id"])
    if filters["status"]:
        sql += " AND p.status = ?"
        params.append(filters["status"])
    if filters["keyword"]:
        sql += " AND (p.title LIKE ? OR p.program_code LIKE ? OR p.template_name LIKE ?)"
        params.extend([f"%{filters['keyword']}%"] * 3)
    sql += " ORDER BY p.year DESC, p.semester DESC, p.created_at DESC"
    return db.execute(sql, params).fetchall()


def dashboard_metrics(db: sqlite3.Connection) -> dict[str, int]:
    total_programs = db.execute("SELECT COUNT(*) AS count FROM programs").fetchone()["count"]
    open_programs = db.execute(
        "SELECT COUNT(*) AS count FROM programs WHERE status = 'collecting'"
    ).fetchone()["count"]
    teacher_submitted = db.execute(
        "SELECT COUNT(*) AS count FROM programs WHERE status = 'teacher_submitted'"
    ).fetchone()["count"]
    total_submissions = db.execute(
        "SELECT COUNT(*) AS count FROM submissions"
    ).fetchone()["count"]
    return {
        "total_programs": total_programs,
        "open_programs": open_programs,
        "teacher_submitted": teacher_submitted,
        "total_submissions": total_submissions,
    }


def build_excel(programs: list[sqlite3.Row | dict[str, Any]], db: sqlite3.Connection) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "평가 결과"
    headers = [
        "학년도",
        "학기",
        "학교명",
        "교급",
        "프로그램명",
        "프로그램유형",
        "강사명",
        "프로그램코드",
        "학번",
        "이름",
        "희망전공",
        "평가 내용",
        "상태",
        "학생 제출 시각",
        "강사 수정 시각",
        "관리자 수정 시각",
    ]
    sheet.append(headers)
    for cell in sheet[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="1F4E78")
        cell.alignment = Alignment(horizontal="center", vertical="center")

    for program in programs:
        submissions = get_submissions_for_program(db, program["id"])
        if not submissions:
            sheet.append(
                [
                    program["year"],
                    program["semester"],
                    program["school_name"],
                    program["school_level"],
                    program["title"],
                    program["template_name"],
                    program["teacher_name"],
                    program["program_code"],
                    "",
                    "",
                    "",
                    "",
                    status_label(program["status"], "program"),
                    "",
                    "",
                    "",
                ]
            )
            continue

        for submission in submissions:
            sheet.append(
                [
                    program["year"],
                    program["semester"],
                    program["school_name"],
                    program["school_level"],
                    program["title"],
                    program["template_name"],
                    program["teacher_name"],
                    program["program_code"],
                    submission["student_number"],
                    submission["student_name"],
                    submission["desired_major"],
                    submission["final_evaluation"],
                    status_label(submission["status"], "submission"),
                    format_datetime(submission["student_submitted_at"]),
                    format_datetime(submission["teacher_updated_at"]),
                    format_datetime(submission["admin_updated_at"]),
                ]
            )

    widths = {
        "A": 12,
        "B": 10,
        "C": 20,
        "D": 10,
        "E": 28,
        "F": 14,
        "G": 14,
        "H": 12,
        "I": 10,
        "J": 12,
        "K": 18,
        "L": 52,
        "M": 16,
        "N": 18,
        "O": 18,
        "P": 18,
    }
    for column, width in widths.items():
        sheet.column_dimensions[column].width = width
    for row in sheet.iter_rows(min_row=2):
        for cell in row:
            cell.alignment = Alignment(vertical="top", wrap_text=True)

    info_sheet = workbook.create_sheet("사용 안내")
    info_sheet["A1"] = "AFE 캠프 산출물 관리 시스템"
    info_sheet["A2"] = "다운로드 시각"
    info_sheet["B2"] = format_datetime(now_iso())
    info_sheet["A4"] = "평가 내용은 관리자 최종 평가가 있으면 그 값을 우선 사용하고, 없으면 강사 평가를 사용합니다."
    info_sheet.column_dimensions["A"].width = 70
    info_sheet.column_dimensions["B"].width = 24

    stream = BytesIO()
    workbook.save(stream)
    return stream.getvalue()


def serve_static(path: str) -> Response:
    relative = path.removeprefix("/static/").strip("/")
    candidate = (STATIC_DIR / relative).resolve()
    if not str(candidate).startswith(str(STATIC_DIR.resolve())) or not candidate.exists():
        return text_response("Not Found", status="404 Not Found")
    content_type, _ = mimetypes.guess_type(candidate.name)
    return Response(
        body=candidate.read_bytes(),
        status="200 OK",
        headers=[("Content-Type", content_type or "application/octet-stream")],
    )


@route("GET", r"/")
def landing(request: Request) -> Response:
    active_role = request.query.get("role", "").strip()
    if not active_role and request.session and request.session["role"] in {"student", "teacher"}:
        active_role = request.session["role"]
    if not active_role:
        active_role = "student"
    if active_role not in {"student", "teacher"}:
        active_role = "student"
    error = request.query.get("error", "")
    current_teacher = get_current_teacher(request)
    current_program = None
    if request.session and request.session["role"] == "student":
        current_program = get_program_with_teacher(request.db, request.session["program_id"])
    return render_template(
        request,
        "landing.html",
        active_role=active_role,
        error=error,
        current_teacher=current_teacher,
        current_program=current_program,
    )


@route("GET", r"/admin/login")
def admin_login_page(request: Request) -> Response:
    if request.session and request.session["role"] == "admin":
        return redirect_response("/admin")
    error = request.query.get("error", "")
    return render_template(request, "admin_login.html", error=error)


@route("POST", r"/login/admin")
def login_admin(request: Request) -> Response:
    username = request.form.get("username", "").strip()
    password = request.form.get("password", "").strip()
    admin = request.db.execute(
        "SELECT * FROM admins WHERE username = ?",
        (username,),
    ).fetchone()
    if not admin or not verify_password(password, admin["password_hash"]):
        return redirect_response("/admin/login?error=관리자%20ID%20또는%20비밀번호가%20올바르지%20않습니다.")

    if request.session:
        destroy_session(request.db, request.session["id"])
    session_id = create_session(request.db, role="admin", admin_username=admin["username"])
    headers = [session_cookie_header(session_id)]
    return redirect_response("/admin", headers=headers)


@route("POST", r"/login/teacher")
def login_teacher(request: Request) -> Response:
    username = request.form.get("username", "").strip().lower()
    password = request.form.get("password", "").strip()
    teacher = request.db.execute(
        "SELECT * FROM teachers WHERE username = ?",
        (username,),
    ).fetchone()
    if not teacher or not verify_password(password, teacher["password_hash"]):
        return redirect_response("/?role=teacher&error=강사%20아이디%20또는%20비밀번호를%20확인해%20주세요.")

    if request.session:
        destroy_session(request.db, request.session["id"])
    session_id = create_session(request.db, role="teacher", teacher_id=teacher["id"])
    headers = [session_cookie_header(session_id)]
    return redirect_response("/teacher", headers=headers)


@route("POST", r"/login/student")
def login_student(request: Request) -> Response:
    program_code = re.sub(r"[^A-Za-z0-9]", "", request.form.get("program_code", "").strip()).upper()[:12]
    program = request.db.execute(
        """
        SELECT p.*, t.name AS teacher_name
        FROM programs p
        JOIN teachers t ON t.id = p.teacher_id
        WHERE p.program_code = ?
        """,
        (program_code,),
    ).fetchone()
    if not program:
        return redirect_response("/?role=student&error=유효한%20프로그램%20코드를%20입력해%20주세요.")

    if request.session:
        destroy_session(request.db, request.session["id"])
    session_id = create_session(
        request.db,
        role="student",
        program_id=program["id"],
        context={"program_code": program_code},
    )
    headers = [session_cookie_header(session_id)]
    return redirect_response("/student", headers=headers)


@route("GET", r"/logout")
def logout(request: Request) -> Response:
    if request.session:
        destroy_session(request.db, request.session["id"])
    return redirect_response("/", headers=[clear_session_cookie_header()])


@route("GET", r"/admin")
def admin_dashboard(request: Request) -> Response:
    auth = require_role(request, "admin")
    if auth:
        return auth
    admin = get_current_admin(request)
    teachers = request.db.execute("SELECT * FROM teachers ORDER BY created_at DESC").fetchall()
    teacher_assignments = query_teacher_assignments(request.db)
    template_rows = request.db.execute(
        """
        SELECT
            pt.*,
            (
                SELECT COUNT(*) FROM programs p
                WHERE p.template_id = pt.id
            ) AS usage_count
        FROM program_templates pt
        ORDER BY pt.created_at DESC
        """
    ).fetchall()
    templates = [get_template_card(row) for row in template_rows]
    filters = admin_filters_from_request(request)
    programs = query_programs(request.db, filters)
    metrics = dashboard_metrics(request.db)
    return render_template(
        request,
        "admin_dashboard.html",
        admin=admin,
        teachers=teachers,
        teacher_assignments=teacher_assignments,
        templates=templates,
        programs=programs,
        filters=filters,
        metrics=metrics,
        school_levels=SCHOOL_LEVEL_OPTIONS,
        semesters=SEMESTER_OPTIONS,
    )


@route("POST", r"/admin/teachers")
def admin_create_teacher(request: Request) -> Response:
    auth = require_role(request, "admin")
    if auth:
        return auth
    name = request.form.get("name", "").strip()
    email = request.form.get("email", "").strip()
    university = request.form.get("university", "").strip()
    username = request.form.get("username", "").strip().lower()
    raw_password = request.form.get("password", "").strip()
    memo = request.form.get("memo", "").strip()
    academic_info = request.form.get("academic_info", "").strip()
    access_code = request.form.get("access_code", "").strip().upper()
    if not name:
        set_flash(request.db, request.session["id"], "강사 이름을 입력해 주세요.", "error")
        return redirect_response("/admin")
    if not username:
        username = generate_teacher_username(request.db, name)
    if request.db.execute("SELECT 1 FROM teachers WHERE username = ?", (username,)).fetchone():
        set_flash(request.db, request.session["id"], "이미 사용 중인 강사 아이디입니다.", "error")
        return redirect_response("/admin")
    if not raw_password:
        raw_password = generate_teacher_password()
    if not access_code:
        access_code = generate_teacher_code(request.db)
    try:
        request.db.execute(
            """
            INSERT INTO teachers (
                name, email, access_code, university, username, password_hash,
                temporary_password, memo, academic_info, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                name,
                email,
                access_code,
                university,
                username,
                password_hash(raw_password),
                raw_password,
                memo,
                academic_info,
                now_iso(),
            ),
        )
        request.db.commit()
    except sqlite3.IntegrityError:
        set_flash(request.db, request.session["id"], "이미 사용 중인 강사 코드 또는 계정 정보입니다.", "error")
        return redirect_response("/admin")
    set_flash(
        request.db,
        request.session["id"],
        f"{name} 강사가 등록되었습니다. 아이디 {username} / 비밀번호 {raw_password} / 코드 {access_code}",
        "success",
    )
    return redirect_response("/admin")


@route("POST", r"/admin/templates")
def admin_create_template(request: Request) -> Response:
    auth = require_role(request, "admin")
    if auth:
        return auth
    name = request.form.get("name", "").strip()
    description = request.form.get("description", "").strip()
    prompt_text = request.form.get("prompt_text", "").strip() or EVALUATION_EXAMPLE_PROMPT
    questions = parse_questions_from_text(request.form.get("questions", ""))
    if not name or not questions:
        set_flash(request.db, request.session["id"], "프로그램 유형명과 질문 목록을 모두 입력해 주세요.", "error")
        return redirect_response("/admin")
    try:
        request.db.execute(
            """
            INSERT INTO program_templates (name, description, prompt_text, questions_json, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (name, description, prompt_text, json_dump(questions), now_iso()),
        )
        request.db.commit()
    except sqlite3.IntegrityError:
        set_flash(request.db, request.session["id"], "같은 이름의 프로그램 유형이 이미 존재합니다.", "error")
        return redirect_response("/admin")
    set_flash(request.db, request.session["id"], f"{name} 유형이 추가되었습니다.", "success")
    return redirect_response("/admin")


@route("POST", r"/admin/templates/(?P<template_id>\d+)")
def admin_update_template(request: Request, template_id: str) -> Response:
    auth = require_role(request, "admin")
    if auth:
        return auth
    name = request.form.get("name", "").strip()
    description = request.form.get("description", "").strip()
    prompt_text = request.form.get("prompt_text", "").strip() or EVALUATION_EXAMPLE_PROMPT
    questions = parse_questions_from_text(request.form.get("questions", ""))
    if not name or not questions:
        set_flash(request.db, request.session["id"], "유형명, 프롬프트, 질문 내용을 확인해 주세요.", "error")
        return redirect_response("/admin")

    exists = request.db.execute(
        "SELECT 1 FROM program_templates WHERE name = ? AND id != ?",
        (name, template_id),
    ).fetchone()
    if exists:
        set_flash(request.db, request.session["id"], "같은 이름의 프로그램 유형이 이미 존재합니다.", "error")
        return redirect_response("/admin")

    request.db.execute(
        """
        UPDATE program_templates
        SET name = ?, description = ?, prompt_text = ?, questions_json = ?
        WHERE id = ?
        """,
        (name, description, prompt_text, json_dump(questions), template_id),
    )
    request.db.commit()
    set_flash(request.db, request.session["id"], f"{name} 유형이 수정되었습니다.", "success")
    return redirect_response("/admin")


@route("POST", r"/admin/templates/(?P<template_id>\d+)/delete")
def admin_delete_template(request: Request, template_id: str) -> Response:
    auth = require_role(request, "admin")
    if auth:
        return auth
    template = request.db.execute(
        "SELECT * FROM program_templates WHERE id = ?",
        (template_id,),
    ).fetchone()
    if not template:
        set_flash(request.db, request.session["id"], "삭제할 프로그램 유형을 찾을 수 없습니다.", "error")
        return redirect_response("/admin")

    usage_count = request.db.execute(
        "SELECT COUNT(*) AS count FROM programs WHERE template_id = ?",
        (template_id,),
    ).fetchone()["count"]
    if usage_count:
        set_flash(
            request.db,
            request.session["id"],
            f"{template['name']} 유형은 현재 {usage_count}개 프로그램에서 사용 중이라 삭제할 수 없습니다.",
            "error",
        )
        return redirect_response("/admin")

    request.db.execute("DELETE FROM program_templates WHERE id = ?", (template_id,))
    request.db.commit()
    set_flash(request.db, request.session["id"], f"{template['name']} 유형이 삭제되었습니다.", "success")
    return redirect_response("/admin")


@route("POST", r"/admin/programs")
def admin_create_program(request: Request) -> Response:
    auth = require_role(request, "admin")
    if auth:
        return auth

    title = request.form.get("title", "").strip()
    school_name = request.form.get("school_name", "").strip()
    school_level = request.form.get("school_level", "").strip()
    year = request.form.get("year", "").strip()
    semester = request.form.get("semester", "").strip()
    template_id = request.form.get("template_id", "").strip()
    teacher_id = request.form.get("teacher_id", "").strip()

    if not all([title, school_name, school_level, year, semester, template_id, teacher_id]):
        set_flash(request.db, request.session["id"], "프로그램 개설 항목을 모두 입력해 주세요.", "error")
        return redirect_response("/admin")

    template = request.db.execute(
        "SELECT * FROM program_templates WHERE id = ?",
        (template_id,),
    ).fetchone()
    teacher = request.db.execute(
        "SELECT * FROM teachers WHERE id = ?",
        (teacher_id,),
    ).fetchone()
    if not template or not teacher:
        set_flash(request.db, request.session["id"], "템플릿 또는 강사 정보가 올바르지 않습니다.", "error")
        return redirect_response("/admin")

    program_code = generate_program_code(request.db)
    request.db.execute(
        """
        INSERT INTO programs (
            title, school_name, school_level, year, semester,
            template_id, template_name, template_description, prompt_text, questions_json,
            teacher_id, program_code, status, teacher_submitted_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            title,
            school_name,
            school_level,
            int(year),
            semester,
            template["id"],
            template["name"],
            template["description"],
            (template["prompt_text"] or EVALUATION_EXAMPLE_PROMPT),
            template["questions_json"],
            teacher["id"],
            program_code,
            "collecting",
            None,
            now_iso(),
        ),
    )
    request.db.commit()
    set_flash(
        request.db,
        request.session["id"],
        f"프로그램이 개설되었습니다. 학생용 프로그램 코드는 {program_code} 입니다.",
        "success",
    )
    return redirect_response("/admin")


@route("POST", r"/admin/programs/(?P<program_id>\d+)/delete")
def admin_delete_program(request: Request, program_id: str) -> Response:
    auth = require_role(request, "admin")
    if auth:
        return auth
    program = request.db.execute(
        "SELECT id, title, program_code FROM programs WHERE id = ?",
        (program_id,),
    ).fetchone()
    if not program:
        set_flash(request.db, request.session["id"], "삭제할 프로그램을 찾을 수 없습니다.", "error")
        return redirect_response("/admin")

    request.db.execute("DELETE FROM sessions WHERE program_id = ?", (program_id,))
    request.db.execute("DELETE FROM programs WHERE id = ?", (program_id,))
    request.db.commit()
    set_flash(
        request.db,
        request.session["id"],
        f"{program['title']} 프로그램 ({program['program_code']}) 이 삭제되었습니다.",
        "success",
    )
    if wants_ajax(request):
        return text_response("ok")
    return redirect_response("/admin")


@route("GET", r"/admin/programs/(?P<program_id>\d+)")
def admin_program_detail(request: Request, program_id: str) -> Response:
    auth = require_role(request, "admin")
    if auth:
        return auth
    program = get_program_with_teacher(request.db, int(program_id))
    if not program:
        return text_response("프로그램을 찾을 수 없습니다.", status="404 Not Found")
    submissions = get_submissions_for_program(request.db, int(program_id))
    question_schema = get_program_form_schema(program)
    return render_template(
        request,
        "admin_program_detail.html",
        program=program,
        questions=get_program_questions(program),
        question_schema=question_schema,
        submissions=submissions,
    )


@route("POST", r"/admin/programs/(?P<program_id>\d+)/submissions/(?P<submission_id>\d+)")
def admin_update_submission(request: Request, program_id: str, submission_id: str) -> Response:
    auth = require_role(request, "admin")
    if auth:
        return auth
    admin_feedback = request.form.get("admin_feedback", "").strip()
    request.db.execute(
        """
        UPDATE submissions
        SET admin_feedback = ?, admin_updated_at = ?, status = 'admin_updated'
        WHERE id = ? AND program_id = ?
        """,
        (admin_feedback, now_iso(), submission_id, program_id),
    )
    request.db.commit()
    set_flash(request.db, request.session["id"], "관리자 최종 평가가 저장되었습니다.", "success")
    return redirect_response(f"/admin/programs/{program_id}")


@route("POST", r"/admin/programs/(?P<program_id>\d+)/status")
def admin_update_program_status(request: Request, program_id: str) -> Response:
    auth = require_role(request, "admin")
    if auth:
        return auth
    new_status = request.form.get("status", "").strip()
    if new_status not in {"collecting", "teacher_submitted", "completed"}:
        set_flash(request.db, request.session["id"], "변경할 수 없는 상태값입니다.", "error")
        return redirect_response(f"/admin/programs/{program_id}")
    request.db.execute(
        "UPDATE programs SET status = ? WHERE id = ?",
        (new_status, program_id),
    )
    request.db.commit()
    set_flash(request.db, request.session["id"], "프로그램 상태가 변경되었습니다.", "success")
    return redirect_response(f"/admin/programs/{program_id}")


@route("GET", r"/admin/programs/(?P<program_id>\d+)/download\.xlsx")
def admin_download_program_excel(request: Request, program_id: str) -> Response:
    auth = require_role(request, "admin")
    if auth:
        return auth
    program = get_program_with_teacher(request.db, int(program_id))
    if not program:
        return text_response("프로그램을 찾을 수 없습니다.", status="404 Not Found")
    content = build_excel([program], request.db)
    filename = f"afe_program_{program['id']}.xlsx"
    return bytes_response(
        content,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=filename,
    )


@route("GET", r"/admin/download\.xlsx")
def admin_download_filtered_excel(request: Request) -> Response:
    auth = require_role(request, "admin")
    if auth:
        return auth
    filters = admin_filters_from_request(request)
    programs = query_programs(request.db, filters)
    content = build_excel(programs, request.db)
    filename = f"afe_export_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"
    return bytes_response(
        content,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=filename,
    )


@route("GET", r"/teacher")
def teacher_dashboard(request: Request) -> Response:
    auth = require_role(request, "teacher")
    if auth:
        return auth
    teacher = get_current_teacher(request)
    if not teacher:
        return redirect_response("/logout")
    programs = request.db.execute(
        """
        SELECT
            p.*,
            (
                SELECT COUNT(*) FROM submissions s WHERE s.program_id = p.id
            ) AS submission_count
        FROM programs p
        WHERE p.teacher_id = ?
        ORDER BY p.year DESC, p.semester DESC, p.created_at DESC
        """,
        (teacher["id"],),
    ).fetchall()
    metrics = {
        "assigned_programs": len(programs),
        "open_programs": len([program for program in programs if program["status"] == "collecting"]),
        "teacher_submitted": len([program for program in programs if program["status"] == "teacher_submitted"]),
        "student_submissions": sum(program["submission_count"] for program in programs),
    }
    return render_template(
        request,
        "teacher_dashboard.html",
        teacher=teacher,
        programs=programs,
        metrics=metrics,
    )


@route("GET", r"/teacher/programs/(?P<program_id>\d+)")
def teacher_program_detail(request: Request, program_id: str) -> Response:
    auth = require_role(request, "teacher")
    if auth:
        return auth
    teacher = get_current_teacher(request)
    if not teacher:
        return redirect_response("/logout")
    program = get_program_with_teacher(request.db, int(program_id))
    if not program or program["teacher_id"] != teacher["id"]:
        return text_response("접근 권한이 없습니다.", status="403 Forbidden")
    submissions = get_submissions_for_program(request.db, int(program_id))
    question_schema = get_program_form_schema(program)
    return render_template(
        request,
        "teacher_program_detail.html",
        teacher=teacher,
        program=program,
        questions=get_program_questions(program),
        question_schema=question_schema,
        submissions=submissions,
        is_locked=program["status"] in {"teacher_submitted", "completed"},
        ai_enabled=openai_is_configured(),
    )


@route("POST", r"/teacher/programs/(?P<program_id>\d+)/submissions/(?P<submission_id>\d+)/ai-suggestion")
def teacher_regenerate_ai_suggestion(request: Request, program_id: str, submission_id: str) -> Response:
    auth = require_role(request, "teacher")
    if auth:
        return auth
    teacher = get_current_teacher(request)
    if not teacher:
        return redirect_response("/logout")
    program = get_program_with_teacher(request.db, int(program_id))
    if not program or program["teacher_id"] != teacher["id"]:
        return text_response("접근 권한이 없습니다.", status="403 Forbidden")

    row = request.db.execute(
        "SELECT * FROM submissions WHERE id = ? AND program_id = ?",
        (submission_id, program_id),
    ).fetchone()
    if not row:
        set_flash(request.db, request.session["id"], "학생 제출 정보를 찾을 수 없습니다.", "error")
        return redirect_response(f"/teacher/programs/{program_id}")

    normalized_submission = get_submissions_for_program(request.db, int(program_id))
    target = next((item for item in normalized_submission if item["id"] == int(submission_id)), None)
    if not target:
        set_flash(request.db, request.session["id"], "학생 제출 정보를 찾을 수 없습니다.", "error")
        return redirect_response(f"/teacher/programs/{program_id}")

    ensure_ai_suggestion_for_submission(request.db, program, target, force=True)
    if target.get("ai_error"):
        set_flash(request.db, request.session["id"], f"평가 내용 예시 생성에 실패했습니다. {target['ai_error']}", "error")
    else:
        set_flash(request.db, request.session["id"], "평가 내용 예시를 다시 생성했습니다.", "success")
    return redirect_response(f"/teacher/programs/{program_id}")


@route("POST", r"/teacher/programs/(?P<program_id>\d+)/submissions/(?P<submission_id>\d+)")
def teacher_update_submission(request: Request, program_id: str, submission_id: str) -> Response:
    auth = require_role(request, "teacher")
    if auth:
        return auth
    teacher = get_current_teacher(request)
    if not teacher:
        return redirect_response("/logout")
    program = get_program_with_teacher(request.db, int(program_id))
    if not program or program["teacher_id"] != teacher["id"]:
        return text_response("접근 권한이 없습니다.", status="403 Forbidden")
    if program["status"] in {"teacher_submitted", "completed"}:
        set_flash(request.db, request.session["id"], "이미 제출이 완료된 프로그램은 수정할 수 없습니다.", "error")
        return redirect_response(f"/teacher/programs/{program_id}")

    teacher_summary = request.form.get("teacher_summary", "").strip()
    teacher_evaluation = request.form.get("teacher_evaluation", "").strip()
    request.db.execute(
        """
        UPDATE submissions
        SET teacher_summary = ?, teacher_evaluation = ?, teacher_updated_at = ?, status = 'reviewed'
        WHERE id = ? AND program_id = ?
        """,
        (teacher_summary, teacher_evaluation, now_iso(), submission_id, program_id),
    )
    request.db.commit()
    set_flash(request.db, request.session["id"], "학생 평가 내용이 저장되었습니다.", "success")
    return redirect_response(f"/teacher/programs/{program_id}")


@route("POST", r"/teacher/programs/(?P<program_id>\d+)/submit")
def teacher_submit_program(request: Request, program_id: str) -> Response:
    auth = require_role(request, "teacher")
    if auth:
        return auth
    teacher = get_current_teacher(request)
    if not teacher:
        return redirect_response("/logout")
    program = get_program_with_teacher(request.db, int(program_id))
    if not program or program["teacher_id"] != teacher["id"]:
        return text_response("접근 권한이 없습니다.", status="403 Forbidden")
    request.db.execute(
        """
        UPDATE programs
        SET status = 'teacher_submitted', teacher_submitted_at = ?
        WHERE id = ?
        """,
        (now_iso(), program_id),
    )
    request.db.commit()
    set_flash(request.db, request.session["id"], "강사 최종 제출이 완료되었습니다. 이제 관리자가 확인할 수 있습니다.", "success")
    return redirect_response(f"/teacher/programs/{program_id}")


@route("GET", r"/student")
def student_form(request: Request) -> Response:
    auth = require_role(request, "student")
    if auth:
        return auth
    program = get_program_with_teacher(request.db, int(request.session["program_id"]))
    question_schema = get_program_form_schema(program) if program else {"flat_fields": [], "sections": []}
    if not program:
        return redirect_response("/?role=student&error=프로그램%20정보를%20찾을%20수%20없습니다.")
    return render_template(
        request,
        "student_form.html",
        program=program,
        questions=get_program_questions(program),
        question_schema=question_schema,
        is_locked=program["status"] != "collecting",
        form_data={"student_number": "", "student_name": "", "desired_major": "", "answers": {}},
    )


@route("POST", r"/student/submit")
def student_submit(request: Request) -> Response:
    auth = require_role(request, "student")
    if auth:
        return auth
    program = get_program_with_teacher(request.db, int(request.session["program_id"]))
    question_schema = get_program_form_schema(program) if program else {"flat_fields": [], "sections": []}
    if not program:
        return redirect_response("/?role=student&error=프로그램%20정보를%20찾을%20수%20없습니다.")
    if program["status"] != "collecting":
        return render_template(
            request,
            "student_form.html",
            program=program,
            questions=get_program_questions(program),
            question_schema=question_schema,
            is_locked=True,
            error="이미 강사 제출 또는 관리자 마감이 완료된 프로그램입니다.",
            form_data={"student_number": "", "student_name": "", "desired_major": "", "answers": {}},
        )

    fields = question_schema["flat_fields"]
    student_number = request.form.get("student_number", "").strip()
    student_name = request.form.get("student_name", "").strip()
    desired_major = request.form.get("desired_major", "").strip()

    answers: list[dict[str, str]] = []
    answers_map: dict[str, str] = {}
    for index, field in enumerate(fields):
        key = field["id"]
        answer = request.form.get(key, "").strip()
        answers_map[key] = answer
        answers.append(
            {
                "field_id": key,
                "question": field["label"],
                "answer": answer,
                "section_title": field["section_title"],
            }
        )

    has_missing_required = any(
        field.get("required", True) and not answers_map.get(field["id"], "").strip()
        for field in fields
    )
    if not student_number or not student_name or not desired_major or has_missing_required:
        return render_template(
            request,
            "student_form.html",
            program=program,
            questions=get_program_questions(program),
            question_schema=question_schema,
            is_locked=False,
            error="학번, 이름, 희망전공, 질문 응답을 모두 입력해 주세요.",
            form_data={
                "student_number": student_number,
                "student_name": student_name,
                "desired_major": desired_major,
                "answers": answers_map,
            },
        )

    existing = request.db.execute(
        """
        SELECT id FROM submissions
        WHERE program_id = ? AND student_number = ?
        """,
        (program["id"], student_number),
    ).fetchone()
    saved_submission_id: int | None = None
    if existing:
        request.db.execute(
            """
            UPDATE submissions
            SET student_name = ?, desired_major = ?, answers_json = ?,
                status = 'student_submitted', student_submitted_at = ?,
                teacher_summary = '', teacher_evaluation = '', teacher_updated_at = NULL,
                ai_suggestion = '', ai_generated_at = NULL, ai_model = '',
                admin_feedback = '', admin_updated_at = NULL
            WHERE id = ?
            """,
            (
                student_name,
                desired_major,
                json_dump(answers),
                now_iso(),
                existing["id"],
            ),
        )
        saved_submission_id = int(existing["id"])
    else:
        cursor = request.db.execute(
            """
            INSERT INTO submissions (
                program_id, student_number, student_name, desired_major,
                answers_json, status, student_submitted_at,
                teacher_summary, teacher_evaluation, teacher_updated_at,
                admin_feedback, admin_updated_at
            ) VALUES (?, ?, ?, ?, ?, 'student_submitted', ?, '', '', NULL, '', NULL)
            """,
            (
                program["id"],
                student_number,
                student_name,
                desired_major,
                json_dump(answers),
                now_iso(),
            ),
        )
        saved_submission_id = int(cursor.lastrowid)
    request.db.commit()
    saved_submission = None
    if saved_submission_id and openai_is_configured():
        normalized_submission = get_submissions_for_program(request.db, int(program["id"]))
        saved_submission = next((item for item in normalized_submission if item["id"] == saved_submission_id), None)
        if saved_submission:
            ensure_ai_suggestion_for_submission(request.db, program, saved_submission, force=True)
    elif saved_submission_id:
        normalized_submission = get_submissions_for_program(request.db, int(program["id"]))
        saved_submission = next((item for item in normalized_submission if item["id"] == saved_submission_id), None)

    return render_template(
        request,
        "student_submitted.html",
        program=program,
        submission=saved_submission,
    )


@route("GET", r"/health")
def health(_: Request) -> Response:
    return text_response("ok")


def application(environ: dict[str, Any], start_response):
    init_db()
    db = connect_db()
    request = Request(environ, db)
    try:
        if request.path.startswith("/static/"):
            response = serve_static(request.path)
        else:
            response = None
            for method, pattern, handler in ROUTES:
                if method != request.method:
                    continue
                match = pattern.match(request.path)
                if match:
                    response = handler(request, **match.groupdict())
                    break
            if response is None:
                response = text_response("페이지를 찾을 수 없습니다.", status="404 Not Found")
    except Exception as exc:
        response = html_response(
            f"""
            <html lang="ko">
              <head><meta charset="utf-8"><title>오류</title></head>
              <body style="font-family: sans-serif; padding: 32px;">
                <h1>처리 중 오류가 발생했습니다.</h1>
                <pre>{str(exc)}</pre>
                <p><a href="/">첫 페이지로 돌아가기</a></p>
              </body>
            </html>
            """,
            status="500 Internal Server Error",
        )
    finally:
        db.close()

    status, headers, body = response.as_wsgi()
    start_response(status, headers)
    return body


def main() -> None:
    init_db()
    host = "127.0.0.1"
    port = int(os.environ.get("PORT", "8000"))
    print(f"AFE 서버 실행 중: http://{host}:{port}")
    with make_server(host, port, application) as server:
        server.serve_forever()


if __name__ == "__main__":
    main()
