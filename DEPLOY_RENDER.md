# Render 배포 가이드

이 프로젝트는 Python 서버가 필요한 구조이므로 `Netlify 단독` 배포보다는 `Render Web Service`가 적합합니다.

## 왜 Netlify가 아닌가

- 현재 앱은 `app.py`가 직접 요청을 처리하는 서버형 구조입니다.
- Netlify Functions 공식 문서는 Functions가 `Node.js` 런타임에서 동작한다고 안내합니다.
- 따라서 지금 구조를 그대로 올리려면 Render 같은 Python 서버 호스팅이 더 자연스럽습니다.

## 권장 배포 방식

- 플랫폼: Render
- 서비스 타입: Web Service
- 런타임: Python
- 실행 방식: `gunicorn app:application`
- 데이터 저장: SQLite + Render persistent disk

## 이미 준비된 파일

- `render.yaml`
- `.python-version`
- `requirements.txt`

## 배포 순서

1. 이 폴더를 GitHub 새 저장소로 업로드합니다.
2. Render에 로그인합니다.
3. `New +` > `Blueprint`를 선택합니다.
4. GitHub 저장소를 연결합니다.
5. `render.yaml`을 읽어 서비스 생성을 진행합니다.
6. 배포가 끝나면 `https://...onrender.com` 주소가 발급됩니다.

## GitHub 업로드 예시 명령

```powershell
git init
git add .
git commit -m "Initial AFE camp deploy"
git branch -M main
git remote add origin https://github.com/<계정명>/<저장소명>.git
git push -u origin main
```

## 현재 render.yaml 설정

- `plan: starter`
- `healthCheckPath: /health`
- `disk` 1GB 연결
- `buildCommand: pip install -r requirements.txt`
- `startCommand: gunicorn app:application --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 120`

## 주의

- 현재 설정은 SQLite 데이터를 유지하기 위해 `persistent disk`를 사용합니다.
- 디스크를 유지하려면 Render의 유료 웹서비스 플랜이 필요할 수 있습니다.
- 아주 짧은 UI 데모만 필요하면 disk 설정 없이 임시 배포도 가능하지만, 데이터가 사라질 수 있습니다.

## 추천

- 개발 의뢰자에게 시연할 목적이면 현재 `render.yaml` 그대로 배포하는 것이 가장 안전합니다.
- 실제 운영 단계에서는 PostgreSQL로 전환하는 편이 더 안정적입니다.
