-- =============================================================================
-- YGS (Your German School) - Enterprise MySQL Database Schema (schema.sql)
-- =============================================================================

CREATE DATABASE IF NOT EXISTS ygs_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ygs_db;

-- DROP TABLES IF EXIST (Order handling foreign keys)
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS social_links;
DROP TABLE IF EXISTS website_content;
DROP TABLE IF EXISTS videos;
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS practice_answers;
DROP TABLE IF EXISTS practice_questions;
DROP TABLE IF EXISTS announcements;
DROP TABLE IF EXISTS feedback;
DROP TABLE IF EXISTS homework_submissions;
DROP TABLE IF EXISTS homework;
DROP TABLE IF EXISTS attendance;
DROP TABLE IF EXISTS payment_proofs;
DROP TABLE IF EXISTS students;
DROP TABLE IF EXISTS batches;
DROP TABLE IF EXISTS teachers;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS roles;
SET FOREIGN_KEY_CHECKS = 1;

-- 1. ROLES TABLE
CREATE TABLE roles (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(30) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. USERS TABLE
CREATE TABLE users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(30),
    role_id BIGINT NOT NULL,
    profile_image_url VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (role_id) REFERENCES roles(id),
    INDEX idx_user_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. COURSES TABLE
CREATE TABLE courses (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE, -- A1, A2, B1, B2, C1
    title VARCHAR(150) NOT NULL,
    description TEXT,
    duration_weeks INT NOT NULL,
    fee_amount DECIMAL(10, 2) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. TEACHERS TABLE
CREATE TABLE teachers (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE,
    qualification VARCHAR(150) NOT NULL,
    experience_years INT NOT NULL,
    specialization VARCHAR(150),
    languages_spoken VARCHAR(150),
    bio TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. BATCHES TABLE
CREATE TABLE batches (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    batch_number VARCHAR(50) NOT NULL UNIQUE,
    course_id BIGINT NOT NULL,
    teacher_id BIGINT NOT NULL,
    schedule_description VARCHAR(255) NOT NULL,
    meeting_link VARCHAR(255) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_completed BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (course_id) REFERENCES courses(id),
    FOREIGN KEY (teacher_id) REFERENCES teachers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. STUDENTS TABLE
CREATE TABLE students (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE,
    fb_profile VARCHAR(255),
    insta_profile VARCHAR(255),
    linkedin_profile VARCHAR(255),
    previous_knowledge VARCHAR(100),
    intended_course_id BIGINT NOT NULL,
    approval_status ENUM('PENDING', 'APPROVED', 'REJECTED') DEFAULT 'PENDING',
    batch_id BIGINT,
    teacher_comment TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (intended_course_id) REFERENCES courses(id),
    FOREIGN KEY (batch_id) REFERENCES batches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. PAYMENT_PROOFS TABLE
CREATE TABLE payment_proofs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    student_id BIGINT NOT NULL,
    file_url VARCHAR(255) NOT NULL,
    file_type VARCHAR(20) NOT NULL, -- PDF, JPG, PNG
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. ATTENDANCE TABLE
CREATE TABLE attendance (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    batch_id BIGINT NOT NULL,
    student_id BIGINT NOT NULL,
    class_date DATE NOT NULL,
    status ENUM('PRESENT', 'ABSENT', 'LATE') NOT NULL,
    remarks VARCHAR(255),
    FOREIGN KEY (batch_id) REFERENCES batches(id),
    FOREIGN KEY (student_id) REFERENCES students(id),
    UNIQUE KEY uq_attendance (batch_id, student_id, class_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. HOMEWORK TABLE
CREATE TABLE homework (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    batch_id BIGINT NOT NULL,
    teacher_id BIGINT NOT NULL,
    title VARCHAR(150) NOT NULL,
    instructions TEXT NOT NULL,
    attachment_url VARCHAR(255),
    due_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (batch_id) REFERENCES batches(id),
    FOREIGN KEY (teacher_id) REFERENCES teachers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 10. HOMEWORK_SUBMISSIONS TABLE
CREATE TABLE homework_submissions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    homework_id BIGINT NOT NULL,
    student_id BIGINT NOT NULL,
    submission_text TEXT,
    attachment_url VARCHAR(255),
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    grade VARCHAR(10),
    teacher_remarks TEXT,
    graded_at TIMESTAMP,
    FOREIGN KEY (homework_id) REFERENCES homework(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 11. FEEDBACK TABLE
CREATE TABLE feedback (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    student_id BIGINT NOT NULL,
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comments TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 12. ANNOUNCEMENTS TABLE
CREATE TABLE announcements (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    content TEXT NOT NULL,
    category ENUM('SESSION', 'NEW_COURSE', 'HOLIDAY', 'UPDATE') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 13. PRACTICE_QUESTIONS TABLE
CREATE TABLE practice_questions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    level VARCHAR(10) NOT NULL, -- A1, A2, B1, B2
    category ENUM('MCQ', 'FILL_BLANK', 'MATCHING', 'LISTENING', 'VOCABULARY', 'GRAMMAR', 'SENTENCE') NOT NULL,
    question_text TEXT NOT NULL,
    audio_url VARCHAR(255),
    option_a VARCHAR(255),
    option_b VARCHAR(255),
    option_c VARCHAR(255),
    option_d VARCHAR(255),
    correct_answer TEXT NOT NULL,
    explanation TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 14. REVIEWS TABLE (CMS)
CREATE TABLE reviews (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    author_name VARCHAR(100) NOT NULL,
    review_text TEXT NOT NULL,
    rating DECIMAL(2,1) DEFAULT 5.0,
    author_image_url VARCHAR(255),
    is_featured BOOLEAN DEFAULT TRUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 15. VIDEOS TABLE (CMS)
CREATE TABLE videos (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    youtube_url VARCHAR(255) NOT NULL,
    category VARCHAR(50) DEFAULT 'Tutorial'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 16. WEBSITE_CONTENT TABLE (CMS)
CREATE TABLE website_content (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    content_key VARCHAR(50) NOT NULL UNIQUE,
    content_value TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 17. SOCIAL_LINKS TABLE (CMS)
CREATE TABLE social_links (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    platform VARCHAR(30) NOT NULL UNIQUE,
    url VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 18. NOTIFICATIONS TABLE
CREATE TABLE notifications (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 19. AUDIT_LOGS TABLE
CREATE TABLE audit_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_email VARCHAR(100),
    action VARCHAR(100) NOT NULL,
    details TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
