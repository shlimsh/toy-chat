import mysql from "mysql2/promise";
import logger from "./logger.mjs";
import { config } from "./config.mjs";

const DB_HOST = config.mysql.host;
const DB_PORT = config.mysql.port;
const DB_USER = config.mysql.user;
const DB_PASSWORD = config.mysql.password;
const DB_NAME = config.mysql.database;
const DB_SSL_ENABLED =
  String(process.env.MYSQL_SSL || "").toLowerCase() === "true";

const poolConfig = {
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: "utf8mb4",
  connectTimeout: 10000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,

  timezone: "+09:00",
  dateStrings: true,
};

if (DB_SSL_ENABLED) {
  poolConfig.ssl = {
    rejectUnauthorized:
      String(process.env.MYSQL_SSL_REJECT_UNAUTHORIZED || "true").toLowerCase() !==
      "false",
  };
}

const pool = mysql.createPool(poolConfig);

export async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

export async function checkDatabase() {
  await query("SELECT 1 AS ok");
  return true;
}

export async function closeDatabase() {
  logger.info("db_pool_closing", {
    event: "db_pool_closing",
  });
  await pool.end();
  logger.info("db_pool_closed", {
    event: "db_pool_closed",
  });
}

export async function initDatabase() {
  logger.info("db_connect_try", {
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    database: DB_NAME,
    ssl: DB_SSL_ENABLED,
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
        ON DELETE CASCADE,
      INDEX idx_messages_conversation_created (conversation_id, created_at)
    )
  `);

  logger.info("db_initialized", {
    db_host: DB_HOST,
    db_name: DB_NAME,
  });
}

export default pool;
