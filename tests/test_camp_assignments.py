"""Isolated regression tests. Run: python -m unittest discover -s tests -v."""

import io
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import urlencode

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app


class CampAssignmentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        for target, value in (
            ("DB_PATH", Path(self.temp.name) / "test.db"),
            ("DATA_DIR", Path(self.temp.name)),
            ("APP_READY", True),
        ):
            patcher = patch.object(app, target, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        env = patch.dict(os.environ, {"DATABASE_URL": "", "SUPABASE_DB_URL": "", "OPENAI_API_KEY": ""})
        env.start()
        self.addCleanup(env.stop)
        app.init_db(skip_bootstrap=True)
        with app.connect_db() as db:
            db.execute(
                "INSERT INTO admins (username,password_hash,display_name,created_at) VALUES (?,?,?,?)",
                ("preview", app.password_hash("preview-only"), "미리보기 관리자", app.now_iso()),
            )
            for index in range(1, 4):
                db.execute(
                    "INSERT INTO teachers (id,name,username,access_code,university,created_at) VALUES (?,?,?,?,?,?)",
                    (index, f"테스트 강사 {index}", f"teacher{index}", f"TEST000{index}", "테스트대학교", app.now_iso()),
                )
            db.execute(
                """INSERT INTO programs
                (id,title,school_name,school_level,year,semester,template_name,questions_json,teacher_id,program_code,created_at)
                VALUES (1,?,?,?,?,?,?,?,?,?,?)""",
                ("2026 융합 탐구 캠프", "테스트고등학교", "고등학교", 2026, "2학기", "실험 탐구",
                 app.json_dump(app.PDF_TEMPLATE_PRESETS[0]), 1, "TEST2026", app.now_iso()),
            )
            db.execute("INSERT INTO program_teachers VALUES (1,1,?)", ("original-assignment",))
            db.execute(
                """INSERT INTO submissions
                (program_id,student_number,student_name,desired_major,answers_json,student_submitted_at,teacher_evaluation)
                VALUES (1,'30101','테스트 학생','컴퓨터공학','[]',?,'KEEP evaluation')""", (app.now_iso(),)
            )
            db.execute(
                """INSERT INTO student_drafts
                (program_id,student_name,student_number,answers_json,created_at,updated_at)
                VALUES (1,'테스트 학생','30101','{}',?,?)""", (app.now_iso(), app.now_iso())
            )
            self.admin_session = app.create_session(db, role="admin", admin_username="preview")
            self.student_session = app.create_session(db, role="student", program_id=1)

    def request(self, path, data=None, session=None, query="", method=None):
        body = urlencode(data or {}).encode()
        environ = {
            "REQUEST_METHOD": method or ("POST" if data is not None else "GET"),
            "PATH_INFO": path, "QUERY_STRING": query,
            "CONTENT_LENGTH": str(len(body)), "wsgi.input": io.BytesIO(body),
            "HTTP_COOKIE": f"{app.SESSION_COOKIE}={session or ''}",
        }
        result = {}
        def start(status, headers):
            result.update(status=status, headers=dict(headers))
        result["body"] = b"".join(app.application(environ, start)).decode()
        return result

    def update(self, ids, previous="1", program_id=1):
        return self.request(
            f"/admin/programs/{program_id}/teachers",
            {"teacher_ids": ids, "previous_teacher_ids": previous}, self.admin_session,
        )

    def assignments(self):
        with app.connect_db() as db:
            return [row["teacher_id"] for row in db.execute(
                "SELECT teacher_id FROM program_teachers WHERE program_id=1 ORDER BY teacher_id"
            ).fetchall()]

    def test_add_and_remove_preserves_camp_and_student_data(self):
        result = self.update("1,2,3")
        self.assertEqual(result["headers"]["Location"], "/admin?panel=camp-list")
        self.assertEqual(self.assignments(), [1, 2, 3])
        self.update("1,3", "1,2,3")
        self.assertEqual(self.assignments(), [1, 3])
        with app.connect_db() as db:
            self.assertEqual(db.execute("SELECT program_code FROM programs").fetchone()["program_code"], "TEST2026")
            self.assertEqual(db.execute("SELECT teacher_evaluation FROM submissions").fetchone()["teacher_evaluation"], "KEEP evaluation")
            self.assertEqual(db.execute("SELECT COUNT(*) AS n FROM student_drafts").fetchone()["n"], 1)
            self.assertEqual(db.execute("SELECT COUNT(*) AS n FROM teachers").fetchone()["n"], 3)
            self.assertEqual(db.execute("SELECT assigned_at FROM program_teachers WHERE teacher_id=1").fetchone()["assigned_at"], "original-assignment")

    def test_replace_last_teacher_without_recreating_camp(self):
        self.update("2")
        self.assertEqual(self.assignments(), [2])
        with app.connect_db() as db:
            self.assertEqual(db.execute("SELECT teacher_id FROM programs").fetchone()["teacher_id"], 2)
            self.assertFalse(app.teacher_has_program_access(db, 1, 1))
            self.assertTrue(app.teacher_has_program_access(db, 2, 1))

    def test_empty_and_invalid_selection_cannot_remove_assignments(self):
        for ids in ("", "1,999", "0", "abc", "1,,2"):
            with self.subTest(ids=ids):
                self.assertTrue(self.update(ids)["status"].startswith("302"))
                self.assertEqual(self.assignments(), [1])

    def test_stale_dialog_rejected(self):
        self.update("1,2")
        self.update("3", "1")
        self.assertEqual(self.assignments(), [1, 2])

    def test_duplicate_ids_and_missing_camp(self):
        self.update("1,1,2")
        self.assertEqual(self.assignments(), [1, 2])
        self.assertTrue(self.update("3", program_id=999)["status"].startswith("302"))
        self.assertEqual(self.assignments(), [1, 2])

    def test_requires_admin(self):
        for session in (None, self.student_session):
            result = self.request("/admin/programs/1/teachers", {"teacher_ids": "2", "previous_teacher_ids": "1"}, session)
            self.assertEqual(result["headers"]["Location"], "/admin/login")
            self.assertEqual(self.assignments(), [1])

    def test_list_renders_editor_with_no_passwords(self):
        result = self.request("/admin", session=self.admin_session, query="panel=camp-list")
        self.assertEqual(result["status"], "200 OK")
        self.assertIn('data-camp-teachers-open', result["body"])
        self.assertIn('data-teacher-ids="1"', result["body"])
        self.assertNotIn("password_hash", result["body"])
        self.assertNotIn("preview-only", result["body"])

    def test_partial_student_selection_can_be_saved_and_restored(self):
        self.request("/student/start", {
            "student_name": "미리보기 학생", "student_number": "30202", "desired_major": "컴퓨터공학"
        }, self.student_session)
        page = self.request("/student", session=self.student_session)
        self.assertIn('formnovalidate', page["body"])
        result = self.request("/student/draft", {
            "linked_subject_1": "통합사회1", "linked_unit_1": "문화와 다양성 - 문화 상대주의",
            "career_goal": "컴퓨터/데이터", "career_major": "컴퓨터공학",
        }, self.student_session)
        self.assertEqual(result["headers"]["Location"], "/student")
        restored = self.request("/student", session=self.student_session)
        self.assertIn("통합사회1", restored["body"])
        self.assertIn("문화와 다양성 - 문화 상대주의", restored["body"])

    def test_teacher_list_uses_four_reads_and_no_session_writes(self):
        queries = []
        original_execute = app.DBConnection.execute
        def track(db, sql, params=()):
            queries.append(sql.strip())
            return original_execute(db, sql, params)
        with patch.object(app.DBConnection, "execute", track):
            result = self.request("/admin", session=self.admin_session, query="panel=teacher-list")
        self.assertEqual(result["status"], "200 OK")
        self.assertEqual(len(queries), 4, queries)
        self.assertTrue(all(sql.startswith("SELECT") for sql in queries), queries)
        self.assertIn("teacher-management-table", result["body"])
        self.assertIn('scope="col">강사 삭제', result["body"])

    def test_assets_health_and_reference_data_do_not_connect_to_database(self):
        with patch.object(app, "connect_db", side_effect=AssertionError("Unexpected DB request")), \
             patch.object(app, "ensure_runtime_ready", side_effect=AssertionError("Unexpected initialization")), \
             patch.object(app, "fetch_reference_api_payload", return_value={"data": []}):
            for path in ("/static/app.css", "/static/app.js", "/health", "/references/curricula"):
                with self.subTest(path=path):
                    result = self.request(path, session=self.admin_session)
                    self.assertEqual(result["status"], "200 OK")
            self.assertEqual(self.request("/health", method="HEAD")["body"], "")
            self.assertEqual(self.request("/static/app.css", method="HEAD")["body"], "")
            self.assertEqual(self.request("/static/../app.py")["status"], "404 Not Found")

    def test_flash_survives_assets_references_and_redirects(self):
        with app.connect_db() as db:
            app.set_flash(db, self.admin_session, "배정이 변경되었습니다.", "success")
        self.request("/static/app.css", session=self.admin_session)
        self.request("/health", session=self.admin_session)
        with patch.object(app, "fetch_reference_api_payload", return_value={"data": []}):
            self.request("/references/curricula", session=self.admin_session)
        self.request("/admin/login", session=self.admin_session)
        page = self.request("/admin", session=self.admin_session, query="panel=teacher-list")
        self.assertIn("배정이 변경되었습니다.", page["body"])
        next_page = self.request("/admin", session=self.admin_session, query="panel=teacher-list")
        self.assertNotIn("배정이 변경되었습니다.", next_page["body"])

    def test_session_renewal_preserves_context_and_revocation_is_immediate(self):
        old_expiry = (app.now() + app.timedelta(hours=11)).isoformat()
        with app.connect_db() as db:
            db.execute("UPDATE sessions SET expires_at=?, context_json=? WHERE id=?",
                       (old_expiry, '{"keep":"value"}', self.admin_session))
        self.request("/admin", session=self.admin_session, query="panel=teacher-list")
        with app.connect_db() as db:
            renewed = db.execute("SELECT * FROM sessions WHERE id=?", (self.admin_session,)).fetchone()
            self.assertGreater(renewed["expires_at"], old_expiry)
            self.assertEqual(app.parse_json(renewed["context_json"], {}), {"keep": "value"})
            app.destroy_session(db, self.admin_session)
        denied = self.request("/admin", session=self.admin_session, query="panel=teacher-list")
        self.assertEqual(denied["headers"]["Location"], "/admin/login")

    def test_expired_session_is_not_renewed(self):
        with app.connect_db() as db:
            db.execute("UPDATE sessions SET expires_at=? WHERE id=?",
                       ((app.now() - app.timedelta(minutes=1)).isoformat(), self.admin_session))
        result = self.request("/admin", session=self.admin_session, query="panel=teacher-list")
        self.assertEqual(result["headers"]["Location"], "/admin/login")

    def test_prompt_manager_still_loads_current_prompt(self):
        with app.connect_db() as db:
            app.set_meta_value(db, "teacher_generation_prompt", "현재 프롬프트 테스트")
        page = self.request("/admin", session=self.admin_session, query="panel=prompt-manage")
        self.assertEqual(page["status"], "200 OK")
        self.assertIn("현재 프롬프트 테스트", page["body"])


if __name__ == "__main__":
    if "--serve" in sys.argv:
        # Disposable localhost fixture; never connects to the deployed database.
        fixture = CampAssignmentTests()
        fixture.setUp()
        try:
            with app.make_server("127.0.0.1", 8765, app.application) as server:
                print("Isolated preview: http://127.0.0.1:8765", flush=True)
                server.serve_forever()
        finally:
            fixture.doCleanups()
    else:
        unittest.main()
