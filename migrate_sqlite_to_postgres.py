import os
import sqlite3
from pathlib import Path

import app


TABLES = [
    "admins",
    "teachers",
    "program_templates",
    "programs",
    "program_teachers",
    "submissions",
    "sessions",
    "app_meta",
]

IDENTITY_TABLES = [
    "admins",
    "teachers",
    "program_templates",
    "programs",
    "submissions",
]


def sqlite_rows(sqlite_path: Path, table_name: str) -> list[sqlite3.Row]:
    with sqlite3.connect(sqlite_path) as conn:
        conn.row_factory = sqlite3.Row
        return conn.execute(f"SELECT * FROM {table_name}").fetchall()


def reset_target_tables(target: app.DBConnection) -> None:
    for table_name in reversed(TABLES):
        target.execute(f"TRUNCATE TABLE {table_name} RESTART IDENTITY CASCADE")


def copy_table(target: app.DBConnection, table_name: str, rows: list[sqlite3.Row]) -> None:
    if not rows:
        return
    columns = list(rows[0].keys())
    column_list = ", ".join(columns)
    placeholders = ", ".join("?" for _ in columns)
    override = " OVERRIDING SYSTEM VALUE" if "id" in columns else ""
    sql = (
        f"INSERT INTO {table_name} ({column_list}){override} "
        f"VALUES ({placeholders}) ON CONFLICT DO NOTHING"
    )
    for row in rows:
        target.execute(sql, tuple(row[column] for column in columns))


def reset_sequences(target: app.DBConnection) -> None:
    for table_name in IDENTITY_TABLES:
        target.execute(
            f"""
            SELECT setval(
                pg_get_serial_sequence('{table_name}', 'id'),
                COALESCE((SELECT MAX(id) FROM {table_name}), 1),
                EXISTS (SELECT 1 FROM {table_name})
            )
            """
        )


def main() -> None:
    database_url = app.configured_database_url()
    if not database_url:
        raise SystemExit("DATABASE_URL 또는 SUPABASE_DB_URL을 먼저 설정해 주세요.")

    sqlite_path = Path(os.environ.get("SQLITE_PATH", str(app.DB_PATH))).resolve()
    if not sqlite_path.exists():
        raise SystemExit(f"SQLite 파일을 찾을 수 없습니다: {sqlite_path}")

    force_reset = os.environ.get("FORCE_RESET", "").strip() == "1"

    app.init_db(skip_bootstrap=True)
    with app.connect_db() as target:
        if target.dialect != "postgres":
            raise SystemExit("대상 DB가 Postgres가 아닙니다. DATABASE_URL을 다시 확인해 주세요.")

        if force_reset:
            reset_target_tables(target)
        else:
            existing = any(
                target.execute(f"SELECT 1 FROM {table_name} LIMIT 1").fetchone()
                for table_name in TABLES
            )
            if existing:
                raise SystemExit(
                    "대상 Postgres DB에 이미 데이터가 있습니다. 기존 데이터를 지우고 다시 옮기려면 FORCE_RESET=1 로 실행해 주세요."
                )

        for table_name in TABLES:
            rows = sqlite_rows(sqlite_path, table_name)
            copy_table(target, table_name, rows)

        reset_sequences(target)
        target.commit()

    print("SQLite -> Postgres 마이그레이션이 완료되었습니다.")
    print(f"원본 SQLite: {sqlite_path}")
    print("대상 DB: DATABASE_URL / SUPABASE_DB_URL")


if __name__ == "__main__":
    main()
