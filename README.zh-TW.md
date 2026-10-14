# Cadence CRM

**為小型業務團隊打造的多租戶 CRM：聯絡人、公司、商機管線、待辦與業績預測，角色權限一律在伺服器端強制。**

[English](README.md) · [架構說明](docs/ARCHITECTURE.md) · [設計取捨](docs/DECISIONS.md) · [安全政策](SECURITY.md)

![儀表板](docs/screenshots/dashboard.png)

## 功能

- **工作區與角色**：註冊即建立工作區，可在多個工作區之間切換；擁有者與管理員可新增成員（建立帳號並產生臨時密碼）、調整角色。`OWNER`、`ADMIN`、`MEMBER` 與唯讀的 `VIEWER` 由服務層強制執行，不只是在畫面上隱藏按鈕。
- **聯絡人**：以姓名、Email、電話、公司搜尋；依負責人、生命週期、標籤篩選；排序與分頁；詳情頁含公司、商機、互動時間軸、待辦、標籤與自訂欄位。
- **重複偵測與合併**：Email（不分大小寫）或正規化後電話相同即列為疑似重複；合併時把互動、待辦、商機、標籤搬到保留的那筆，補齊空白欄位並寫入操作紀錄。
- **公司**：清單與詳情，含旗下聯絡人、商機與彙整時間軸。
- **商機管線**：看板拖拉換階段（樂觀更新、伺服器驗證、失敗回滾並提示），另有可用鍵盤操作的「移到…」選單；清單檢視；標記成交／失單（失單必填原因）。
- **待辦**：我的待辦、逾期、今天到期、未來七天，依每位使用者的時區計算；可完成與取消完成。
- **儀表板**：各階段進行中金額、加權預測（金額 × 階段勝率）、近 90 天勝率、本月預計成交、逾期待辦、近六個月成交金額與最近動態。
- **CSV**：聯絡人匯入（欄位對應、預覽、依 Email 去重、逐列錯誤報告）；聯絡人與商機匯出（套用目前篩選，並防範試算表公式注入）。
- **設定**：管線與階段（改名、勝率、類型、排序）、標籤、自訂欄位定義（文字、數字、日期、選單、是／否，每次儲存都會驗證）、成員與角色。
- **操作紀錄**：新增、修改、刪除、合併、換階段、成員異動都有欄位層級的差異紀錄，管理員以上可查看。
- **體驗**：響應式版面、可鍵盤操作、空狀態、載入骨架、操作提示（toast）與欄位錯誤訊息。

| 商機看板                                           | 聯絡人                                        |
| -------------------------------------------------- | --------------------------------------------- |
| ![商機看板](docs/screenshots/deals-board.png)      | ![聯絡人](docs/screenshots/contacts-list.png) |
| **聯絡人詳情**                                     | **商機詳情**                                  |
| ![聯絡人詳情](docs/screenshots/contact-detail.png) | ![商機詳情](docs/screenshots/deal-detail.png) |
| **CSV 匯入**                                       | **重複合併**                                  |
| ![CSV 匯入](docs/screenshots/import.png)           | ![重複合併](docs/screenshots/duplicates.png)  |
| **管線設定**                                       |                                               |
| ![設定](docs/screenshots/settings-pipelines.png)   |                                               |

## 技術棧

| 面向 | 選擇                                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------ |
| 框架 | Next.js 16（App Router、Server Components、Server Actions）、React 19、TypeScript（strict）                        |
| 介面 | Tailwind CSS 4、以 Radix 為底的 shadcn/ui 風格元件（原始碼在 `src/components/ui`）、Recharts、dnd-kit、lucide 圖示 |
| 資料 | PostgreSQL 16、Prisma 7（`pg` driver adapter）、migration 收在 `prisma/migrations`、Zod 4 驗證                     |
| 認證 | Email＋密碼（Argon2id）、資料庫 session、`httpOnly`／`SameSite=Lax` cookie（production 加 `Secure`）               |
| 測試 | Vitest（單元＋對真實資料庫的整合測試）、Playwright（Chromium）                                                     |
| 品質 | ESLint、Prettier、`tsc --noEmit`                                                                                   |
| 交付 | 多階段 Dockerfile（Next.js standalone）、Docker Compose、GitHub Actions                                            |

## 架構

```mermaid
flowchart LR
  subgraph 用戶端
    B[瀏覽器]
  end
  subgraph Next.js 伺服器
    P[頁面／Server Components]
    A[Server Actions]
    R["Route handlers（/api）"]
    C["請求情境<br/>session → 使用者、工作區、角色"]
    S["服務層<br/>權限檢查＋以工作區限定的查詢"]
    D["領域規則<br/>階段、自訂欄位、CSV、儀表板計算"]
    L[操作紀錄寫入]
  end
  DB[(PostgreSQL 16)]

  B --> P & A & R
  P & A & R --> C --> S
  S --> D
  S --> L
  S -->|Prisma 7| DB
```

每個服務函式的第一個參數都是 `Ctx`（`userId`、`workspaceId`、`role`）：先檢查所需權限，所有查詢都以 `ctx.workspaceId` 限定；用戶端傳來的外部 id（公司、負責人、標籤、階段…）寫入前都會確認屬於同一個工作區。細節見 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 資料模型

