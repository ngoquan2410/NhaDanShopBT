package com.example.nhadanshop.exception;

import com.example.nhadanshop.service.ExcelReceiptImportService;
import jakarta.persistence.EntityNotFoundException;
import jakarta.persistence.PersistenceException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.orm.jpa.JpaSystemException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.Map;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    /**
     * Xử lý lỗi validate file Excel import phiếu nhập kho.
     * HTTP 422 Unprocessable Entity — trả về danh sách lỗi từng dòng để admin sửa.
     */
    @ExceptionHandler(ExcelReceiptImportService.ExcelImportValidationException.class)
    public ProblemDetail handleExcelValidation(ExcelReceiptImportService.ExcelImportValidationException ex) {
        ProblemDetail pd = ProblemDetail.forStatus(HttpStatus.UNPROCESSABLE_ENTITY);
        pd.setTitle("File Excel có lỗi — không thể import");
        pd.setDetail("Phát hiện " + ex.getValidationErrors().size()
                + " lỗi trong file. Vui lòng kiểm tra và sửa trước khi import lại.");
        pd.setProperty("validationErrors", ex.getValidationErrors());
        pd.setProperty("errorCount", ex.getValidationErrors().size());
        pd.setProperty("hint", "Toàn bộ file bị huỷ — không có dòng nào được lưu. Sửa tất cả lỗi rồi upload lại.");
        return pd;
    }

    @ExceptionHandler(EntityNotFoundException.class)
    public ProblemDetail handleNotFound(EntityNotFoundException ex) {
        ProblemDetail pd = ProblemDetail.forStatus(HttpStatus.NOT_FOUND);
        pd.setDetail(ex.getMessage());
        return pd;
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ProblemDetail handleBadRequest(IllegalArgumentException ex) {
        ProblemDetail pd = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
        pd.setDetail(ex.getMessage());
        return pd;
    }

    @ExceptionHandler(IllegalStateException.class)
    public ProblemDetail handleConflict(IllegalStateException ex) {
        ProblemDetail pd = ProblemDetail.forStatus(HttpStatus.CONFLICT);
        pd.setDetail(ex.getMessage());
        return pd;
    }

    @ExceptionHandler(BusinessConflictException.class)
    public ProblemDetail handleBusinessConflict(BusinessConflictException ex) {
        ProblemDetail pd = ProblemDetail.forStatus(HttpStatus.CONFLICT);
        pd.setDetail(ex.getMessage());
        pd.setProperty("code", ex.getCode());
        return pd;
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ProblemDetail handleDataIntegrityViolation(DataIntegrityViolationException ex) {
        log.error("Data integrity violation", ex);
        String root = ex.getMostSpecificCause() != null
                ? ex.getMostSpecificCause().getMessage()
                : ex.getMessage();
        String lower = root != null ? root.toLowerCase() : "";
        if (lower.contains("uk_users_customer_id")) {
            ProblemDetail pd = ProblemDetail.forStatus(HttpStatus.CONFLICT);
            pd.setDetail("Số điện thoại này đã được đăng ký tài khoản. Vui lòng đăng nhập hoặc dùng số khác.");
            pd.setProperty("code", "PHONE_ALREADY_REGISTERED");
            return pd;
        }
        ProblemDetail pd = ProblemDetail.forStatus(HttpStatus.CONFLICT);
        pd.setDetail("Dữ liệu bị trùng hoặc vi phạm ràng buộc nghiệp vụ.");
        return pd;
    }

    @ExceptionHandler({DataAccessException.class, JpaSystemException.class, PersistenceException.class})
    public ProblemDetail handleDataAccessLayer(Exception ex) {
        log.error("Data access error", ex);
        ProblemDetail pd = ProblemDetail.forStatus(HttpStatus.INTERNAL_SERVER_ERROR);
        pd.setDetail("Lỗi hệ thống. Vui lòng thử lại hoặc liên hệ quản trị.");
        return pd;
    }

    @ExceptionHandler(ProductionShortageException.class)
    public ProblemDetail handleProductionShortage(ProductionShortageException ex) {
        ProblemDetail pd = ProblemDetail.forStatus(HttpStatus.CONFLICT);
        pd.setTitle("Thiếu nguyên liệu sản xuất");
        pd.setDetail(ex.getMessage());
        pd.setProperty("shortages", ex.getShortages());
        return pd;
    }

    /** BadCredentialsException từ AuthService (sai mật khẩu, OTP sai...) */
    @ExceptionHandler(BadCredentialsException.class)
    public ProblemDetail handleBadCredentials(BadCredentialsException ex) {
        ProblemDetail pd = ProblemDetail.forStatus(HttpStatus.UNAUTHORIZED);
        pd.setDetail(ex.getMessage());
        pd.setProperty("message", ex.getMessage());
        return pd;
    }

    /** Tài khoản bị vô hiệu hóa */
    @ExceptionHandler(DisabledException.class)
    public ProblemDetail handleDisabled(DisabledException ex) {
        ProblemDetail pd = ProblemDetail.forStatus(HttpStatus.UNAUTHORIZED);
        pd.setDetail(ex.getMessage());
        pd.setProperty("message", ex.getMessage());
        return pd;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
        ProblemDetail pd = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
        pd.setDetail("Dữ liệu không hợp lệ");
        Map<String, String> errors = new HashMap<>();
        for (FieldError fe : ex.getBindingResult().getFieldErrors()) {
            errors.put(fe.getField(), fe.getDefaultMessage());
        }
        pd.setProperty("fieldErrors", errors);
        return pd;
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ProblemDetail handleAccessDenied(AccessDeniedException ex) {
        ProblemDetail pd = ProblemDetail.forStatus(HttpStatus.FORBIDDEN);
        pd.setDetail("Bạn không có quyền thực hiện thao tác này");
        return pd;
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ProblemDetail handleResponseStatus(ResponseStatusException ex) {
        HttpStatus status = HttpStatus.resolve(ex.getStatusCode().value());
        if (status == null) {
            status = HttpStatus.INTERNAL_SERVER_ERROR;
        }
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(status, ex.getReason() != null ? ex.getReason() : status.getReasonPhrase());
        return pd;
    }

    @ExceptionHandler(Exception.class)
    public ProblemDetail handleGeneral(Exception ex) {
        log.error("Unhandled exception", ex);
        ProblemDetail pd = ProblemDetail.forStatus(HttpStatus.INTERNAL_SERVER_ERROR);
        pd.setDetail("Lỗi hệ thống. Vui lòng thử lại hoặc liên hệ quản trị.");
        return pd;
    }
}
