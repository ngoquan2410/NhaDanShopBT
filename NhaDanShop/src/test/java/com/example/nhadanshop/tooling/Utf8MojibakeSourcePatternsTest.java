package com.example.nhadanshop.tooling;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Regression guard: common mojibake fragments should not appear in Java source.
 * Frontend runs {@code check-utf8-mojibake.mjs}; backend uses this lightweight check.
 */
class Utf8MojibakeSourcePatternsTest {

    @Test
    void knownGoodServiceFilePassesMojibakeSubstringChecks() throws Exception {
        Path p = Path.of("src/main/java/com/example/nhadanshop/service/PromotionRewardCalculator.java");
        assertTrue(Files.exists(p));
        String content = Files.readString(p);
        assertFalse(content.contains("Ã"));
        assertFalse(content.contains("Â"));
        assertFalse(content.contains("Ä"));
    }
}
