# D1 영속화 설계

상태: 단계 1~4 완료 (스키마·시드, 변환·차이 계산, API, 화면 동기화) · 단계 5 일부(포커스·60초 증분 조회) 포함 · 단계 6 (첨부파일) 미착수 · 작성일: 2026-10-09

## 1. 문제

워크벤치의 모든 데이터는 브라우저 `localStorage`(`im-delivery-schedule-v2`) 한 곳에만 저장된다.

- 사람마다, PC마다 데이터가 다르다. 팀이 같은 납기·NCR·현금흐름을 볼 수 없다.
- 브라우저 데이터 삭제, 시크릿 창, PC 교체 시 데이터가 사라진다.
- 누가 언제 무엇을 바꿨는지 기록이 없다.

목표: 데이터를 Cloudflare D1(서버 SQLite)에 저장해 팀이 하나의 데이터를 공유하고, 변경 이력을 남긴다.

범위 밖: 실시간 협업 편집, 권한 세분화(역할별 읽기/쓰기).

## 2. 핵심 결정: 기존 저장 경계에서 "차이 동기화"

리팩터링 후 영속화는 두 함수에만 모여 있다.

```
hooks/useWorkspaceState.ts
  마운트 시  loadWorkspace(localStorage)  -> 상태 9개 목록 복원
  변경 시    saveWorkspace(localStorage, snapshot)
```

화면의 핸들러 약 45개는 모두 `setDeliveryList(...)` 처럼 **목록 전체를 바꾸는** 방식이다. 이 핸들러를 엔티티별 API 호출로 전부 다시 쓰는 대신, 저장 경계에서 다음을 한다.

1. 마지막으로 서버와 맞춘 스냅샷(`synced`)을 기억한다.
2. 상태가 바뀌면 800ms 디바운스 후 `diffWorkspace(synced, current)` 로 컬렉션별 `upserts`(추가·수정 행)와 `deletes`(삭제 id)를 계산한다.
3. 차이만 `POST /api/workspace/sync` 로 보낸다. 서버는 정규화된 테이블에 한 트랜잭션(`db.batch`)으로 반영한다.

장점: UI 코드 변경 최소, 서버는 정규화된 테이블(보고·조회 가능), 순수 함수 `diffWorkspace` 는 단위 테스트로 검증 가능.

검토 후 버린 대안:

| 대안 | 버린 이유 |
|---|---|
| 스냅샷 JSON 한 덩어리를 D1에 저장 | 가장 쉽지만 두 사람이 동시에 저장하면 한쪽 변경이 통째로 사라짐. SQL 조회·보고 불가 |
| 엔티티별 REST CRUD + 핸들러 전면 재작성 | 정석이지만 핸들러 45개·컴포넌트 14개 수정. 이번 목적 대비 비용 큼. 차이 동기화로 시작한 뒤 필요한 화면부터 점진 전환 가능 |

## 3. 데이터 모델

공통 컬럼 (모든 테이블):

| 컬럼 | 타입 | 용도 |
|---|---|---|
| `id` | TEXT PK | 기존 클라이언트 id 그대로 사용 (`project-1700`, `D-...`) |
| `version` | INTEGER | 행 수정마다 +1. 동시 수정 충돌 감지 |
| `updated_at` | TEXT (ISO) | 증분 조회 기준 |
| `updated_by` | TEXT | 수정자 이메일 (SIWC 헤더) |
| `deleted_at` | TEXT NULL | 소프트 삭제. 다른 사용자에게 삭제를 전파하기 위해 필요 |

날짜·주차 값은 지금처럼 `YYYY-MM-DD` 문자열(TEXT). boolean 은 INTEGER(0/1, Drizzle `mode: "boolean"`). 금액은 센트 INTEGER(`money` 컬럼 타입), 수량은 REAL.

`project_id` 에는 인덱스만 두고 외래키 제약은 걸지 않는다. 클라이언트 import 데이터에 아직 없는 프로젝트를 가리키는 행이 있을 수 있고, 동기화 batch 안의 행 순서에 따라 실패하지 않게 하기 위함이다. 참조 검증은 sync API 에서 한다.

