package com.example.nhadanshop.service;

import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.Promotion;
import com.example.nhadanshop.entity.PromotionBuyItem;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Shared rules for BUY_X_GET_Y and QUANTITY_GIFT — same math in cart evaluation and sales quote rewards.
 */
public final class PromotionRewardCalculator {

    private PromotionRewardCalculator() {}

    public record BuyRequirement(long productId, int buyQty) {}

    public static List<BuyRequirement> buyRequirements(Promotion p) {
        if (p == null || !"BUY_X_GET_Y".equals(p.getType())) {
            return List.of();
        }
        if (p.getBuyItems() != null && !p.getBuyItems().isEmpty()) {
            return p.getBuyItems().stream()
                    .sorted(Comparator
                            .comparing(PromotionBuyItem::getSortOrder)
                            .thenComparing(bi -> bi.getId() != null ? bi.getId() : 0L))
                    .map(bi -> new BuyRequirement(bi.getProduct().getId(), Math.max(bi.getBuyQty(), 1)))
                    .toList();
        }
        if (p.getProducts() == null || p.getProducts().isEmpty()) {
            return List.of();
        }
        int x = p.getBuyQty() != null && p.getBuyQty() > 0 ? p.getBuyQty() : 1;
        return p.getProducts().stream()
                .map(pr -> new BuyRequirement(pr.getId(), x))
                .toList();
    }

    /**
     * {@code qtyByProduct}: paid qty per productId within promotion scope (same as scoped cart lines).
     */
    public static int buyXGetYTimes(Promotion p, Map<Long, Integer> qtyByProduct) {
        List<BuyRequirement> req = buyRequirements(p);
        if (req.isEmpty()) {
            return 0;
        }
        boolean repeatable = Boolean.TRUE.equals(p.getRepeatable());
        int minRatio = Integer.MAX_VALUE;
        for (BuyRequirement br : req) {
            int have = qtyByProduct.getOrDefault(br.productId(), 0);
            int need = Math.max(br.buyQty(), 1);
            minRatio = Math.min(minRatio, have / need);
        }
        if (minRatio <= 0 || minRatio == Integer.MAX_VALUE) {
            return 0;
        }
        return repeatable ? minRatio : 1;
    }

    public static int quantityGiftTimes(Promotion p, Map<Long, Integer> qtyByProduct) {
        if (p == null || !"QUANTITY_GIFT".equals(p.getType())) {
            return 0;
        }
        Set<Long> triggers = p.getProducts() == null
                ? Set.of()
                : p.getProducts().stream().map(Product::getId).collect(Collectors.toSet());
        int minB = p.getMinBuyQty() != null && p.getMinBuyQty() > 0 ? p.getMinBuyQty() : 1;
        if (triggers.isEmpty()) {
            int totalQty = qtyByProduct.values().stream().mapToInt(Integer::intValue).sum();
            if (totalQty < minB) {
                return 0;
            }
            return capByMaxApplications(1, p.getMaxBuyQty());
        }
        int eligible = 0;
        for (Long tid : triggers) {
            eligible += qtyByProduct.getOrDefault(tid, 0);
        }
        if (eligible < minB) {
            return 0;
        }
        boolean repeatable = Boolean.TRUE.equals(p.getRepeatable());
        int times = repeatable ? eligible / minB : 1;
        return capByMaxApplications(times, p.getMaxBuyQty());
    }

    public static int capByMaxApplications(int times, Integer maxApplications) {
        if (maxApplications == null || maxApplications <= 0) {
            return times;
        }
        return Math.min(times, maxApplications);
    }
}
