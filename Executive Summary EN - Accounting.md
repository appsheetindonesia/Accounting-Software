# Executive Summary — BukuWarung Akuntansi (English)
### One-Pager · August 2026 · Full document: `PRD Ver 3 - Accounting.md`

---

## 🎯 The Pitch
**BukuWarung Akuntansi** is a **double-entry accounting** application for Indonesian MSMEs that automates the full bookkeeping cycle: journal entries → general ledger → financial reports — as easy as writing in a notebook, in Bahasa Indonesia, mobile-first, and affordable.

**The problem:** Indonesia's ~65 million MSMEs still keep books manually or in spreadsheets — error-prone, unstructured, and slow to produce reports. Existing software (Accurate from Rp150K, Jurnal from Rp99K, Zahir from Rp175K per month) is too expensive and complex for micro-businesses. Fewer than 20% of MSMEs use any accounting software.

**The solution:** Double-entry with automatic validation (debit = credit), PSAK-compliant chart of accounts, one-click financial reports, accounting terminology in plain Bahasa Indonesia, priced from **Rp50,000/month (~US$3)**.

## 👥 Target Users
| Persona | Profile | Need |
|---------|---------|------|
| **Rina** (35) | Corner-store owner, no accounting background | Track income/expenses, know monthly profit |
| **Dimas** (28) | Freelance accountant, 5–10 clients | Multi-entity, generate client reports |
| **Budi** (40) | Startup finance manager | Real-time reports, approval workflow |

## 📦 MVP Scope (Priority P0)
- **Chart of Accounts** — PSAK SME template + customization (CRUD, hierarchy)
- **General Journal** — multi-line, auto-balance, draft → post → reverse, receipt attachments
- **General Ledger** — auto-generated from posted journals, running balance
- **Reports** — Trial Balance, Income Statement, Balance Sheet (Cash Flow in P2)
- **Fiscal Periods** — open/close periods, single active period
- **Dashboard** — balance summary, 6-month trend, alerts
- **PDF/Excel Export** — professional reports

*Next phases (P1–P2): approval workflow, multi-user roles, multi-entity, bank integration.*

## 🏆 Differentiators
| Competitor | Weakness | BukuWarung Akuntansi |
|------------|----------|----------------------|
| Accurate Online | Expensive, complex, enterprise-grade | Affordable, simple |
| Jurnal (Mekari) | Overkill for small SMEs | SME-focused, cheaper |
| BukuKas / existing BukuWarung | Not double-entry, cash basis only | **Full double-entry** |

## 📊 12-Month Business Goals
| Metric | Target |
|--------|--------|
| MAU | 5,000 users |
| Month-3 retention | >60% |
| Free-to-paid conversion | 8% |
| Time-to-first-journal | <5 minutes |
| Journal error rate | <0.5% |

**Business model (freemium):** free for 1 entity + 50 transactions/month; paid for unlimited usage.

## 🗓️ Roadmap
| Phase | Duration | Milestone |
|-------|----------|-----------|
| 1. Foundation | 4 weeks | COA, Journal, General Ledger |
| 2. Reporting | 3 weeks | Income Statement, Balance Sheet, Trial Balance, Dashboard |
| 3. Quality & Export | 2 weeks | PDF/Excel export, search, reverse, attachments |
| 4. Multi-user | 3 weeks | Roles, approval, multi-entity |
| 5. Advanced | 4 weeks | Cash Flow, bank integration |
| Closed Beta → Launch | 2 weeks | 50 beta users → Web + Android |

## ⚠️ Key Risks & Mitigation
- **Calculation errors** (high impact) → automatic validation + automated testing
- **Low adoption** → interactive onboarding, tutorials, Bahasa Indonesia
- **Financial data security** → AES-256/TLS 1.3 encryption, 6-hour backups, Indonesia-hosted servers

---

## ✅ Next Steps
1. Validate MVP scope and priorities with stakeholders
2. Finalize open questions (multi-currency, adjusting entries)
3. Kick off Phase 1: Foundation (COA, Journal, General Ledger)

---

*English version of `Executive Summary - Accounting.md`. Financial figures are identical to the Indonesian document.*