| 테이블 | 원본 타입 | 비고 |
|---|---|---|
| `projects` | `Project` | |
| `deliveries` | `Delivery` | 인덱스 `(project_id)`, `(po)` |
| `bom_items` | `BomItem` | `source` = purchasing / internal |
| `purchase_po_lines` | `PurchasePoLine` | PO 상세 엑셀 import 결과. 인덱스 `(project_id, po)` |
| `supplier_plans` | `SupplierSchedulePlan` | 메일 본문·체크 상태. `attachments` 는 JSON TEXT |
| `supplier_plan_batches` | `SupplierScheduleBatch` | `plan_id` FK. 파일명 목록은 JSON TEXT |
| `supplier_material_allocations` | `SupplierMaterialAllocation` | PK `(plan_id, po_line_id, batch_id)` |
| `supplier_ncrs` | `SupplierNcr` | |
| `internal_ncrs` | `InternalNcr` | |
| `ecn_records` | `EcnRecord` | |
| `todo_items` | `TodoItem` | |
| `files` | – | R2 에 저장한 첨부파일 메타데이터 (`owner_type`, `owner_id`, `kind`, `r2_key`, 파일명, 크기, 업로더) |
| `change_log` | – | 아래 4.4 참고 |

공급사 계획은 **집합체(aggregate)** 로 다룬다. 계획 하나를 upsert 하면 같은 batch 안에서 그 계획의 batch·allocation 행을 지우고 다시 넣는다. 클라이언트가 계획을 통째로 바꾸는 현재 코드와 맞는다.

중복 저장 필드 `SupplierNcr.projectName`, `PurchasePoLine.projectCode/projectName` 은 v1 에서는 그대로 저장한다(import 원본 보존). 프로젝트명 변경 시 어긋날 수 있으므로 v2 에서 조인으로 대체.


실제 스키마: [`db/schema.ts`](../db/schema.ts). 컬럼명은 Drizzle `casing: "snake_case"` 로 자동 변환된다.

행 ↔ 도메인 타입 변환은 `lib/db-mappers.ts` 에 컬렉션별 `toRow` / `fromRow` 로 두고 왕복 테스트를 붙인다.

## 4. API

모든 라우트는 `app/api/workspace/**/route.ts`, `export const dynamic = "force-dynamic"`.

### 4.1 인증·권한

- `requireUser()` : `getChatGPTUser()` (`app/chatgpt-auth.ts`) 로 이메일 확인, 없으면 401.
- SIWC 는 신원만 증명하고 소속을 증명하지 않는다. 접근 제한은 **Sites 호스팅 접근 정책(워크스페이스 한정)** 으로 걸고, 추가로 `ALLOWED_EMAIL_DOMAINS` 환경변수(예: 회사 도메인) 검사를 둔다. → 결정 필요 (7장)

### 4.2 `GET /api/workspace?since=<ISO>`

- `since` 없으면 전체 스냅샷(삭제 제외), 있으면 그 이후 바뀐 행 + 삭제된 id.
- 응답: `{ success, data: { snapshot, deletedIds, serverTime }, error }`
- 규모: 프로젝트 수십, 납품 수백~수천 행 수준이라 전체 조회도 부담 없음.

### 4.3 `POST /api/workspace/sync`

요청:

```json
{
  "changes": {
    "deliveries": {
      "upserts": [{ "id": "D-1", "baseVersion": 3, "...": "..." }],
      "deletes": [{ "id": "D-9", "baseVersion": 2 }]
    }
  }
}
```

처리:

1. 컬렉션 이름·필드를 스키마로 검증 (zod). 모르는 컬렉션/필드는 400.
2. 각 행의 `baseVersion` 과 서버 `version` 비교.
   - 같거나 신규 행: 반영, `version + 1`, `updated_*` 기록.
   - 다름: **충돌**. 반영하지 않고 서버의 현재 행을 응답에 담는다.
3. 반영분 + `change_log` 를 하나의 `db.batch([...])` 로 실행(원자적).
4. 응답: `{ applied: { [collection]: [{id, version}] }, conflicts: { [collection]: Row[] }, serverTime }`

D1 은 한 쿼리당 바인딩 파라미터 수에 제한이 있으므로 여러 행을 한 INSERT 로 묶지 않고 행마다 한 문장으로 batch 에 넣는다. 대량 import(BOM·PO 엑셀)는 클라이언트가 요청을 일정 행 수 단위로 나눠 보낸다.

### 4.4 변경 이력 `change_log`

`(id, collection, row_id, action[upsert|delete], changed_by, changed_at, before_json, after_json)`. NCR·예산·납기 변경 추적용. 화면은 범위 밖, 데이터만 먼저 쌓는다.

