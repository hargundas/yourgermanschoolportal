package com.ygs;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
        System.out.println("=================================================");
        System.out.println("🇩🇪 YourGermanSchool (YGS) REST API Server Live!");
        System.out.println("   URL: http://localhost:8080/api/v1");
        System.out.println("=================================================");
    }
}
