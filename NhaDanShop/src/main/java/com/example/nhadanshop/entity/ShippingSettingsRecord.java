package com.example.nhadanshop.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "shipping_settings")
@Getter
@Setter
public class ShippingSettingsRecord {

    public static final long SINGLETON_ID = 1L;

    @Id
    private Long id = SINGLETON_ID;

    @Column(name = "zone_rules_json", nullable = false, columnDefinition = "TEXT")
    private String zoneRulesJson;

    @Column(name = "parcel_defaults_json", nullable = false, columnDefinition = "TEXT")
    private String parcelDefaultsJson;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();
}
