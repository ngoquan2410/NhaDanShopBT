package com.example.nhadanshop;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.util.TimeZone;

@SpringBootApplication
@EnableScheduling
public class NhaDanShopApplication {

    public static void main(String[] args) {
        // ── Đặt JVM timezone = UTC+7 TRƯỚC KHI Spring khởi động ──────────────
        // EC2 server mặc định UTC → tất cả LocalDateTime.now() sẽ dùng UTC+7
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Ho_Chi_Minh"));
        SpringApplication.run(NhaDanShopApplication.class, args);
    }

}
