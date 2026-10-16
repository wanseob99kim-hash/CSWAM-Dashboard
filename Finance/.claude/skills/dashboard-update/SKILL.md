---
name: dashboard-update
description: CSWAM Finance 대시보드 월간 업데이트 — Raw data 폴더의 Closing Pkg / Rolling FCST / Cost Analysis / FBL1N vendor 파일로 dashboard_data.xlsx 를 만들고 점검 후 업로드. "대시보드 업데이트", "feeding 해줘", "이번 달 데이터 올려줘", "dashboard update" 요청 시 사용.
---

# CSWAM Finance 대시보드 월간 업데이트

사용자는 한 달에 한 번 `Raw data/` 에 원본 파일을 넣고 업데이트를 요청한다. 모든 응답은 한국어.

## 폴더 규칙 (Finance 폴더 기준)

| 폴더 | 파일 | 비고 |
|---|---|---|
| `Raw data/Financials/` | `CSWAM New Monthly Closing Pkg_YYYY.MM.xlsx` | 1-4, 1-5 시트. 모든 파일 읽고 같은 월은 최신 파일이 우선 |
| `Raw data/Forecast/` | `CSWAM Rolling FCST N+M.xlsx` | N 가장 큰 파일 자동 선택 (동률이면 `_rev` 붙은 쪽) |
| `Raw data/Projects/` | `Cost Analysis based on Project_YYYY.MM.xlsx` | PIVOT 시트 |
| `Raw data/Vendor/` | FBL1N 말일자 다운로드 (아무 이름) | 가장 최근 수정 파일 사용. 헤더 빈 칼럼(아이콘) 자동 삭제. 폴더 비어있으면 `vendor.xlsx` 사용 |
| `Raw data/PFE/` | `ZMM009 Invoice Verification ….xlsx` (이름에 ZMM009) | AMPC 탭 원본. 없으면 경고만 (선택 항목) |
| `Raw data/Sales Pipeline/` | `CSAM_Pipeline….xlsx` (이름에 Pipeline) | Pipeline vs SAP 탭 원본. 이 폴더만 봄, 여러 개면 최근 수정 파일. 없으면 경고만 |
| `Raw data/Vendor/` | `GL Line item.XLSX` (이름이 GL로 시작) | Vendor 분류. 업체 송장 문서번호로 GL 비용계정 조회 → GL Name. GR/IR·가격차이·Clearing·대차대조표 계정은 제외, 비용계정 금액이 50% 이상일 때만 사용. 못 찾으면 규칙(OTA 105477=Logistics, 106088=Customs Duty) → 알려진 분류 → 자재유형. 없으면 경고만 |

**Sales Pipeline vs SAP 탭 (2026-10-14)**: Sales Pipeline 파일(`Raw data/Sales Pipeline/`, 이름에 Pipeline)의 `MPP Invocing` 시트 섹션당 값(Rev K USD/Sec ×1000, ASP+Handling: Plate=Steel, Flange, Internal, Door Frame) ↔ 최신 Closing Pkg `1-7` 시트 프로젝트별 합계 ÷ QTY. Door Frame = SAP Aluminum. 이름 자동 매칭(연도·사이즈 제거, 유사도 0.85), Buffalo Gap은 100T+2T 합산, `2026 GE 114m Forecast`→`4Q25 114M G920`(코드 PROJECT_OVERRIDES), 'Forecast' 줄은 제외. SGRE 프로젝트는 포함 (2026-10-14 사용자 확정, AMPC 탭의 SGRE 제외와 별개).
대시보드 표에도 Paint·Material Total 칼럼 있음(Material Total은 화면에서 합산). 엑셀 보고서(USD, Paint·Material Total 포함): `python -m feeding.pipeline_report` → `Pipeline_vs_SAP_YYYY.MM.xlsx`. Paint = Paint/Sec + Zinc Wire/Sec + Paint_Zinc Handling/Sec ↔ SAP Paint. Material Total = Steel + Flange + Internal + Door Frame + Paint (Pipeline의 Material Total/Sec는 Welding Bracket·물류 포함이라 안 씀).

**AMPC "PFE Ratio by Project" 표 로직 (2026-10-14 사용자 확정, 사용자 엑셀 피벗과 소수점까지 일치 확인)**
- 대상 프로젝트·순서: ZMM009 파일 `PIVOT…` 시트 요약표의 `Project Name` 열 (Grand Total 전까지). 없으면 `Relevant Projects…` 시트의 프로젝트.
- 금액: `2025`·`2026` 시트(연도 이름 시트 전부)의 Amount LC.
- 구분: 전표 업체 코드 ↔ `PFE Vendor List` 시트. 목록에 없는 업체는 제외.
- Total = Non-PFE + PFE, PFE (Ratio) = PFE ÷ Total, SAP 프로젝트별 한 줄 + Grand Total.
- 대상 프로젝트를 바꾸려면 사용자가 엑셀 PIVOT 시트를 바꾸면 됨 (코드 수정 불필요).

Forecast 폴더의 **모든 버전 파일**에서 연간 Total을 모아 P&L 탭의 "버전별 연간 전망" 그래프를 만든다 (실행 2분 정도 추가).

각 폴더 아래 같은 이름 하위폴더(`Financials/Financials/`)도 인식한다.

## 절차

1. **점검** (파일 안 만듦) — Finance 폴더에서:
   ```bash
   PYTHONIOENCODING=utf-8 python -m feeding
   ```
2. **결과 해석해서 사용자에게 보고**
   - `== 오류 ==` 있으면 중단. 어떤 파일이 빠졌거나 형식이 틀렸는지 구체적으로 알려주고 끝.
   - `== 경고 ==` 는 의미를 설명 (예: Forecast 버전이 실적보다 오래됨 → 새 FCST 없으면 정상, Vendor 최종 전기일이 FS 최신 월보다 이전 → FBL1N 새로 받았는지 확인).
   - 이번에 새로 들어온 월 / 사용된 Forecast 버전 / Vendor 기준일을 한 줄씩 요약.
   - 금액을 대량으로 출력하지 말 것 (재무 데이터). 필요하면 특정 항목만.
3. **업로드 확인** — 업로드는 외부(대시보드)에 반영되므로 반드시 사용자에게 "업로드할까요?" 확인 받은 뒤 진행.
4. **업로드**:
   ```bash
   PYTHONIOENCODING=utf-8 python -m feeding --upload
   ```
   - 이전 `dashboard_data.xlsx` 는 `_history/` 에 자동 백업됨.
   - `환경변수 CSWAM_DASH_SECRET 가 없음` → 사용자에게 PowerShell 에서 `setx CSWAM_DASH_SECRET "<업로드 키>"` 실행 후 VS Code 재시작하라고 안내. 키 값을 대화에 적지 말라고 할 것.
   - 업로드 없이 파일만 필요하면 `--write`.
5. **마무리 안내** — 대시보드가 60초 내 갱신됨. 확인 포인트: 상태바 Vendor 건수 0 아님, 월 드롭다운 최신 월, Forecast 제목 버전, Projects "Data as of".

## 파싱 로직 수정이 필요할 때

- 코드: `feeding/` (closing.py, forecast.py, projects.py, vendor.py, build.py)
- 테스트: `python -m pytest tests -q` — 실제 Raw data 정합성 테스트 포함 (자산 = 부채 + 자본, Labor > 0 등). 수정 후 반드시 통과 확인.
- 대시보드 화면 쪽 파서는 `index.html` 의 `parseMergedFile` / `parseVendorFile` / `renderForecastFromRaw`.
