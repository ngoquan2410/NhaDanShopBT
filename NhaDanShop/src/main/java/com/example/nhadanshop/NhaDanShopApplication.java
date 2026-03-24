package com.example.nhadanshop;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class NhaDanShopApplication {

    public static void main(String[] args) {
        SpringApplication.run(NhaDanShopApplication.class, args);
    }

}