### 4.5 구현 메모 (단계 3)

- 코드: `server/validation.ts`(요청 검증), `server/workspace-service.ts`(조회·반영), `server/workspace-handlers.ts`(HTTP), 라우트 `app/api/workspace/route.ts`, `app/api/workspace/sync/route.ts`.
- 행마다 **선행 조건**(새 행: 해당 id 없음 / 기존 행: 버전 일치)을 SQL 로 걸어, 변경 이력·공급사 계획 자식 행·본 행 쓰기를 같은 조건에서만 실행한다. 읽은 뒤 batch 전에 다른 요청이 끼어들어도 쓰기는 반영되지 않고 충돌로 보고되며 이력도 남지 않는다.
- `since` 조회는 60초를 겹쳐 다시 보낸다(요청 처리 시각과 커밋 시각 차이 보정). 클라이언트는 id 기준으로 병합하므로 중복은 무해하다.
- 제한: 요청당 행 200개, 본문 1MB, 공급사 계획당 배치·배분 각 200개, 파일명 목록 50개.
- 참조 검증(예: 납품의 `projectId` 가 실제 프로젝트인지)은 v1 에서 하지 않는다. 기존 브라우저 데이터에 고아 행이 있으면 저장 자체가 막히기 때문. 단계 4 가져오기 때 실태를 보고 결정.
- drizzle-orm 0.45 의 `db.batch` 는 파라미터가 있는 `db.run(sql)` 을 처리하지 못해, D1 `batch` 에 직접 바인딩한다(`runBatch`).

## 5. 클라이언트

`hooks/useWorkspaceState.ts` 의 두 effect 를 `useWorkspaceSync` 로 교체한다. 나머지 훅·컴포넌트는 그대로.

```
mount
  -> GET /api/workspace         -> 상태 9개 세팅, synced = snapshot
  (실패 시 localStorage 캐시로 표시 + "오프라인" 상태)

state change
  -> debounce 800ms
  -> diff = diffWorkspace(synced, current)   // lib/sync.ts, 순수 함수
  -> POST /api/workspace/sync
       성공: synced 갱신, 반환 version 반영
       충돌: 서버 행으로 교체 + "다른 사용자가 먼저 수정함" 알림
       실패: 재시도(지수 백오프), 대기 중 변경은 localStorage 에 보관

window focus / 60초마다
  -> GET /api/workspace?since=lastServerTime -> 병합
```

- 헤더에 저장 상태 칩: `저장됨 / 저장 중 / 오프라인 / 충돌`.
- `localStorage` 는 "진실의 원천"에서 "오프라인 캐시 + 미전송 변경 큐"로 역할이 바뀐다.
- 충돌 처리는 v1 에서 **서버 우선(행 단위)**. 같은 행을 동시에 고치는 일은 드물고, 다른 행 수정은 서로 덮어쓰지 않는다.

### 5.1 구현 메모 (단계 4)

- 코드: `lib/sync-client.ts`(병합·결과 반영, 순수 함수), `lib/sync-engine.ts`(`SyncEngine`: 연결·저장·재시도·조회, React 비의존), `hooks/useWorkspaceSync.ts`(엔진을 화면 상태에 연결), `components/workbench/sync-status.tsx`(상태 칩·알림).
- 브라우저 저장: 화면 데이터 캐시(`im-delivery-schedule-v2`) + 동기화 메타(`im-workspace-sync-v1`: 서버 확인본, 행 버전, 마지막 serverTime). 새로고침해도 미전송 변경이 유지되고 다음 연결 때 전송된다.
- 저장 중에 또 저장을 요청하면 진행 중 저장이 끝난 뒤 한 번 더 돌아 그 사이 변경까지 보낸다. 서버가 거부(400)한 변경은 자동 재시도하지 않고 오류로 표시한다(무한 재시도 방지). 연결 실패는 30초 후 재시도.
- 로그인 정보가 없으면(401) "This device only" 로 표시하고 브라우저에만 저장한다.
- 테스트: `tests/integration/sync-engine.test.ts` 가 실제 API 처리기와 로컬 D1 로 브라우저 두 개를 흉내 내 동시 수정·삭제 전파·오프라인·새로고침·가져오기를 검증한다.

## 6. 기존 데이터 이전

현재 데이터는 각자의 브라우저에 흩어져 있다.

