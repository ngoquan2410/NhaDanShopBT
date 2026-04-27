package com.example.nhadanshop.util;

import java.util.Locale;
import java.util.Set;

/**
 * Parse optional "Bán hàng?"/isSellable cells for Excel imports (product + receipt).
 * Blank/missing → not explicit, default true at call sites.
 */
public final class ImportSellableParser {

    private static final Set<String> TRUE_TOKENS = Set.of(
            "true", "1", "yes", "y", "co", "có", "ban", "bán", "sellable"
    );
    private static final Set<String> FALSE_TOKENS = Set.of(
            "false", "0", "no", "n", "khong", "không",
            "nguyen_lieu", "nguyên liệu", "raw", "inventory"
    );

    private ImportSellableParser() {}

    public static boolean isBlankCell(String raw) {
        return raw == null || raw.trim().isEmpty();
    }

    /**
     * @param value  parsed boolean when not blank and valid
     * @param invalid true when cell is non-blank but not a known token
     */
    public record Result(Boolean value, boolean explicit, boolean invalid) {}

    public static Result parse(String raw) {
        if (isBlankCell(raw)) {
            return new Result(null, false, false);
        }
        String key = raw.trim().toLowerCase(Locale.ROOT);
        if (TRUE_TOKENS.contains(key)) {
            return new Result(true, true, false);
        }
        if (FALSE_TOKENS.contains(key)) {
            return new Result(false, true, false);
        }
        return new Result(null, true, true);
    }

    public static boolean defaultTrue(Boolean parsed) {
        return parsed == null || parsed;
    }
}