```mermaid
erDiagram
  Workspace ||--o{ Membership : has
  User ||--o{ Membership : has
  User ||--o{ Session : has
  Workspace ||--o{ Company : owns
  Workspace ||--o{ Contact : owns
  Workspace ||--o{ Pipeline : owns
  Pipeline ||--o{ Stage : "ordered stages"
  Stage ||--o{ Deal : contains
  Company ||--o{ Contact : employs
  Company ||--o{ Deal : "buys in"
  Contact ||--o{ Deal : "primary contact"
  Contact ||--o{ Activity : timeline
  Deal ||--o{ Activity : timeline
  Contact ||--o{ Task : "follow-ups"
  Workspace ||--o{ Tag : vocabulary
  Tag ||--o{ ContactTag : ""
  Tag ||--o{ CompanyTag : ""
  Workspace ||--o{ CustomFieldDefinition : defines
  Workspace ||--o{ AuditLog : records
```

- 金額使用 `Decimal(14,2)` 並記錄三碼幣別；儀表板以工作區幣別統計，並註明排除了幾筆其他幣別的商機。
- 階段有順序、勝率與類型（`OPEN`、`WON`、`LOST`）；`closedAt` 與 `lostReason` 依類型自動處理。
- 自訂欄位的值存在各筆資料的 JSONB 欄位，每次寫入都依工作區的欄位定義驗證。
- 完整定義見 [`prisma/schema.prisma`](prisma/schema.prisma)。

## 快速開始

### Docker（一行指令）

```bash
docker compose up
```

開啟 <http://localhost:3100>（可用 `APP_PORT=8080 docker compose up` 換埠）。第一次執行會建置映像、套用 migration 並載入示範工作區。

| 角色           | Email               | 密碼           |
| -------------- | ------------------- | -------------- |
| 擁有者         | `owner@demo.local`  | `cadence-demo` |
| 成員           | `member@demo.local` | `cadence-demo` |
| 檢視者（唯讀） | `viewer@demo.local` | `cadence-demo` |

登入頁也有一鍵登入按鈕。示範帳號只在 `APP_ENV` 不是 `production` 時有效。結束並清除資料：`docker compose down -v`。

### 本機開發

需求：Node.js 22 以上（應用程式本身支援 Node 20+）、用來跑 PostgreSQL 的 Docker。

```bash
cp .env.example .env
npm ci
npm run db:up        # 開發用 PostgreSQL（54329 埠）與測試用（54330 埠）
npm run db:deploy    # 套用 migration
npm run db:seed      # 示範工作區與帳號
npm run dev          # http://localhost:3100
```

其他指令：`npm run db:migrate`（修改 schema 後建立 migration）、`npm run db:down`、`npm run format`。

## 測試

```bash
npm run lint
npm run typecheck
npm test               # 單元＋整合測試（需要 `npm run db:up` 啟動的測試資料庫）
npm run test:coverage  # 同上，附 src/server 覆蓋率
npm run build
npm run test:e2e       # 對 3101 埠的 production build 跑 Playwright
npm run screenshots    # 用示範資料重新產生 docs/screenshots
```

- **146 個 Vitest 測試**：純規則的單元測試（權限矩陣、secret guard、階段轉換、自訂欄位驗證、CSV 解析與跳脫、儀表板計算、時區），以及直接對 PostgreSQL 執行真實服務的整合測試：跨工作區隔離、四種角色、重複合併、階段規則、CSV 匯入匯出、儀表板數字、session 與成員管理。
- **`src/server` 行覆蓋率：93.6%**（`src/server/next` 這層 Next.js 轉接程式改由 Playwright 測試覆蓋）。
- **5 個 Playwright 測試**：登入 → 建聯絡人 → 建商機 → 拖到下一階段 → 儀表板預測數字變化；失單原因對話框；檢視者看不到編輯控制項且直接呼叫 API 被以 403 拒絕；未登入呼叫 API 得到 401；註冊流程。

CI 會在每次 push 執行 lint、格式檢查、型別檢查、單元、整合（PostgreSQL service）、建置、E2E 與 Docker 建置。

## 專案結構

```
prisma/                 schema、migration、示範資料 seed
src/
  app/                  路由：(auth) 登入相關、(app) CRM 頁面、api/ route handlers
  components/
    ui/                 以 Radix 為底的基礎元件（shadcn/ui 風格）
    records/            表單、時間軸、待辦、看板、篩選列
    app-shell/          側欄、工作區切換、使用者選單
  server/
    services/           以工作區限定的使用案例（聯絡人、商機、匯入…）
    domain/             純業務規則
    auth/               密碼、session、登入
    next/               請求情境、server action 與 API 包裝
    env.ts              APP_ENV 與 production secret guard
    permissions.ts      角色 → 權限矩陣
    audit.ts            操作紀錄與欄位差異
  lib/                  格式化與前端輔助
tests/integration/      Vitest 整合測試（真實 PostgreSQL）
e2e/                    Playwright 測試與截圖腳本
docs/                   架構、設計取捨、截圖
```

## 設定

| 變數           | 用途                                                                                 |
| -------------- | ------------------------------------------------------------------------------------ |
| `DATABASE_URL` | PostgreSQL 連線字串                                                                  |
| `AUTH_SECRET`  | session token 雜湊用金鑰（production 至少 32 個隨機字元）                            |
| `APP_ENV`      | `development`、`test`、`demo` 或 `production`；production 拒絕預設密鑰並停用示範帳號 |
| `APP_URL`      | 對外網址；https 時 cookie 會加上 `Secure`（production 一律加上）                     |

## Roadmap

第二版：

- 對外 REST API 與工作區 API 金鑰
- 資料異動 Webhook
- AI 助手（商機摘要、下一步建議）
- 中英雙語介面
- 線上 Demo

另外規劃：邀請與重設密碼的 Email 寄送、以 Postgres row-level security 作為第二層租戶隔離、多實例共用的登入限流、模糊搜尋用的 trigram 索引。

## 授權

[MIT](LICENSE)
