package com.example.nhadanshop.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;
import java.time.ZoneId;

@Configuration
public class TimeConfig {

    public static final String BUSINESS_ZONE = "Asia/Ho_Chi_Minh";

    @Bean
    public ZoneId businessZoneId() {
        return ZoneId.of(BUSINESS_ZONE);
    }

    @Bean
    public Clock businessClock(ZoneId businessZoneId) {
        return Clock.system(businessZoneId);
    }
}