1. 브라우저가 처음 서버에 연결될 때 이 브라우저 데이터 중 서버와 다른 행이 있으면, 원본을 `im-delivery-schedule-v2-pre-sync-backup` 에 백업하고 "Add to shared workspace" 버튼을 보여준다(서버에는 데모 시드가 있으므로 "서버가 비어 있을 때" 조건은 쓰지 않는다). 자동 업로드는 하지 않는다(결정 3 보류).
2. 가져오기 = 로컬 스냅샷 전체를 `upserts` 로 보내는 sync 요청. id 기준 upsert 라 여러 사람이 가져와도 중복 행이 생기지 않는다. 같은 id 를 서로 다르게 고친 경우 나중 사람 것이 충돌로 보고된다.
3. 시드 데이터(`lib/seed-data.ts`)는 초기 마이그레이션에서 **프로젝트 목록만** 넣는다. Panther Grove 데모 납품·BOM 은 넣지 않는다. → 결정 필요

## 7. 결정 사항 (2026-10-09 확정)

| # | 질문 | 결정 | 반영 |
|---|---|---|---|
| 1 | 누가 편집할 수 있나? | 워크스페이스 전원 편집 가능 | 역할 구분 없음. 접근은 Sites 접근 정책으로 제한, 모든 변경에 `updated_by` 기록 |
| 2 | 데모 데이터 시드 | 프로젝트 + 데모 납품 + BOM 모두 시드 | `drizzle/` 시드 마이그레이션(`INSERT OR IGNORE`) |
| 3 | 기준 브라우저 데이터 | 추후 결정 | 6장 가져오기 기능은 단계 4에서 구현, 운영 절차는 보류 |
| 4 | 금액 | 소수점 둘째 자리까지 | DB 는 **센트 정수(INTEGER)** 로 저장해 반올림 오차 없이 정확히 2자리 보장. Drizzle `money` 컬럼 타입이 달러↔센트 변환. 화면 `formatMoney` 도 2자리 표시 |
| 5 | 첨부파일 | 실제 파일 저장 | R2 바인딩 `FILES` + `files` 메타데이터 테이블. 업로드/다운로드 API 는 단계 6 |

## 8. 구현 단계

| 단계 | 작업 | 검증 |
|---|---|---|
| 1 | `.openai/hosting.json` 에 `"d1": "DB"`, `"r2": "FILES"`, `db/schema.ts` 작성, `npm run db:generate` 로 마이그레이션 생성, 데모 시드 마이그레이션 | 로컬 Miniflare D1 에서 마이그레이션 적용 |
| 2 | `lib/db-mappers.ts`, `lib/sync.ts`(`diffWorkspace`) | 단위 테스트: 왕복 변환, diff(추가/수정/삭제/무변경/중첩 계획) |
| 3 | `GET`·`POST sync` 라우트, 인증, zod 검증, 충돌 처리, `change_log` | 로컬 D1 대상 통합 테스트: 정상 반영, 충돌, 401/400, 원자성 |
| 4 | `useWorkspaceSync`, 저장 상태 칩, 오프라인 큐, 로컬 데이터 가져오기 | 브라우저 2개로 동시 편집 E2E (Playwright) |
| 5 | 증분 조회(`since`), 포커스 시 새로고침 | E2E: A 수정 → B 화면 반영 |
| 6 | 첨부파일 R2 업로드/다운로드 API, 공급사 계획·배치 화면 연결 | 통합 테스트: 업로드 → 메타데이터 → 다운로드, 크기·형식 제한 |

단계 1~3 은 화면 변화 없이 배포 가능하다. 단계 4 부터 사용자에게 보인다.

## 9. 위험

| 위험 | 대응 |
|---|---|
| 큰 엑셀 import 시 요청이 커짐 | 클라이언트에서 청크 분할, 진행률 표시 |
| 디바운스 중 탭을 닫아 변경 유실 | 미전송 변경을 localStorage 큐에 먼저 기록, `pagehide` 에서 `sendBeacon` |
| 차이 계산 비용 | 컬렉션별 참조 비교 후 바뀐 컬렉션만 행 비교. 현재 규모(수천 행)에서는 문제 없음 |
| 스키마 변경 시 클라이언트 캐시 불일치 | 스냅샷에 `schemaVersion`, 다르면 캐시 폐기 후 서버에서 다시 받기 |
