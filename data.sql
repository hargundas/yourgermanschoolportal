-- =============================================================================
-- YGS (Your German School) - Enterprise Seed Data (data.sql)
-- =============================================================================

USE ygs_db;

-- 1. SEED ROLES
INSERT INTO roles (id, name) VALUES 
(1, 'ROLE_ADMIN'),
(2, 'ROLE_TEACHER'),
(3, 'ROLE_STUDENT');

-- 2. SEED ADMIN USER (Password: admin123 -> BCrypt Hashed)
INSERT INTO users (id, email, password, full_name, phone, role_id, is_active) VALUES 
(1, 'admin@ygs.com', '$2a$10$e7K4mE4tLp4j7A7Tj.5s0e4D4Z3W2Y1X0V9U8T7S6R5Q4P3O2N1M', 'YGS Super Admin', '+92 303 5580150', 1, TRUE);

-- 3. SEED COURSES
INSERT INTO courses (id, code, title, description, duration_weeks, fee_amount) VALUES 
(1, 'A1', 'German A1 - Foundational', 'Beginner level covering alphabet, basic introductions, daily vocabulary, and telling time.', 8, 250.00),
(2, 'A2', 'German A2 - Elementary', 'Elementary grammar, accusative/dative cases, past tenses, and daily conversation.', 10, 300.00),
(3, 'B1', 'German B1 - Intermediate', 'Complex clauses, letter writing, Goethe B1 exam prep for study and work permits.', 12, 400.00),
(4, 'B2', 'German B2 - Upper Intermediate', 'Advanced fluency, medical & engineering technical vocabulary, and university interview prep.', 14, 500.00),
(5, 'C1', 'German C1 - Advanced Professional', 'Native-level academic discussion, thesis writing, and professional medical licensing in Germany.', 16, 650.00);

-- 4. SEED TEACHER USERS & PROFILES
INSERT INTO users (id, email, password, full_name, phone, role_id, is_active) VALUES 
(2, 'hans.weber@ygs.com', '$2a$10$e7K4mE4tLp4j7A7Tj.5s0e4D4Z3W2Y1X0V9U8T7S6R5Q4P3O2N1M', 'Dr. Hans Weber', '+49 171 1234567', 2, TRUE),
(3, 'clara.schmidt@ygs.com', '$2a$10$e7K4mE4tLp4j7A7Tj.5s0e4D4Z3W2Y1X0V9U8T7S6R5Q4P3O2N1M', 'Clara Schmidt, M.A.', '+49 172 7654321', 2, TRUE);

INSERT INTO teachers (id, user_id, qualification, experience_years, specialization, languages_spoken, bio) VALUES 
(1, 2, 'Ph.D. in German Linguistics (Heidelberg University)', 12, 'B2/C1 Medical & Technical German', 'German, English, French', 'Senior examiner and certified Goethe instructor since 2012.'),
(2, 3, 'M.A. in TestDaF Pedagogy (Free University of Berlin)', 8, 'A1/A2 Grammar & Phonetics', 'German, English, Spanish', 'Specializes in interactive A1-B1 foundation building and conversational fluency.');

-- 5. SEED CMS CONTENT
INSERT INTO website_content (content_key, content_value) VALUES 
('mission', 'To empower international candidates with authentic, Goethe-standard German language skills for academic and career success.'),
('vision', 'To be the leading global online German language academy connecting students directly with higher education and professional careers in Germany.'),
('established_year', 'Working successfully since 2018.');

-- 6. SEED SOCIAL LINKS
INSERT INTO social_links (platform, url) VALUES 
('facebook', 'https://facebook.com/yourgermanschool'),
('instagram', 'https://instagram.com/yourgermanschool'),
('tiktok', 'https://tiktok.com/@yourgermanschool'),
('youtube', 'https://youtube.com/@yourgermanschool'),
('linkedin', 'https://linkedin.com/company/yourgermanschool');

-- 7. SEED REVIEWS (Google Reviews CMS)
INSERT INTO reviews (author_name, review_text, rating, is_featured) VALUES 
('Muhammad Ali', 'YGS helped me clear Goethe B1 in my first attempt! The teachers are top-notch.', 5.0, TRUE),
('Dr. Sarah Khan', 'The B2 Medical German course was extremely well structured for my nursing license in Munich.', 5.0, TRUE),
('Lukas Mueller', 'Best interactive practice hub and live class experience.', 5.0, TRUE);

-- 8. SEED SUGGESTED YOUTUBE VIDEOS (CMS)
INSERT INTO videos (title, youtube_url, category) VALUES 
('Mastering German Time Expressions (Uhrzeit)', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Grammar'),
('How to Pass Goethe A1 Exam in 30 Days', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Exam Prep');

-- 9. SEED PRACTICE QUESTIONS (German Practice Engine)
INSERT INTO practice_questions (level, category, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation) VALUES 
('A1', 'MCQ', 'Wie spät ist es bei 08:30 Uhr?', 'halb acht', 'halb neun', 'fünf nach acht', 'zwanzig nach acht', 'halb neun', 'In German, "halb" means half hour to the NEXT hour (08:30 = halb neun).'),
('A1', 'FILL_BLANK', 'Wie heiss___ du?', NULL, NULL, NULL, NULL, 't', 'The verb suffix for "du" is "-t" (heißt).'),
('A2', 'GRAMMAR', 'Welcher Kasus folgt nach der Präposition "mit"?', 'Nominativ', 'Akkusativ', 'Dativ', 'Genitiv', 'Dativ', '"Mit" always takes Dativ.');
