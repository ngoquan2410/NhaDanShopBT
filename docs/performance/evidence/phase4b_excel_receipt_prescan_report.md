# Phase 4B — Excel receipt preview/import Pass 1 prescan + bulk preload

## 1. Scope completed

- `ExcelReceiptImportService`: prescan of SP-Don sheet rows to collect distinct product codes (uppercase) and variant codes (normalized lower-case key).
- Bulk load: `ProductRepository.findByCodeIn`, `ProductVariantRepository.findByVariantCodeLowerIn`, `ProductVariantRepository.findByProductIdsOrderedForReceiptExcel`.
- Combo rows on sheet: component product IDs merged via `ProductComboRepository.findByComboProduct_IdIn` so component default variants are included in the variant list map (same as Phase 4A-style expansion data needs).
- **Preview** (`parseSingleSheet`): all per-row `findByCode` / `findByVariantCodeIgnoreCase` / `findByProductIdOrderByIsDefaultDescVariantCodeAsc` replaced with map lookups.
- **Import Pass 1** (same sheet loop): same catalog maps; combo line default variant resolved from maps with fallback `findByProductIdAndIsDefaultTrue` if no default in bulk list.
- `buildBlankVariantCodeWarning` / `maybeAddPass1VariantCodeWarning` use preloaded ordered variant lists (no per-warning query).
- **Out of scope (unchanged)**: `ExcelImportService` (Phase 4C), Pass 2 DB writes, `StockMutationService`, `InventoryReceiptService.createReceipt` (beyond any compile compatibility), API/DTO/FE, migrations.

## 2. Files changed

| File | Change |
|------|--------|
| `NhaDanShop/src/main/java/com/example/nhadanshop/repository/ProductRepository.java` | `findByCodeIn(Collection<String>)` |
| `NhaDanShop/src/main/java/com/example/nhadanshop/repository/ProductVariantRepository.java` | `findByVariantCodeLowerIn`, `findByProductIdsOrderedForReceiptExcel` |
| `NhaDanShop/src/main/java/com/example/nhadanshop/service/ExcelReceiptImportService.java` | `SpDonCatalogMaps`, `buildSpDonCatalogMaps`, `normalizeVariantCodeKey`; preview + Pass 1 use maps |
| `NhaDanShop/src/test/java/com/example/nhadanshop/integration/Phase4ReceiptExcelEvidenceIntegrationTest.java` | Assert preview `prepareStatementCount` ≤ 15 + comment on before/after |
| `docs/performance/evidence/phase4b_excel_receipt_prescan_report.md` | This report |

## 3. Prescan / context design

1. **Scan** (same row rules as parse: `findDataStartRow`, `detectNewFormat`, skip empty/legend rows): collect unique `productCode.trim().toUpperCase(ROOT)` and unique `normalizeVariantCodeKey` for non-blank column B (new format only).
2. **Load products**: `findByCodeIn(productCodes)`.
3. **Expand product ID set**: all loaded products + for each combo among loaded products, component `product.id` from `findByComboProduct_IdIn(comboIds)`.
4. **Load variants**:
   - By product IDs: `findByProductIdsOrderedForReceiptExcel` — order `product.id`, `isDefault DESC`, `variantCode ASC` (matches existing single-product ordering).
   - By variant codes: `findByVariantCodeLowerIn` with JOIN FETCH product; map key `normalizeVariantCodeKey(variantCode)`; `putIfAbsent` for collisions.
5. **Context maps**:
   - `productByUpperCode`
   - `variantByNormalizedCode`
   - `variantsByProductId` → `List<ProductVariant>` in default-first order

**Scaling**: DB round-trips scale with **distinct** sheet codes and combo expansion, not row count **N** when codes repeat.

## 4. Query-in-loop removed

| Previous (per row / per warning) | New |
|----------------------------------|-----|
| `productRepository.findByCode(upper)` | `productByUpperCode.get(upper)` |
| `variantRepo.findByVariantCodeIgnoreCase(...)` | `variantByNormalizedCode.get(key)` |
| `variantRepo.findByProductIdOrderByIsDefaultDescVariantCodeAsc(productId)` | `variantsByProductId.getOrDefault(productId, List.of())` |
| `buildBlankVariantCodeWarning` → repo load variants | Uses list from `variantsByProductId` |

## 5. Query count before / after

Measured via `HibernateStatementStatsHelper.prepareStatementCount` in `Phase4ReceiptExcelEvidenceIntegrationTest.excel_receipt_preview_statementCount` (H2, `generate_statistics=true`), fixture: **N distinct** products/variants, new-format header + column B.

| N rows | Before (Phase 4 evidence) | After (Phase 4B) | Pass |
|--------|---------------------------|------------------|------|
| 10 | 31 | 4 | Pass |
| 50 | 151 | 4 | Pass |
| 100 | 301 | 4 | Pass |

Test assertion: `prepareStatementCount` ≤ 15 (headroom for dialect/Hibernate variance).

## 6. Row-level validation parity (intended)

- **Product missing / new product**: still driven by map miss + same name/category messages.
- **Variant missing**: explicit code not in `variantByNormalizedCode` → same branches as empty optional.
- **Wrong-product variant**: still compare `ev.getProduct().getId()` to row product.
- **No variant code / smart-match**: same list order and importUnit logic on `variantsByProductId` list.
- **Malformed qty/price/discount/sellable**: unchanged (cell parsing first).
- **Warnings** (`buildBlankVariantCodeWarning`): same text; variant count comes from preloaded list.

Case-insensitive variant matching: `LOWER(v.variantCode) IN :lowers` + same normalization as `findByVariantCodeIgnoreCase` for typical ASCII/Vietnamese identifiers.

## 7. Import path impact

- **Pass 1** uses the same `buildSpDonCatalogMaps(sheet)` once per import file (SP Don sheet).
- **Pass 2** unchanged: receipt create + existing stock mutation path.
- Preview-only API still does not mutate stock.

## 8. Tests run

- `.\gradlew.bat test --tests "com.example.nhadanshop.integration.Phase4ReceiptExcelEvidenceIntegrationTest.excel_receipt_preview_statementCount"` — PASS; logged `prepareStatements=4` for N=10,50,100.
- `.\gradlew.bat test --tests "com.example.nhadanshop.integration.Phase4ReceiptExcelEvidenceIntegrationTest" --tests "com.example.nhadanshop.integration.Phase4aReceiptCreateQueryCountIntegrationTest" --tests "com.example.nhadanshop.service.ReceiptDeletionLockingIntegrationTest" --tests "com.example.nhadanshop.integration.Phase6BeDomainRegressionIntegrationTest"` — PASS.
- `.\gradlew.bat test --tests "com.example.nhadanshop.service.ExcelReceiptImportServiceSlice5IntegrationTest"` — PASS (preview + import Pass 1/2 parity smoke).

## 9. API / FE changed?

**No.** DTOs and response shapes unchanged.

## 10. Business semantics changed?

**No.** Receipt confirmed-on-create, variant resolution rules, row error/warning messages, and import payload shape preserved; only data access pattern changed.

## 11. Known deferred

- **Phase 4C**: `ExcelImportService` product import — separate task.
- `parseComboSheet` (combo preview sheet) not bulk-optimized in this phase (combo Excel receipt path remains limited/disabled as before).

## 12. Final verdict

**Go.** Excel receipt preview no longer exhibits ~`3N+1` prepared-statement scaling for the Phase 4 fixture; counts are bounded (observed **4** vs former **31/151/301**). Semantics and API remain aligned with pre-4B behavior.
