# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.4.6] - 2026-07-16

### Fixed
- **Config parse with comment braces** — strip `//` / block comments and locate `var config = {` before JSON extraction so example braces in the web resource header no longer cause silent parse failure and defaults

## [3.4.5] - 2026-07-16

### Fixed
- **Config web resource loading** — primary load via `/WebResources/{name}` (works for form users without WebAPI read on `webresource`), WebAPI base64 fallback, name trim/`.js` strip, UTF-8-safe decode, and `[FieldAuditHistory]` console warnings on failure
- Auto-load solution default web resource `vp365_AuditHistoryConfig` when the form property is blank
- Shipped `vp365_AuditHistoryConfig.js` and README examples now use valid JSON (double-quoted keys) so `JSON.parse` succeeds

## [3.4.4] - 2026-03-17

### Added
- **Audit status messages** — clear, informative messages when audit isn't fully configured:
  - Environment auditing not enabled (org-level `isauditenabled` check)
  - Table auditing not enabled (entity metadata `IsAuditEnabled` check)
  - No fields have auditing enabled (empty audit-enabled attribute list)
  - Auditing active but no changes recorded yet (lightweight record probe)
- New service methods: `getOrgAuditEnabled()`, `getEntityAuditEnabled()`
- `AuditStatusKind` type for discriminated status handling
- Four new configurable labels in `labels` section for status messages
- Status messages also shown in Quick Peek callout and Deep Dive panel empty states
- Host field now accepts multiple field types (Text, TextArea, Multi-line, Whole Number, Yes/No)
- 20 new unit tests covering all status detection scenarios

## [3.4.2] - 2026-03-16

### Changed
- Renamed solution to `vp365_FieldAuditHistory` (consistent underscore naming)
- Cleaned up repo for public release: moved logos to `assets/`, removed old release ZIPs, added `docs/GUIDE.md`
- README rewritten - badges, updated version, removed TODO comments

### Fixed
- Version alignment across `package.json`, `ControlManifest.Input.xml`, and `Solution.xml`
- Restore field name validation - defense-in-depth check before PATCH
- Unsaved record handling - status indicator shows message instead of non-functional link

## [3.4.1] - 2026-03-16

### Added
- Custom control icon (64x64 PNG) displayed in Power Apps form editor

## [3.4.0] - 2026-03-16

### Added
- Searchable filter dropdowns - type-to-search ComboBox for field and user filters
- "Cleared" operation filter - replaces "Deleted" (field clearing is an Update, not a Delete)
- Collapsible timeline entry groups with chevron toggle and field count badge
- Smart copy - includes field name in per-field copy, author-style summary for multi-field entries
- Centralized color tokens in `utils/theme.ts`

### Changed
- `visibleOperations` default changed from `[1, 2, 3]` to `[1, 2]` - Deleted is record-level, not field-level
- Filter bar uses Fluent UI `ComboBox` with `allowFreeform` + `autoComplete` (was `Dropdown`)

### Fixed
- Version string consistency - all headers, config, and manifest aligned to 3.4.0
- OData filter sanitization - config web resource name now escapes single quotes
- Removed double-cast patterns in production code
- CSV export falls back to `fieldName` when `displayName` is missing

## [3.3.0] - 2026-03-14

### Added
- **Value Restore** - undo button per field change with confirmation dialog, PATCHes via `webAPI.updateRecord()`
  - Handles standard, lookup (`@odata.bind`), option set, and boolean fields
  - `IFieldChange` extended with `rawOldValue`, `rawNewValue`, `lookupTarget`, `fieldType`
  - State machine hook: `useRestore` (IDLE → CONFIRMING → RESTORING → SUCCESS/ERROR)
- **Copy to Clipboard** - per field change, copies formatted `old → new` text
- **Export CSV** - downloads filtered audit entries as CSV via Blob + createObjectURL
- Config flags: `features.allowRestore`, `features.allowCopy`, `features.allowExport`

### Fixed
- Icons no longer appear on create forms (entityContext guard in `usePortalInjection`)

## [3.2.0] - 2026-03-12

### Added
- Deep Dive panel - 80% sidecar with full audit timeline and client-side filters
- Filter bar - field, user, operation, and date range filters (all client-side)
- Pagination with "Load more" button
- Record-level audit view (all fields) with toggle to field-level view
- Config web resource support - JSON-based customization per table

## [3.1.0] - 2026-03-11

### Added
- Quick Peek callout - compact popup anchored to field icons
- User filter dropdown in Quick Peek
- "View full history" link from Quick Peek to Deep Dive
- Config: `quickPeek.maxEntries` and `quickPeek.showUserFilter`

## [3.0.0] - 2026-03-10

### Added
- Portal injection architecture - React Portals render icons into field label containers
- MutationObserver for tab switches and lazy-loaded fields (500ms debounce)
- DOM scanning with Unified Interface GUID regex pattern
- Status indicator bar with field count

### Changed
- Rewritten from scratch as a virtual React control (was standard control in v2.x)

## [2.0.0] - 2026-03-08

### Added
- Initial public release - basic audit history panel for Dynamics 365

[3.4.4]: https://github.com/vp365ai/FieldAuditHistory/compare/v3.4.2...v3.4.4
[3.4.2]: https://github.com/vp365ai/FieldAuditHistory/compare/v3.4.1...v3.4.2
[3.4.1]: https://github.com/vp365ai/FieldAuditHistory/compare/v3.4.0...v3.4.1
[3.4.0]: https://github.com/vp365ai/FieldAuditHistory/compare/v3.3.0...v3.4.0
[3.3.0]: https://github.com/vp365ai/FieldAuditHistory/compare/v3.2.0...v3.3.0
[3.2.0]: https://github.com/vp365ai/FieldAuditHistory/compare/v3.1.0...v3.2.0
[3.1.0]: https://github.com/vp365ai/FieldAuditHistory/compare/v3.0.0...v3.1.0
[3.0.0]: https://github.com/vp365ai/FieldAuditHistory/compare/v2.0.0...v3.0.0
[2.0.0]: https://github.com/vp365ai/FieldAuditHistory/releases/tag/v2.0.0
