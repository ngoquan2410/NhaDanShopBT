package com.example.nhadanshop.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "ghn_quote_logs")
@Getter
@Setter
public class GhnQuoteLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "province_name", length = 200)
    private String provinceName;

    @Column(name = "district_name", length = 200)
    private String districtName;

    @Column(name = "ward_name", length = 200)
    private String wardName;

    @Column(name = "weight_grams")
    private Integer weightGrams;

    @Column(name = "subtotal", precision = 18, scale = 2)
    private BigDecimal subtotal;

    @Column(name = "ok", nullable = false)
    private boolean ok;

    @Column(name = "fee", precision = 18, scale = 2)
    private BigDecimal fee;

    @Column(name = "eta_min")
    private Integer etaMin;

    @Column(name = "eta_max")
    private Integer etaMax;

    @Column(name = "service_id")
    private Integer serviceId;

    @Column(name = "reason", length = 64)
    private String reason;

    @Column(name = "message", columnDefinition = "TEXT")
    private String message;

    @Column(name = "latency_ms")
    private Long latencyMs;

    @Column(name = "order_code", length = 100)
    private String orderCode;
}
