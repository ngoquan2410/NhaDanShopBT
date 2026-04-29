package com.example.nhadanshop.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.IntStream;

/**
 * Deterministic VND allocation: floor proportional shares, distribute remainder by largest fractional part,
 * tie-break by stable line order (then index).
 */
public final class CommercialDiscountAllocationService {

    private CommercialDiscountAllocationService() {}

    public static List<BigDecimal> allocate(
            BigDecimal bucket,
            List<BigDecimal> basesPerLine,
            List<Boolean> eligible
    ) {
        int n = basesPerLine.size();
        if (n == 0) {
            return List.of();
        }
        if (eligible.size() != n) {
            throw new IllegalArgumentException("eligible size must match bases");
        }
        bucket = nz(bucket).max(BigDecimal.ZERO);
        if (bucket.compareTo(BigDecimal.ZERO) <= 0) {
            return zeros(n);
        }

        BigDecimal eligibleSum = BigDecimal.ZERO;
        for (int i = 0; i < n; i++) {
            if (eligible.get(i)) {
                eligibleSum = eligibleSum.add(nz(basesPerLine.get(i)).max(BigDecimal.ZERO));
            }
        }
        if (eligibleSum.compareTo(BigDecimal.ZERO) <= 0) {
            return zeros(n);
        }

        BigDecimal toAllocate = bucket.min(eligibleSum);
        List<BigDecimal> rawExact = new ArrayList<>(n);
        List<BigDecimal> floors = new ArrayList<>(n);

        for (int i = 0; i < n; i++) {
            if (!eligible.get(i)) {
                rawExact.add(BigDecimal.ZERO);
                floors.add(BigDecimal.ZERO);
                continue;
            }
            BigDecimal wi = nz(basesPerLine.get(i)).max(BigDecimal.ZERO);
            BigDecimal exact = toAllocate.multiply(wi).divide(eligibleSum, 10, RoundingMode.HALF_UP);
            rawExact.add(exact);
            floors.add(exact.setScale(0, RoundingMode.FLOOR));
        }

        BigDecimal sumFloors = floors.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        int remainder = toAllocate.subtract(sumFloors).intValueExact();
        if (remainder < 0) {
            throw new IllegalStateException("Allocation floor sum exceeds bucket");
        }

        List<Integer> eligibleIndices = IntStream.range(0, n)
                .filter(i -> eligible.get(i))
                .boxed()
                .sorted(Comparator
                        .<Integer>comparingDouble(i -> rawExact.get(i).subtract(floors.get(i)).doubleValue())
                        .reversed()
                        .thenComparingInt(i -> i))
                .toList();

        List<BigDecimal> out = new ArrayList<>(floors);
        for (int k = 0; k < remainder && k < eligibleIndices.size(); k++) {
            int idx = eligibleIndices.get(k);
            out.set(idx, out.get(idx).add(BigDecimal.ONE));
        }

        BigDecimal allocated = out.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        if (allocated.compareTo(toAllocate) != 0) {
            throw new IllegalStateException("Allocation does not sum to bucket: " + allocated + " vs " + toAllocate);
        }
        return out;
    }

    private static List<BigDecimal> zeros(int n) {
        List<BigDecimal> z = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            z.add(BigDecimal.ZERO);
        }
        return z;
    }

    private static BigDecimal nz(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }
}
