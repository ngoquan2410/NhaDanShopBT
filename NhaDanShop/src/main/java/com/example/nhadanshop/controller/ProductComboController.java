package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.ProductComboRequest;
import com.example.nhadanshop.dto.ProductComboResponse;
import com.example.nhadanshop.service.ExcelTemplateService;
import com.example.nhadanshop.service.ProductComboService;
import com.example.nhadanshop.service.ExcelComboImportService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/combos")
@RequiredArgsConstructor
public class ProductComboController {

    private final ProductComboService comboService;
    private final ExcelTemplateService templateService;
    private final ExcelComboImportService comboImportService;

    /** GET /api/combos — Tất cả combo (kể cả inactive, dành cho admin) */
    @GetMapping
    public List<ProductComboResponse> list() {
        return comboService.listAll();
    }

    /** GET /api/combos/active — Combo đang hoạt động (dành cho bán hàng) */
    @GetMapping("/active")
    public List<ProductComboResponse> listActive() {
        return comboService.listActive();
    }

    /** GET /api/combos/{id} */
    @GetMapping("/{id}")
    public ProductComboResponse one(@PathVariable Long id) {
        return comboService.getOne(id);
    }

    /** POST /api/combos */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ProductComboResponse create(@Valid @RequestBody ProductComboRequest req) {
        return comboService.create(req);
    }

    /** PUT /api/combos/{id} */
    @PutMapping("/{id}")
    public ProductComboResponse update(@PathVariable Long id,
                                       @Valid @RequestBody ProductComboRequest req) {
        return comboService.update(id, req);
    }

    /** DELETE /api/combos/{id} */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        comboService.delete(id);
    }

    /** PATCH /api/combos/{id}/toggle */
    @PatchMapping("/{id}/toggle")
    public ProductComboResponse toggle(@PathVariable Long id) {
        return comboService.toggleActive(id);
    }

    /** GET /api/combos/template — Tải template Excel import combo */
    @GetMapping("/template")
    public ResponseEntity<byte[]> downloadTemplate() throws IOException {
        byte[] bytes = templateService.buildComboTemplate();
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
        headers.setContentDisposition(ContentDisposition.attachment()
                .filename("template_import_combo.xlsx").build());
        headers.setContentLength(bytes.length);
        return ResponseEntity.ok().headers(headers).body(bytes);
    }

    /** POST /api/combos/import-excel — Import combo từ file Excel */
    @PostMapping(value = "/import-excel", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> importExcel(@RequestParam("file") MultipartFile file)
            throws IOException {
        return comboImportService.importCombos(file);
    }
}
