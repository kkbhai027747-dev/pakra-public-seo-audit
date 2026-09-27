# Public SEO audit

Standalone project: `pakra-public-seo-audit`. Public, read-only audit utility with offline synthetic tests.

Source: [pakra-cards-system](https://github.com/sreylekcheat-coder/pakra-cards-system), commit `00879b2821c7dce87cb1d44d1d81c0b40e08cea2`, directory `tools/public-seo-audit`, extracted on 2026-09-27. Run the commands below from this repository's root. `SOURCE-MANIFEST.json` retains earlier historical provenance; its old paths are not current file dependencies. This repository split does not deploy the project or replace an existing running task.

中文：本目录按独立项目维护，以下命令从本仓库根目录运行。来源为上述提交及子目录；历史来源清单保留用于追溯。分仓不代表已经部署、连接真实账号或替换原本运行的任务。


## English

### Purpose and status

A small, read-only Node.js tool that samples public storefront pages, `robots.txt`, the sitemap index and a bounded number of child sitemaps. It records page titles, metadata, canonical links, headings, selected links and JSON-LD summaries. It never uses the Shopify Admin API and needs no credentials.

This project refactors the existing JavaScript audit into a portable tool. It is **ready for review with offline synthetic tests**; no live website was fetched during this handoff. The source snapshot came from the 2026-09-20 local audit. Previous reports and their findings are not current-site evidence and are deliberately excluded.

### Files and entry points

| File / function | Responsibility |
| --- | --- |
| `src/audit.mjs` → `runAudit(config, dependencies)` | Read configured public paths and sampled child sitemaps; return a report without writing files. |
| `normalizeConfig()` | Validate public HTTPS origin, paths, concurrency, timeouts and optional features. |
| `parsePage()` | Parse a supplied HTML, robots or sitemap string without network access. |
| `attributes()`, `cleanText()`, `structuredNodes()` | Small parsing helpers; structured nodes omit traversal into review and author records. |
| `fetchPage()` | Anonymous GET request with timeout; retain HTTP status, headers, errors and parsed evidence. |
| `fetchPageSpeed()` | Optional Google PageSpeed Insights request; never called by default. |
| Direct CLI invocation | Read a config, run the audit and write one new report; refuse to overwrite an existing file. |
| `config/example.json` | Public example origin and page paths; replace with approved public storefront samples. |
| `tests/audit.test.mjs` | No-network parsing, import, sampling, error and PageSpeed tests. |
| `SOURCE-MANIFEST.json` | Original source SHA-256 and explicit refactoring record. |

Importing the module does not fetch anything, create directories or write a report. `runAudit` accepts `fetchImpl` and `now` so reviewers can test it with deterministic synthetic responses.

### Run tests

Use Node.js 20 or newer. There are no external dependencies or installation step.

```sh
npm test
```

Verified on **2026-09-22** with Node.js 24.19.0: **8 offline tests pass** for import isolation, HTML metadata and JSON-LD, robots/sitemap extraction, encoded/localized private-path rejection, capped/deduplicated sitemap sampling, request and redirect failures, concurrency, and optional PageSpeed responses. All fetch calls in tests are injected doubles; tests never contact a store or Google.

### Run an approved public audit

1. Copy `config/example.json` to `config/local.json` (ignored by Git).
2. Set `baseUrl` to the public HTTPS origin only, without a path, credentials or query. Set `paths` to the specific public pages approved for sampling. Do not supply authenticated URLs, tokens, customer records or private endpoints.
3. Leave `pageSpeed` set to `false` unless sending the site URL to Google's PageSpeed service is wanted. This optional unauthenticated service can return quota errors or missing field data; errors are recorded without breaking page sampling.
4. Run the command below only when public network access for the target has been authorized. It creates a local report; it does not modify the site.

```sh
node src/audit.mjs --config config/local.json --output output/public-seo-report.json
```

Use a new output filename for each run. The CLI refuses to overwrite files. Reports and local configuration are ignored by Git; share reviewed summaries intentionally instead of committing raw HTML/data archives.

### Configuration and report behavior

- `concurrency`: parallel page requests, 1–8; default 4. Child sitemap requests use at most 3 at a time.
- `maxChildSitemaps`: 0–50; default 10. Only one level of child sitemaps is sampled; it does not crawl every product listed inside them.
- `timeoutMs`: per-page timeout, 100–120000 ms; default 35000.
- `contentChecks`: named literal strings to look for in HTML. The example preserves the original Moon 11 and format-copy checks; change/remove them for other pages. Results now live under `page.contentChecks`, rather than the original two top-level flags.
- `pageSpeed`: default `false`. When enabled, request mobile performance data for the homepage. Lab score, metric display values and available field data are retained; the PSI timeout is 45000 ms.
- Requested pages and child sitemaps must be on the configured HTTPS origin. Account, admin, order, cart and checkout paths are rejected after URL decoding, including an optional language prefix such as `/zh-CN/`. Cross-origin sitemap entries are recorded as skipped. Page requests use GET without stored credentials and `redirect: 'error'`; redirects are recorded as request errors, and their destinations are never followed.
- The report retains original HTTP status, `X-Robots-Tag`, content type, final response URL, UTF-8 byte count, timestamps and per-request failures. `bytes` measures decoded text encoded as UTF-8, not transferred/compressed bytes.
- Site-verification meta tags are recorded only as presence booleans. JSON-LD summaries include selected types, product brand/seller and offer count, without traversing reviews or author records.

### Limits and maintenance

The parser uses small regex extractors, not a full HTML/XML parser or a browser. It inspects server-delivered markup, does not execute JavaScript, supports common entities rather than all HTML entities, and cannot establish indexing, ranking or GEO visibility. A malformed page may need manual review. All page redirects are rejected, including legitimate same-origin redirects. Review the canonical public destination separately and explicitly update the configured sample when appropriate; this tool does not diagnose redirect chains.

The refactor separates configuration, parsing, fetching and file output; removes fixed machine paths and dates; replaces opaque one-line code with named functions; fixes internal-link counting so a look-alike hostname is not treated as internal; accepts quoted/unquoted attributes and JSON-LD type arrays; caps/deduplicates sitemap requests; and makes PSI opt-in. Core evidence fields are retained. Original business/page-specific strings moved to configuration. No new framework, duplicate Python implementation, production credentials, browser session or Shopify write command is included.

When changing parsing or request behavior, add a synthetic scenario to `tests/audit.test.mjs` and run `npm test`. Refresh the source manifest's handoff hash/notes when publishing a new snapshot; keep the original source hash for traceability.

## 中文

### 用途与状态

这是一个小型、只读的 Node.js 工具，用来抽样读取公开店铺页面、`robots.txt`、sitemap 索引及限定数量的子 sitemap，记录标题、元信息、canonical、标题层级、部分链接和 JSON-LD 摘要。不使用 Shopify Admin API，也不需要凭据。

本项目把现有 JavaScript 审查脚本整理成可移植工具，目前状态为**已通过离线合成测试，可供审查**；本次交付未抓取真实网站。原始源码来自 2026-09-20 本地审查。旧报告不能代表当前网站，所以没有纳入本项目。

### 文件与函数入口

| 文件 / 函数 | 职责 |
| --- | --- |
| `src/audit.mjs` → `runAudit(config, dependencies)` | 读取配置的公开路径和抽样子 sitemap，返回报告，不写文件。 |
| `normalizeConfig()` | 校验公开 HTTPS 域名、路径、并发、超时和可选功能。 |
| `parsePage()` | 纯解析传入的 HTML、robots 或 sitemap 文本，不联网。 |
| `attributes()`、`cleanText()`、`structuredNodes()` | 小型解析辅助函数；结构化节点不遍历评论及作者记录。 |
| `fetchPage()` | 带超时的匿名 GET，保留 HTTP 状态、响应头、错误和解析证据。 |
| `fetchPageSpeed()` | 可选 Google PageSpeed Insights 请求，默认不调用。 |
| 直接 CLI 入口 | 读配置、执行审查并新建一份报告，拒绝覆盖已有文件。 |
| `config/example.json` | 示例域名和公开页面路径，应改为已获准抽样的公开页面。 |
| `tests/audit.test.mjs` | 不联网的解析、导入、抽样、失败和 PageSpeed 测试。 |
| `SOURCE-MANIFEST.json` | 原始源码 SHA-256 及明确的整理记录。 |

导入模块不会抓取页面、创建目录或写报告。`runAudit` 可以注入 `fetchImpl` 和 `now`，方便用固定的合成响应测试。

### 运行测试

使用 Node.js 20 或更高版本，无外部依赖，无需安装。

```sh
npm test
```

**2026-09-22** 在 Node.js 24.19.0 上 **8 项离线测试通过**：模块导入隔离、HTML 元信息和 JSON-LD、robots/sitemap 提取、编码及语言前缀私人路径拒绝、子 sitemap 限量去重、请求及跳转失败、并发及可选 PageSpeed 响应。测试中的 fetch 全部使用模拟实现，不访问店铺或 Google。

### 执行已获准的公开审查

1. 将 `config/example.json` 复制为 `config/local.json`，后者已被 Git 忽略。
2. `baseUrl` 仅填写公开 HTTPS 域名，不能带路径、凭据或查询参数；`paths` 填写批准抽样的具体公开页面。不要填认证链接、token、顾客记录或私人端点。
3. 除非确实需要把网站地址发送给 Google PageSpeed 服务，否则保持 `pageSpeed: false`。该可选匿名服务可能返回配额错误或缺少实测数据；错误会记录，不影响页面抽样。
4. 仅在目标公开联网读取已获授权后执行以下命令。命令新建本地报告，不修改网站。

```sh
node src/audit.mjs --config config/local.json --output output/public-seo-report.json
```

每次使用新的输出文件名，CLI 拒绝覆盖已有文件。报告和私人配置不进入 Git，应主动审查和分享摘要，而不是提交原始 HTML 或数据归档。

### 配置与报告行为

- `concurrency`：页面并发数 1–8，默认 4；子 sitemap 最多并发 3。
- `maxChildSitemaps`：范围 0–50，默认 10；只抽样一层子 sitemap，不逐个抓取其中列出的商品。
- `timeoutMs`：单个页面超时 100–120000 毫秒，默认 35000。
- `contentChecks`：在 HTML 中查找的命名字符串。示例保留原 Moon 11 和规格选择文案检查，可按项目修改或删除；结果改为 `page.contentChecks`，不再是旧脚本的两个顶层布尔字段。
- `pageSpeed`：默认 `false`。启用后获取首页手机性能，保留实验室分数、指标展示值和可用实测数据；PSI 超时 45000 毫秒。
- 指定页面和子 sitemap 必须属于配置的 HTTPS 域名；URL 解码后拒绝账号、管理、订单、购物车和结账路径，也覆盖 `/zh-CN/` 等可选语言前缀。跨域 sitemap 条目记为跳过。页面请求使用 GET、不带存储凭据，并设置 `redirect: 'error'`；跳转记录为请求错误，不继续请求跳转目的地址。
- 报告保留 HTTP 状态、`X-Robots-Tag`、内容类型、最终响应地址、UTF-8 字节数、时间和请求错误。`bytes` 指解码文本重新编码为 UTF-8 的大小，不是实际压缩传输量。
- 网站验证 meta 只记是否存在，不保留验证值。JSON-LD 摘要保留选定类型、商品品牌/卖家及 offer 数，不遍历评论或作者记录。

### 限制与维护

解析器是小型正则提取器，不是完整 HTML/XML 解析器或浏览器。只检查服务器返回的文本，不运行页面 JavaScript；支持常见实体，不涵盖全部 HTML 实体；不能证明搜索收录、排名或 GEO 可见性。异常页面需人工复核。全部页面跳转都被拒绝，包括正常的同域跳转。应另行核对规范公开地址，再明确更新抽样配置；本工具不诊断跳转链。

本次整理分离配置、解析、抓取和文件输出；去掉固定机器路径和日期；用命名函数替代难读的单行代码；修正相似域名被误算为站内链接的问题；支持带引号/不带引号属性及 JSON-LD 类型数组；限制并去重 sitemap 请求；将 PSI 改为主动开启。主要证据字段保留，具体页面文案改为配置。未新增框架、重复 Python 实现、生产凭据、浏览器资料或 Shopify 写入命令。

修改解析或请求逻辑时，先补充 `tests/audit.test.mjs` 合成场景，再运行 `npm test`。发布新快照时更新来源清单的交付哈希和备注，原源码哈希继续保留用于追溯。
