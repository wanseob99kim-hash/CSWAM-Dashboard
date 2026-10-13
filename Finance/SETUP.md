# Financial Dashboard — Cloudflare Pages 배포 설정 가이드

한 번만 하면 이후엔 VBA 매크로 클릭 한 번으로 자동 업로드.

---

## 사전 준비물

- [x] Git for Windows → https://git-scm.com/download/win
- [x] GitHub 계정 → https://github.com (무료)
- [x] Cloudflare 계정 (이미 있음)

---

## Step 1 — Git 설치 확인

PowerShell을 열고:
```
git --version
```
버전이 나오면 OK. 없으면 https://git-scm.com 에서 설치.

---

## Step 2 — GitHub에 Private Repository 만들기

1. https://github.com/new 접속
2. Repository name: `financial-dashboard` (원하는 이름)
3. **Private** 선택 ← 중요 (재무 데이터 보호)
4. "Create repository" 클릭
5. 생성된 repo URL 복사 (예: `https://github.com/yourname/financial-dashboard.git`)

---

## Step 3 — 로컬 폴더를 Git Repo로 초기화

PowerShell에서 (경로 맞게 수정):
```powershell
cd "D:\Users\4201218\Cowork\Financial Dashboard"

git init
git branch -M main
git remote add origin https://github.com/yourname/financial-dashboard.git

# .gitignore 만들기 (임시 파일 제외)
"~$*" | Out-File -Encoding utf8 .gitignore
"*.tmp" | Out-File -Encoding utf8 -Append .gitignore
"Thumbs.db" | Out-File -Encoding utf8 -Append .gitignore

# 첫 커밋 & 푸시
git add .
git commit -m "Initial dashboard setup"
git push -u origin main
```

GitHub 로그인 창이 뜨면 계정 정보 입력.

---

## Step 4 — Cloudflare Pages에 연결

1. https://dash.cloudflare.com 로그인
2. **Workers & Pages** → **Pages** → **Create a project**
3. **Connect to Git** 클릭
4. GitHub 계정 연결 → `financial-dashboard` repo 선택
5. 설정:
   - **Production branch**: `main`
   - **Build command**: (빈칸으로)
   - **Build output directory**: `/` (루트)
6. **Save and Deploy** 클릭

배포 완료되면 URL 생성됨 (예: `https://financial-dashboard-abc.pages.dev`)

---

## Step 5 — deploy.ps1 설정

`deploy.ps1`의 경로가 맞는지 확인:
```powershell
# deploy.ps1 안의 이 줄이 맞는지 체크
$DashboardDir = "D:\Users\4201218\Cowork\Financial Dashboard"
```

---

## Step 6 — VBA 매크로 설정

1. 기존 VBA 매크로가 들어있는 Excel 파일 열기
2. **Alt+F11** → VBA 편집기
3. **삽입(Insert) → 모듈(Module)**
4. `DeployDashboard.bas` 내용 전체 붙여넣기
5. 기존 매크로 마지막에 추가:

```vba
' 예시: 기존 매크로에서 처리 후 대시보드 업로드
Sub 월마감_처리()
    ' ... 기존 처리 코드 ...
    
    ' 처리 완료 후 대시보드 배포
    Call DeployDashboard( _
        closingPkgSourcePath:="D:\Raw\CSWAM New Monthly Closing Pkg_2026.07.xlsx", _
        forecastSourcePath:="D:\Raw\CSWAM Rolling FCST 7+5.xlsx" _
    )
End Sub
```

또는 파일을 직접 Financials/ Forecast/ 폴더에 복사한 뒤에:
```vba
Call PushDashboard()   ' 복사는 이미 했고, GitHub push만 실행
```

---

## 이후 워크플로우 (매월)

```
원시 Excel 수신
     ↓
기존 VBA 매크로 실행  (처리/가공)
     ↓
DeployDashboard() 호출  (자동)
     ↓
GitHub push  →  Cloudflare Pages 30초 내 배포
     ↓
대시보드 URL 최신 데이터 표시  ✅
```

---

## 폴더 구조 (GitHub repo)

```
Financial Dashboard/
├── index.html              ← 대시보드
├── deploy.ps1              ← 배포 스크립트
├── .gitignore
├── Financials/
│   ├── CSWAM New Monthly Closing Pkg_2026.07.xlsx
│   ├── CSWAM New Monthly Closing Pkg_2026.06.xlsx
│   └── ...
├── Forecast/
│   └── CSWAM Rolling FCST 7+5.xlsx
├── vendor.xlsx             (있으면)
└── project.xlsx            (있으면)
```

---

## 문제 해결

| 증상 | 원인 | 해결 |
|------|------|------|
| `git push` 실패 | GitHub 인증 오류 | `git credential-manager` 재설정 |
| Cloudflare 배포 안 됨 | Branch 이름 불일치 | Pages 설정에서 `main` vs `master` 확인 |
| 대시보드 파일 안 보임 | 파일 경로 오타 | `Financials/` 폴더명 대소문자 정확히 |
| PowerShell 실행 막힘 | 회사 정책 | IT팀에 ExecutionPolicy 예외 요청 |
