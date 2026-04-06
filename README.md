# AFE 캠프 산출물 관리 시스템

학생, 강사, 관리자가 한 웹앱 안에서 산출물 작성, 평가, 최종 취합, Excel 다운로드까지 진행할 수 있는 Python 기반 MVP입니다.

## 실행 방법

1. 작업 폴더로 이동합니다.
2. 아래 명령으로 서버를 실행합니다.

```powershell
py app.py
```

3. 브라우저에서 아래 주소로 접속합니다.

```text
http://127.0.0.1:8000
```

### GPT 평가 예시 기능 사용

강사 화면의 `평가 내용 예시`는 `OPENAI_API_KEY` 환경변수가 설정되어 있어야 동작합니다.
보안과 안정성을 위해 키를 코드나 저장소에 넣지 말고, 로컬 또는 Render 환경변수로만 설정해 주세요.

```powershell
$env:OPENAI_API_KEY="sk-..."
$env:OPENAI_MODEL="gpt-5-mini"
py app.py
```

Render에서는 서비스 설정의 `Environment`에 아래 값을 추가하면 됩니다.

- `OPENAI_API_KEY`: 발급받은 실제 API 키
- `OPENAI_MODEL`: `gpt-5-mini`

선택 사항

- `OPENAI_MODEL`: 기본값은 `gpt-5-mini`
- `OPENAI_RESPONSES_URL`: 기본값은 `https://api.openai.com/v1/responses`
- `OPENAI_TIMEOUT_SECONDS`: 기본값은 `60`
- `OPENAI_REASONING_EFFORT`: 기본값은 `low`
- `OPENAI_TEXT_VERBOSITY`: 기본값은 `low`
- `OPENAI_MAX_OUTPUT_TOKENS`: 기본값은 `1600`

## 초기 테스트 계정

- 관리자 ID: `admin`
- 관리자 PW: `afe1234!`
- 관리자 전용 로그인 경로: `/admin/login`
- 샘플 강사 아이디: `teacher001`
- 샘플 강사 비밀번호: `AFE!T0001`
- 샘플 학생용 프로그램 코드: `20261001`

## 구현된 기능

- 첫 화면 역할 분기
  - 관리자: `/admin/login` 별도 진입
  - 강사: 아이디 / 비밀번호 로그인
  - 학생: 프로그램 코드 로그인
- 관리자
  - 강사 등록
  - 강사 아이디 / 비밀번호 / 메모 / 신분 정보 관리
  - 프로그램 유형 추가
  - 프로그램 유형 프롬프트 수정
  - 프로그램 개설
  - 결과물 관리 목록 필터링
  - 학생 제출 상세 열람
  - 관리자 최종 평가 수정
  - 개별 / 전체 Excel 다운로드
- 학생
  - 코드로 프로그램 진입
  - 학번, 이름, 희망전공 입력
  - 프로그램별 동적 질문지 작성
  - 재제출 시 동일 학번 기준 업데이트
  - 제출 완료 페이지 제공
- 강사
  - 배정 프로그램 목록 확인
  - 학생 제출 목록 열람
  - 학생별 평가 저장
  - 프로그램 최종 제출

## 주요 파일

- `app.py`: 서버, 라우팅, DB 초기화, 세션, Excel 다운로드
- `templates/`: 화면 템플릿
- `static/`: 공통 스타일과 스크립트
- `data/afe.db`: 실행 시 생성되는 SQLite 데이터베이스

## 배포 메모

이 앱은 Python 서버가 필요하므로 Netlify 단독 배포보다는 Render, Railway, Fly.io 같은 백엔드 호스팅이 더 적합합니다.
현재 구조는 `Render Web Service + persistent disk(SQLite)` 또는 `PostgreSQL`로 확장하기 좋게 잡혀 있습니다.

### 빠른 배포 추천

- 가장 쉬운 방법: Render Web Service
- 배포 설정 파일: `render.yaml`
- 자세한 순서: `DEPLOY_RENDER.md`

현재 구조는 정적 사이트가 아니라 서버형 앱이라서, Netlify 단독 배포보다는 Render가 더 잘 맞습니다.
