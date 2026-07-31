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

async function ensureIndex({ table, name, columns }) {
  const rows = await query(
    `
    SELECT COUNT(*) AS index_count
    FROM information_schema.statistics
    WHERE table_schema = ?
      AND table_name = ?
      AND index_name = ?
    `,
    [DB_NAME, table, name]
  );

  if (Number(rows[0]?.index_count || 0) > 0) return false;

  const allowedDefinitions = {
    idx_conversations_user_updated_id:
      "ALTER TABLE conversations ADD INDEX idx_conversations_user_updated_id (user_id, updated_at, id)",
    idx_messages_conversation_id:
      "ALTER TABLE messages ADD INDEX idx_messages_conversation_id (conversation_id, id)",
  };
  const statement = allowedDefinitions[name];

  if (!statement || !Array.isArray(columns) || columns.length === 0) {
    throw new Error(`Unsupported index definition: ${name}`);
  }

  try {
    await query(statement);
    logger.info("db_index_created", {
      table,
      index: name,
      columns,
    });
    return true;
  } catch (error) {
    // 여러 서버 인스턴스가 동시에 시작해 같은 인덱스를 생성한 경우에는
    // 이미 목적이 달성되었으므로 초기화를 계속한다.
    if (String(error?.code || "").toUpperCase() === "ER_DUP_KEYNAME") {
      return false;
    }
    throw error;
  }
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
        ON DELETE CASCADE,
      INDEX idx_conversations_user_updated_id (user_id, updated_at, id)
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
      INDEX idx_messages_conversation_created (conversation_id, created_at),
      INDEX idx_messages_conversation_id (conversation_id, id)
    )
  `);

  await ensureIndex({
    table: "conversations",
    name: "idx_conversations_user_updated_id",
    columns: ["user_id", "updated_at", "id"],
  });
  await ensureIndex({
    table: "messages",
    name: "idx_messages_conversation_id",
    columns: ["conversation_id", "id"],
  });

  logger.info("db_initialized", {
    db_host: DB_HOST,
    db_name: DB_NAME,
  });
}

export default pool;
