import mysql from "mysql2/promise";
import logger from "./logger.mjs";

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || "192.168.16.153",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "toy_chat_user",
  password: process.env.MYSQL_PASSWORD || "1234",
  database: process.env.MYSQL_DATABASE || "toy_chat",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: "utf8mb4",
  connectTimeout: 10000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  ssl: {
    rejectUnauthorized: false,
  },
});

export async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

export async function initDatabase() {
  logger.info("db_connect_try", {
    host: process.env.MYSQL_HOST || "192.168.16.153",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "toy_chat_user",
    database: process.env.MYSQL_DATABASE || "toy_chat",
  });

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id VARCHAR(64) PRIMARY KEY,
      user_id BIGINT NOT NULL,
      title VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_conversations_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS messages (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      conversation_id VARCHAR(64) NOT NULL,
      role ENUM('system','user','assistant','tool') NOT NULL,
      content MEDIUMTEXT NOT NULL,
      metadata_json JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_messages_conversation
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
        ON DELETE CASCADE
    )
  `);

  logger.info("db_initialized", {
    db_host: process.env.MYSQL_HOST || "192.168.16.153",
    db_name: process.env.MYSQL_DATABASE || "toy_chat",
  });
}

export default pool;